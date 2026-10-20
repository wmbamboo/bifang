/**
 * 十八·15.3.4 / 二十二·4–5：按 paragraph.level 写 w:pStyle；TOC 动态化。
 * plan 口径必须与 applyHeadingLevels 收集的「会带数字 pStyle 的标题段」一致：
 * 模板渲染后章为 style=1（被 n<2 排除），段才进 paras —— 故 plan 只 push 段，不 push 章/points。
 */
import type PizZip from "pizzip";
import type {Chapter} from "@/components/DocUtil/ViewItem4Doc";

/** 从大纲结构推断实际最深标题级（段=level；points 折进提示时不抬 TOC） */
export function inferDocMaxHeadingLevel(chapters: Chapter[]): number {
  let m = 2;
  for (const ch of chapters || []) {
    for (const p of ch.paragraphs || []) {
      const pl = Math.max(2, Math.min(9, p.level || 3));
      m = Math.max(m, pl);
    }
  }
  // 至少覆盖章（渲染为 1）与段；TOC 用
  return Math.min(9, Math.max(2, m));
}

/**
 * 只收录「会产生带数字 pStyle 的标题段」——当前即段落。
 * 章由模板渲成 style=1，applyHeadingLevels 以 n<2 排除；points 无 pStyle。
 * 二者若将来改成真标题，必须与 applyHeadingLevels 过滤条件同步放开。
 */
export function buildHeadingLevelPlan(
  chapters: Chapter[],
  maxLevel?: number,
): Array<{level: number}> {
  const L = Math.max(
    1,
    Math.min(9, Math.round(maxLevel ?? inferDocMaxHeadingLevel(chapters)) || 3),
  );
  const plan: Array<{level: number}> = [];
  for (const ch of chapters || []) {
    for (const p of ch.paragraphs || []) {
      if (p.container) continue;
      const pl = Math.min(Math.max(2, p.level || 3), L);
      plan.push({level: pl});
    }
  }
  return plan;
}

/** 把 TOC 域 `\o "1-N"` 改成当前 maxLevel */
export function patchTocOutlineLevels(zip: PizZip, maxLevel: number): void {
  const L = Math.max(1, Math.min(9, Math.round(maxLevel) || 3));
  const docFile = zip.file("word/document.xml");
  if (!docFile) return;
  let xml = docFile.asText();
  const next = xml.replace(/TOC \\o "1-\d+"/g, `TOC \\o "1-${L}"`);
  if (next !== xml) zip.file("word/document.xml", next);
}

export type ApplyHeadingLevelsResult = {
  ok: boolean;
  warning?: string;
  /** paras 数 - plan 数；0 表示对齐 */
  mismatched?: number;
};

/**
 * 按 plan 顺序改写正文里已有数字样式标题（跳过封面/章 style=1 与 TOC*）。
 * 不等长时 ok=false，仍按较短一侧尽力应用，并暴露计数（二十二·4）。
 */
export function applyHeadingLevels(
  zip: PizZip,
  plan: Array<{level: number}>,
): ApplyHeadingLevelsResult {
  const docFile = zip.file("word/document.xml");
  if (!docFile) return {ok: false, warning: "无 document.xml"};
  let xml = docFile.asText();
  const re = /<w:p\b[\s\S]*?<\/w:p>/g;
  const paras: Array<{start: number; end: number}> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[0];
    if (/w:pStyle w:val="TOC/i.test(block)) continue;
    const sm = block.match(/<w:pStyle w:val="(\d+)"/);
    if (!sm) continue;
    const n = parseInt(sm[1], 10);
    if (n < 2 || n > 9) continue;
    paras.push({start: m.index, end: m.index + block.length});
  }
  if (!paras.length || !plan.length) {
    return {
      ok: false,
      warning: `标题段 ${paras.length} ≠ plan ${plan.length}，跳过 applyHeadingLevels`,
      mismatched: paras.length - plan.length,
    };
  }
  const mismatched = paras.length - plan.length;
  const n = Math.min(paras.length, plan.length);
  for (let i = n - 1; i >= 0; i--) {
    const a = paras[i];
    const level = Math.max(1, Math.min(9, plan[i].level || 3));
    const block = xml.slice(a.start, a.end);
    const next = block.replace(
      /<w:pStyle w:val="\d+"/,
      `<w:pStyle w:val="${level}"`,
    );
    xml = xml.slice(0, a.start) + next + xml.slice(a.end);
  }
  zip.file("word/document.xml", xml);
  if (mismatched !== 0) {
    const warning =
      `标题段 ${paras.length} ≠ plan ${plan.length}（Δ=${mismatched}），已按较短一侧应用；` +
      `请检查 buildHeadingLevelPlan 是否误含章/points`;
    console.warn("[applyHeadingLevels]", warning);
    return {ok: false, warning, mismatched};
  }
  return {ok: true, mismatched: 0};
}

/**
 * 二十六·A：去掉 heading 1–9 样式上的自动编号（numPr），
 * 避免与 applyDocHeadingNumbers 写入 label 的手写编号叠加（如「11」「1.1.11.1」）。
 * 不碰 TOC Heading / 中文公文样式（a/a0…）及其它非 heading 样式。
 */
export function stripHeadingAutoNumbering(zip: PizZip): number {
  const f = zip.file("word/styles.xml");
  if (!f) return 0;
  let xml = f.asText();
  let n = 0;
  xml = xml.replace(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g, (block) => {
    const name = (block.match(/<w:name\b[^>]*\bw:val="([^"]+)"/) || [])[1] || "";
    if (!/^heading [1-9]$/.test(name)) return block;
    // 含自闭合 <w:numPr/>（Word 另存后可能出现）
    const next = block.replace(
      /<w:numPr\b[^>]*(?:\/>|>[\s\S]*?<\/w:numPr>)/,
      "",
    );
    if (next !== block) n += 1;
    return next;
  });
  if (n) zip.file("word/styles.xml", xml);
  return n;
}
