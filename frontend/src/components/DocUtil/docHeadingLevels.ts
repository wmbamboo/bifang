/**
 * 十八·15.3.4 / P1-a：按 paragraph.level 写 w:pStyle；TOC \o "1-{maxLevel}" 动态化。
 * 纯 zip 后处理，不改模板循环。
 */
import type PizZip from "pizzip";
import type {Chapter} from "@/components/DocUtil/ViewItem4Doc";

/** 从大纲结构推断实际最深标题级（章=2，段=level，要点=level+1） */
export function inferDocMaxHeadingLevel(chapters: Chapter[]): number {
  let m = 2;
  for (const ch of chapters || []) {
    for (const p of ch.paragraphs || []) {
      const pl = Math.max(2, Math.min(9, p.level || 3));
      m = Math.max(m, pl);
      if ((p.points || []).length) m = Math.max(m, Math.min(9, pl + 1));
    }
  }
  return Math.min(9, Math.max(1, m));
}

/**
 * 与模板展开顺序一致：章标题 → 段标题 →（未折进 guide 的）points 标签。
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
    plan.push({level: Math.min(2, L)});
    for (const p of ch.paragraphs || []) {
      const pl = Math.min(Math.max(2, p.level || 3), L);
      plan.push({level: pl});
      for (const _ of p.points || []) {
        plan.push({level: Math.min(pl + 1, L)});
      }
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
  // 模板原文：TOC \o "1-3"
  const next = xml.replace(/TOC \\o "1-\d+"/g, `TOC \\o "1-${L}"`);
  if (next !== xml) zip.file("word/document.xml", next);
}

/**
 * 按 plan 顺序改写正文里已有数字样式标题（跳过封面 style=1 与 TOC*）。
 */
export function applyHeadingLevels(
  zip: PizZip,
  plan: Array<{level: number}>,
): {ok: boolean; warning?: string} {
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
    };
  }
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
  return {
    ok: true,
    warning:
      paras.length !== plan.length
        ? `标题段 ${paras.length} ≠ plan ${plan.length}，已按较短一侧应用`
        : undefined,
  };
}
