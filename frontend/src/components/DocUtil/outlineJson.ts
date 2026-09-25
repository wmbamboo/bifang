/** PPT 大纲 JSON 契约：结构段 / 填充段（不依赖 ViewItem4Ppt，避免循环引用） */

import {normalizeMetricListTipsArray} from "@/components/DocUtil/outlineMetricNormalize";
import {
  dropDuplicateColSub,
  findDuplicateTips,
  validateTipsAgainstEvidence,
  CATEGORY_TITLE_RE,
  CATEGORY_CLAIM_RE,
  DAPAN_CLAIM_RE,
  normalizeSlideIntent,
  resolveSlideIntent,
} from "@/components/DocUtil/outlineEvidenceValidate";
import {
  findMetaDiagnosticTips,
  metaDiagnosticBanClause,
  metaDiagnosticRetryHint,
  textHasMetaDiagnostic,
  META_DIAGNOSTIC_TIP_RE,
} from "@/components/DocUtil/outlineMetaDiagnostic";
import {
  checkColumnAxisEvidence,
  findUnsupportedActionSlideTitles,
} from "@/components/DocUtil/outlineCoverage";

export {
  findMetaDiagnosticTips,
  metaDiagnosticBanClause,
  metaDiagnosticRetryHint,
  textHasMetaDiagnostic,
  META_DIAGNOSTIC_TIP_RE,
};

export type OutlineStructureJson = {
  title: string;
  chapters: Array<{
    title: string;
    subtitle?: string;
    slides: Array<{ title: string }>;
  }>;
};

export type OutlineFilledJson = {
  title: string;
  chapters: Array<{
    title: string;
    subtitle?: string;
    slides: Array<{
      title: string;
      layout?: string;
      /** 页意图（选型阶段声明；缺省时忠实度校验用标题降级） */
      intent?: string;
      tips?: string[];
    }>;
  }>;
};

const LAYOUTS = [
  "list",
  "metric",
  "columns",
  "metric_columns",
  "metric_list",
  "table",
  "image_grid",
] as const;

export type OutlineJsonLayout = (typeof LAYOUTS)[number];

/** 渲染用版式（table / image_grid 已接模板页 42/43） */
export function layoutForRender(layout: OutlineJsonLayout): OutlineJsonLayout {
  return layout;
}

export function normalizeSlideLayout(raw: string | undefined): OutlineJsonLayout {
  const t = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (t === "column") return "columns";
  if (t === "metrics") return "metric";
  if (t === "imagegrid" || t === "grid") return "image_grid";
  if ((LAYOUTS as readonly string[]).includes(t)) return t as OutlineJsonLayout;
  return "list";
}

/**
 * 按页标题做轻量结构纠偏（不写领域词表）：
 * - 问句式枚举、或以「类型/清单/话题」收尾的平铺页 → 不宜 columns
 * - 无明显「看数」线索时不宜硬上 metric*
 */
export function coerceLayoutBySlideTitle(
  title: string,
  layout: OutlineJsonLayout,
): OutlineJsonLayout {
  const t = String(title || "");
  const enumQuestion = /(?:是什么|有哪些|哪几|哪些|怎么看|如何选)/.test(t);
  const multiAxisHint =
    /对照|对比|几种|三类|三种|两大|几大|多维|分轴|vs|打法总览|打法一览/i.test(t);
  // 「…类型/清单/话题」多为平铺分类，不是分轴对照（但「三种××」总览除外）
  const flatInventory =
    !multiAxisHint &&
    (/(?:类型|清单|名单|话题|盘点)$/.test(t) ||
      /(?:类型|清单|名单|话题|盘点)(?:有哪些|是什么)?$/.test(t));
  if (
    (enumQuestion || flatInventory) &&
    !multiAxisHint &&
    (layout === "columns" || layout === "metric_columns")
  ) {
    return "list";
  }
  // 「三种/几大…」总览：若被标成 list，抬回 columns
  if (multiAxisHint && (layout === "list" || layout === "metric_list")) {
    return "columns";
  }
  const tableCue = /价格带|对照表|矩阵表|排行表|分档表|表格/.test(t);
  const imageGridCue = /图鉴|款式墙|视觉榜|形象墙|商品墙|TOP图/.test(t);
  if (tableCue && (layout === "list" || layout === "columns")) {
    return "table";
  }
  if (imageGridCue && (layout === "list" || layout === "columns")) {
    return "image_grid";
  }
  const metricCue =
    /大盘|增速|规模|占比|GMV|销售额|同比|渗透|播放量|金额|人次/.test(t);
  // 看数页被标成 list → 抬成 metric（填充阶段材料不够数字再降回 list）
  if (
    metricCue &&
    !tableCue &&
    (layout === "list" || layout === "metric_list")
  ) {
    return layout === "metric_list" ? "metric_list" : "metric";
  }
  if (
    !metricCue &&
    (layout === "metric" || layout === "metric_list" || layout === "metric_columns")
  ) {
    return multiAxisHint ? "columns" : "list";
  }
  return layout;
}

function pickStr(...cands: unknown[]): string {
  for (const c of cands) {
    if (c == null) continue;
    if (typeof c === "object") continue;
    const s = String(c).trim();
    if (!s) continue;
    if (/^(未命名|PPT大纲|null|undefined)$/i.test(s)) continue;
    return s;
  }
  return "";
}

function repairJsonText(s: string): string {
  return s
    .replace(/^\uFEFF/, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/'/g, '"')
    .replace(/(\{|\,)\s*([A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*)\s*:/g, '$1"$2":');
}

/** 从文本中按括号匹配抽出候选 JSON 片段 */
function findJsonCandidates(text: string): string[] {
  const raw = String(text || "");
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < raw.length; j++) {
      const ch = raw[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          out.push(raw.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

/** 从模型回复中抽出最像大纲的 JSON 对象 */
export function extractJsonObject(text: string): unknown | null {
  const cleaned = String(text || "")
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
  if (!cleaned) return null;

  const tryParse = (s: string): unknown | null => {
    try {
      return JSON.parse(s);
    } catch {
      try {
        return JSON.parse(repairJsonText(s));
      } catch {
        return null;
      }
    }
  };

  const direct = tryParse(cleaned);
  if (direct && typeof direct === "object") return unwrapOutlineRoot(direct);

  for (const cand of findJsonCandidates(cleaned)) {
    const obj = tryParse(cand);
    if (!obj || typeof obj !== "object") continue;
    const unwrapped = unwrapOutlineRoot(obj);
    if (looksLikeOutline(unwrapped)) return unwrapped;
  }
  return null;
}

function looksLikeOutline(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return !!(
    o.chapters ||
    o.章节 ||
    o.sections ||
    o.outline ||
    o.data ||
    Array.isArray(obj)
  );
}

/** 解开 answer/data/outline 等常见包裹 */
function unwrapOutlineRoot(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return {chapters: obj};
  const o = obj as Record<string, unknown>;
  for (const key of ["outline", "data", "result", "content", "answer", "大纲"]) {
    const inner = o[key];
    if (typeof inner === "string" && inner.includes("{")) {
      const parsed = extractJsonObject(inner);
      if (parsed) return parsed;
    }
    if (inner && typeof inner === "object") {
      const u = unwrapOutlineRoot(inner);
      if (looksLikeOutline(u)) return u;
    }
  }
  return obj;
}

/** 把模型乱七八糟的章节形态纠成标准 chapters[] */
export function coerceOutlineStructureData(data: unknown): unknown {
  if (!data) return data;
  if (Array.isArray(data)) {
    return {title: "", chapters: data.map(coerceChapterItem).filter(Boolean)};
  }
  if (typeof data !== "object") return data;
  const root = data as Record<string, unknown>;
  let chaptersRaw =
    root.chapters || root.章节 || root.sections || root.章 || root.children;

  // { "大盘与人群": ["页1","页2"], ... } 映射形
  if (!chaptersRaw && root.title == null && root.标题 == null) {
    const keys = Object.keys(root).filter(
      (k) => !/^(layout|tips|slides)$/i.test(k),
    );
    if (
      keys.length >= 3 &&
      keys.every((k) => Array.isArray((root as any)[k]) || typeof (root as any)[k] === "object")
    ) {
      chaptersRaw = keys.map((k) => ({
        title: k,
        slides: (root as any)[k],
      }));
    }
  }

  if (!Array.isArray(chaptersRaw)) return data;
  const chapters = chaptersRaw.map(coerceChapterItem).filter(Boolean);
  return {
    title: pickStr(root.title, root.标题, root.name, root.主题, root.pptTitle),
    chapters,
  };
}

function cleanChapterTitle(raw: string): string {
  let s = String(raw || "")
    .replace(/^(?:先看|再看|接着看|然后看|最后看|首先|其次|再次)[：:\s]*/u, "")
    .trim();
  const m = s.match(/^(.+?)[：:]\s*(.+)$/u);
  if (m) {
    const left = m[1].trim();
    const right = m[2].trim();
    // 「大盘：男装哪些类目在涨」→ 取更像页题的一侧；左侧过短则取右侧
    if (left.length <= 4 && right.length >= 4) s = right;
    else if (left.length <= 12 && right.length > left.length + 4) s = left;
    else if (right.length <= 12) s = right;
    else s = left.slice(0, 12);
  }
  return s.slice(0, 12);
}

function coerceChapterItem(ch: unknown): {
  title: string;
  subtitle?: string;
  slides: unknown[];
} | null {
  if (ch == null) return null;
  if (typeof ch === "string") {
    const t = cleanChapterTitle(ch);
    return t ? {title: t, subtitle: "本章要点一览", slides: []} : null;
  }
  if (typeof ch !== "object") return null;
  const o = ch as Record<string, unknown>;
  let title = pickStr(
    o.title,
    o.标题,
    o.name,
    o.名称,
    o.chapter,
    o.chapterTitle,
    o.chapter_title,
    o.heading,
    o.section,
    o.主题,
    o.章名,
    o.章节名,
    o.章节标题,
  );
  title = cleanChapterTitle(title);
  let subtitle = pickStr(
    o.subtitle,
    o.subTitle,
    o.副标题,
    o.章副标题,
    o.说明,
    o.desc,
    o.description,
  ).slice(0, 16);
  let slidesRaw =
    o.slides || o.幻灯片 || o.pages || o.items || o.children || o.页 || o.pageList;

  if (!Array.isArray(slidesRaw)) {
    const slideVals = Object.keys(o)
      .filter((k) => /^(slide|page|页|幻灯)/i.test(k) || /^s\d+$/i.test(k))
      .map((k) => o[k]);
    if (slideVals.length) slidesRaw = slideVals;
  }

  const slides = Array.isArray(slidesRaw)
    ? slidesRaw.map(coerceSlideItem).filter(Boolean)
    : [];

  if (!title && slides.length) {
    title = `${String((slides[0] as any).title || "").slice(0, 8)}相关`.replace(
      /相关相关$/,
      "相关",
    );
    if (title === "相关") title = "内容要点";
  }
  if (!title) return null;
  if (!subtitle) subtitle = "本章要点一览";
  return {title, subtitle, slides};
}

function coerceSlideItem(sl: unknown): {title: string} | null {
  if (sl == null) return null;
  if (typeof sl === "string") {
    const t = sl.trim();
    return t ? {title: t} : null;
  }
  if (typeof sl !== "object") return null;
  const o = sl as Record<string, unknown>;
  const title = pickStr(
    o.title,
    o.标题,
    o.name,
    o.名称,
    o.slide,
    o.slideTitle,
    o.slide_title,
    o.page,
    o.页标题,
    o.幻灯片标题,
    o.heading,
  );
  return title ? {title} : null;
}

/** Markdown 标题树 → 结构 JSON（模型不听话时的兜底） */
export function markdownToOutlineStructure(text: string): OutlineStructureJson | null {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  let docTitle = "";
  const chapters: OutlineStructureJson["chapters"] = [];
  let cur: OutlineStructureJson["chapters"][0] | null = null;
  for (const line of lines) {
    const t = line.trim();
    const h1 = t.match(/^#\s+(?!#)(.+)$/);
    const h2 = t.match(/^##\s+(?!#)(.+)$/);
    const h3 = t.match(/^###\s+(.+)$/);
    if (h1) {
      docTitle = h1[1].trim();
      continue;
    }
    if (h2) {
      cur = {title: h2[1].trim(), subtitle: "本章要点一览", slides: []};
      chapters.push(cur);
      continue;
    }
    if (cur && cur.slides.length === 0) {
      const tip = t.match(/^(?:[-*+•＊]\s+)(.+)$/)?.[1]?.trim() || "";
      const subM = tip.match(/^(?:chapterSub|章副|章副标|章节副标题)\s*[:：]\s*(.+)$/i);
      if (subM) {
        cur.subtitle = subM[1].trim().slice(0, 16) || cur.subtitle;
        continue;
      }
    }
    if (h3 && cur) {
      const st = h3[1].trim();
      if (st) cur.slides.push({title: st.slice(0, 20)});
    }
  }
  if (chapters.length < 3) return null;
  if (chapters.some((c) => c.slides.length < 2)) return null;
  return {title: docTitle || chapters[0].title, chapters};
}

export function validateOutlineStructure(
  data: unknown,
): {ok: true; value: OutlineStructureJson} | {ok: false; msg: string} {
  const coerced = coerceOutlineStructureData(data);
  if (!coerced || typeof coerced !== "object") {
    return {ok: false, msg: "结构不是 JSON 对象"};
  }
  const root = coerced as Record<string, unknown>;
  const title = pickStr(root.title, root.标题, root.name, root.主题);
  const chaptersRaw = (root.chapters || root.章节) as unknown;
  if (!Array.isArray(chaptersRaw) || chaptersRaw.length < 3) {
    return {
      ok: false,
      msg: `章节数须为 3～5（当前 ${Array.isArray(chaptersRaw) ? chaptersRaw.length : 0}）`,
    };
  }
  // 模型偶发写 6～10 章：截到 5，不直接判失败
  const chapterList = chaptersRaw.slice(0, 5);
  const chapters: OutlineStructureJson["chapters"] = [];
  let slideTotal = 0;
  for (let i = 0; i < chapterList.length; i++) {
    const coercedCh = coerceChapterItem(chapterList[i]);
    if (!coercedCh?.title) {
      return {ok: false, msg: `第 ${i + 1} 章缺少标题`};
    }
    const slidesIn = Array.isArray(coercedCh.slides) ? coercedCh.slides : [];
    const slides: Array<{title: string}> = [];
    for (let j = 0; j < slidesIn.length; j++) {
      const s = coerceSlideItem(slidesIn[j]);
      if (!s?.title) {
        return {ok: false, msg: `第 ${i + 1} 章第 ${j + 1} 页缺少标题`};
      }
      slides.push({title: s.title.slice(0, 20)});
    }
    if (slides.length < 2) {
      return {
        ok: false,
        msg: `第 ${i + 1} 章「${coercedCh.title}」须至少 2 张幻灯片（当前 ${slides.length}）`,
      };
    }
    if (slides.length > 5) {
      slides.length = 5;
    }
    slideTotal += slides.length;
    chapters.push({
      title: coercedCh.title.slice(0, 12),
      subtitle: (coercedCh.subtitle || "本章要点一览").slice(0, 16),
      slides,
    });
  }
  if (chapters.length < 3) {
    return {ok: false, msg: `有效章节不足 3（当前 ${chapters.length}）`};
  }
  if (slideTotal < 6) {
    return {ok: false, msg: `全文幻灯片过少（当前 ${slideTotal}，至少 6）`};
  }
  if (slideTotal > 18) {
    return {ok: false, msg: `全文幻灯片过多（当前 ${slideTotal}，最多 18）`};
  }
  const structureValue: OutlineStructureJson = {
    title: title || chapters[0].title,
    chapters,
  };
  // 结构阶段前置：动作页题未点名材料轴 → 拒收换页题（避免填充反复写「材料未覆盖」）
  const actionBad = findUnsupportedActionSlideTitles(structureValue);
  if (actionBad) {
    return {ok: false, msg: actionBad};
  }
  return {
    ok: true,
    value: structureValue,
  };
}

/** 解析结构：JSON 优先，Markdown 标题树兜底 */
export function parseOutlineStructureFromModel(
  text: string,
): {ok: true; value: OutlineStructureJson} | {ok: false; msg: string; rawPreview: string} {
  const rawPreview = String(text || "").slice(0, 240).replace(/\s+/g, " ");
  const obj = extractJsonObject(text);
  if (obj) {
    const v = validateOutlineStructure(obj);
    if (v.ok) return v;
    // JSON 有了但不合格时，仍试 Markdown 兜底
    const md = markdownToOutlineStructure(String(text || ""));
    if (md) {
      const mv = validateOutlineStructure(md);
      if (mv.ok) return mv;
    }
    return {ok: false, msg: v.msg, rawPreview};
  }
  const md = markdownToOutlineStructure(String(text || ""));
  if (md) {
    const mv = validateOutlineStructure(md);
    if (mv.ok) return mv;
    return {ok: false, msg: mv.msg, rawPreview};
  }
  return {ok: false, msg: "未解析到 JSON 或 Markdown 标题树", rawPreview};
}

function coerceTips(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    return raw
      .split(/\n+|；|;|•|·|(?=\d+[.、]\s)/)
      .map((s) => s.replace(/^(?:[-*+•＊]\s*|\d+[.、]\s*)/, "").trim())
      .filter((s) => s.length >= 2);
  }
  if (!Array.isArray(raw)) {
    if (typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      return coerceTips(o.tips || o.要点 || o.items || o.points || o.content);
    }
    return [];
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const t = item.trim();
      if (!t) continue;
      // 模型常把「col:轴名 + 多行 - 条目」塞进同一字符串 → 拆成多 tip，否则栏内条目计为 0
      if (/[\n\r]/.test(t) && /^(?:col|column|栏)\s*[:：]/im.test(t)) {
        for (const line of t.split(/\r?\n/)) {
          const cleaned = line
            .replace(/^(?:[-*+•＊]\s*|\d+[.、]\s*)/, "")
            .trim();
          if (cleaned.length >= 2) out.push(cleaned);
        }
        continue;
      }
      out.push(t);
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const t = pickStr(
        o.text,
        o.tip,
        o.content,
        o.要点,
        o.title,
        o.desc,
        o.description,
        o.内容,
      );
      if (t) out.push(t);
    }
  }
  return out;
}

function isPlaceholderTips(tips: string[]): boolean {
  const blob = (tips || []).join("\n");
  return (
    /提炼可核对的关键判断/.test(blob) ||
    /直接相关的行动或口径要点/.test(blob) ||
    /需要继续核实的证据缺口/.test(blob)
  );
}

function countColMarkers(tips: string[]): number {
  return (tips || []).filter((t) => /^(?:col|column|栏)\s*[:：]/i.test(String(t || "").trim())).length;
}

/** 分栏 tips：统计每栏短条目数（不计 col:/colSub:） */
function columnItemCounts(tips: string[]): number[] {
  const counts: number[] = [];
  let cur = -1;
  for (const raw of tips || []) {
    const t = String(raw || "").trim();
    if (!t) continue;
    if (/^(?:col|column|栏)\s*[:：]/i.test(t)) {
      counts.push(0);
      cur = counts.length - 1;
      continue;
    }
    if (/^(?:colSub|columnSub|栏副|副标)\s*[:：]/i.test(t)) continue;
    if (/^metric\s*[:：]/i.test(t)) continue;
    if (cur < 0) {
      counts.push(0);
      cur = 0;
    }
    counts[cur] += 1;
  }
  return counts;
}

/** 与 ViewItem4Ppt 数据卡口径一致：须含 % / 亿 / 万 */
const METRIC_SIGNAL_RE = /\d+(?:\.\d+)?\s*[%％]|\d+(?:\.\d+)?\s*亿|\d+(?:\.\d+)?\s*万/u;

function countTipsWithMetricSignal(tips: string[]): number {
  return (tips || []).filter((t) => METRIC_SIGNAL_RE.test(String(t || ""))).length;
}

/** 页标题像细分品类/偏好，却整段塞了大盘主题事实 → 不合格（允许数字跨页，不允许跑题） */
export function tipsMismatchSlideTitle(
  title: string,
  tips: string[],
  intent?: string | null,
): string | null {
  const t = String(title || "");
  const blob = (tips || []).join("\n");
  const resolved = resolveSlideIntent(t, intent);
  const isMacroTitle = /大盘|增速|核心类目表现|规模口径/.test(t);
  const isDetailTitle =
    !isMacroTitle &&
    /(?:T恤|夹克|羽绒|牛仔|毛衣|卫衣|休闲裤|马甲|Polo|款式|图案|颜色|偏好|卖点)/.test(t);
  const hasMacroFact = /大盘销售额|男装大盘|平台男装大盘/.test(blob);
  if (isDetailTitle && hasMacroFact) {
    return `页「${t}」未贴本页主题（写成了大盘叙述）；请改为本页细分内容`;
  }
  // 衬衫页禁止只写 polo 实体（及反之）
  if (/衬衫/.test(t) && !/polo|Polo/i.test(t)) {
    if (/polo衫|男士polo/i.test(blob) && !/衬衫/.test(blob)) {
      return `页「${t}」写成了 polo 事实；请改为衬衫口径`;
    }
  }
  if (/polo|Polo/i.test(t) && !/衬衫/.test(t)) {
    if (/男士衬衫|衬衫价格带/.test(blob) && !/polo/i.test(blob)) {
      return `页「${t}」写成了衬衫事实；请改为 polo 口径`;
    }
  }
  // 纯大盘页：tips 口径写了衬衫/polo 销量却无大盘实体 → 跑题
  if (/大盘/.test(t) && !CATEGORY_TITLE_RE.test(t)) {
    if (CATEGORY_CLAIM_RE.test(blob) && !DAPAN_CLAIM_RE.test(blob)) {
      return `页「${t}」写成了子类销量口径；请改用男装大盘数字`;
    }
  }
  // 品类/大盘规模页：只拦「TOP N + 合计/共计/总和」口径改写（方案 B）。
  // 裸「销量TOP6 403.7万」放行——源文原生 rank 措辞；rank 错写由 JSON 双轨 rank_badge 管。
  const topRewriteTrigger =
    /大盘|销量|销售额/.test(t) ||
    resolved === "category-detail" ||
    resolved === "macro-market" ||
    resolved === "category-position";
  if (
    topRewriteTrigger &&
    !/TOP|榜|排名|热销/.test(t) &&
    /TOP\s*\d+\s*(?:合计|共计|总和)|(?:合计|共计|总和)\s*(?:销量)?\s*TOP|TOP\s*(?:合计|共计|总和)/i.test(
      blob,
    )
  ) {
    return (
      `页「${t}」勿把品类/大盘销量改写成 TOP 合计口径；` +
      `请写「销量 403.7万」这类「原数字 + 品类名」，勿加 TOP N 合计`
    );
  }
  return null;
}

function isOverviewTitle(title: string): boolean {
  return /三种|对照|几大打法|打法总览|打法一览/.test(String(title || ""));
}

function hasFollowUpExpansion(
  slides: OutlineFilledJson["chapters"][0]["slides"],
  overviewIndex: number,
): boolean {
  return slides.slice(overviewIndex + 1).some((s) =>
    /案例|高举高打|精种准打|聚流快打/.test(String(s.title || "")),
  );
}

/** 总览+后续展开：选型优先 columns（填充写不出时可降 list，校验不强制） */
export function slidePrefersOverviewColumns(
  title: string,
  slides: Array<{title: string}>,
  index: number,
): boolean {
  return isOverviewTitle(title) && hasFollowUpExpansion(slides, index);
}

/** @deprecated 用 slidePrefersOverviewColumns；不再「必须 columns」 */
export const slideRequiresOverviewColumns = slidePrefersOverviewColumns;

type FilledSlide = OutlineFilledJson["chapters"][0]["slides"][0];

/** 单页填充校验（chapterSlides 提供总览/兄弟页上下文；evidence 为本页检索原文） */
export function validateFilledSlideInChapter(
  slides: FilledSlide[],
  index: number,
  evidence?: string,
): string | null {
  const sl = slides[index];
  if (!sl) return `缺少第 ${index + 1} 页`;
  const layout = normalizeSlideLayout(sl.layout);
  const tips = sl.tips || [];
  const title = sl.title || "";
  const nMetric = countTipsWithMetricSignal(tips);

  if (tips.length < 2) {
    return `页「${title}」tips 不足 2 条（现 ${tips.length}），须从材料填写真实要点`;
  }
  if (isPlaceholderTips(tips)) {
    return `页「${title}」tips 仍是占位句，须换成材料中的真实要点`;
  }
  const metaTip = findMetaDiagnosticTips(tips);
  if (metaTip) {
    return (
      `页「${title}」tips 含检索诊断「${metaTip}」，禁止写进大纲；` +
      `材料不足时改写可执行的选品短动作（如「回查属性特征页」「对照爆款图鉴」），勿写「材料未覆盖/口径未标注」`
    );
  }

  const dup = findDuplicateTips(tips);
  if (dup) return `页「${title}」${dup}`;

  if (layout === "metric") {
    if (nMetric < 2) {
      return `页「${title}」layout=metric 但 tips 中带原数字（含%/亿/万）不足 2 条（现 ${nMetric}）；请写入材料原数字，或改用 list`;
    }
  }
  if (layout === "metric_list" || layout === "metric_columns") {
    if (nMetric < 2) {
      return `页「${title}」layout=${layout} 上半数据卡至少 2 条须含原数字（含%/亿/万），现 ${nMetric}；勿用类目名充数据卡`;
    }
  }

  if (layout === "columns" || layout === "metric_columns") {
    const nCol = countColMarkers(tips);
    if (nCol < 2) {
      return `页「${title}」layout=${layout} 但 tips 中 col: 不足 2 个（现 ${nCol}），禁止伪分栏长句`;
    }
    const itemCounts = columnItemCounts(tips);
    if (itemCounts.some((n) => n < 1)) {
      return `页「${title}」分栏每栏至少 1 条短条目（大纲阶段就要写好，不要等内容生成再补）；当前各栏条目数=[${itemCounts.join(",")}]`;
    }
    // 总览用 columns 时栏内宜短；过长则拒收本版式（可降 list），不禁止 list 本身
    if (isOverviewTitle(title) && hasFollowUpExpansion(slides, index)) {
      const longBody = tips.filter((t) => {
        const s = String(t || "").trim();
        if (/^(?:col|column|栏|colSub|栏副)\s*[:：]/i.test(s)) return false;
        return s.length > 22;
      });
      if (longBody.length >= 2) {
        return `页「${title}」总览栏内条目宜短标签（≤16 字量级）；过长事实留给后续案例页，或改用 list`;
      }
    }
    // 按栏：轴名须在本页证据有痕迹（无证据则改轴或降 list，勿写诊断语）
    if (evidence) {
      const colEv = checkColumnAxisEvidence(tips, evidence);
      if (!colEv.ok) {
        return `页「${title}」${colEv.hint}`;
      }
    }
  }

  if (layout === "table") {
    const pipe = tips.filter((t) => (String(t).match(/\|/g) || []).length >= 1);
    if (pipe.length < 2) {
      return `页「${title}」layout=table 至少 2 行须用 | 分隔单元格（如 维度|数值|增速|口径）`;
    }
  }
  if (layout === "image_grid") {
    if (tips.length > 4) {
      return `页「${title}」layout=image_grid 图注最多 4 条（现 ${tips.length}）`;
    }
  }

  const mismatch = tipsMismatchSlideTitle(title, tips, sl.intent);
  if (mismatch) return mismatch;

  if (evidence) {
    const fidelity = validateTipsAgainstEvidence(title, tips, evidence, {
      intent: sl.intent,
    });
    if (fidelity) return fidelity;
  }

  return null;
}

/** 填充校验：缺数字的数据卡 / 缺 col: / 跑题 / 总览嵌套 → 拒收重试 */
function validateFilledSlides(slides: FilledSlide[]): string | null {
  for (let i = 0; i < slides.length; i++) {
    const bad = validateFilledSlideInChapter(slides, i);
    if (bad) return bad;
  }
  return null;
}

/** list/metric 仍限 5 条；分栏/复合页 tips 含多行 col:/colSub:/条目，不能硬截 5 */
function capTipsByLayout(layout: OutlineJsonLayout, tips: string[]): string[] {
  const max =
    layout === "columns" || layout === "metric_columns"
      ? 32
      : layout === "metric_list"
        ? 8
        : layout === "table"
          ? 6
          : layout === "image_grid"
            ? 4
            : 5;
  return tips.length > max ? tips.slice(0, max) : tips;
}

/** 解析单章填充（按章调用时用，不要求全文 3～5 章） */
export function parseFilledChapterFromModel(
  text: string,
  lockedChapter: OutlineStructureJson["chapters"][0],
): {
  ok: true;
  value: OutlineFilledJson["chapters"][0];
} | {ok: false; msg: string} {
  const obj = extractJsonObject(text);
  let slidesRaw: unknown[] | null = null;
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (Array.isArray(o.slides) || Array.isArray(o.幻灯片) || Array.isArray(o.pages)) {
      slidesRaw = (o.slides || o.幻灯片 || o.pages) as unknown[];
    } else if (Array.isArray(o.chapters) || Array.isArray(o.章节)) {
      const chs = (o.chapters || o.章节) as unknown[];
      const hit =
        chs.find((c: any) => pickStr(c?.title, c?.标题, c?.name) === lockedChapter.title) ||
        chs[0];
      if (hit && typeof hit === "object") {
        const c = hit as Record<string, unknown>;
        slidesRaw = (c.slides || c.幻灯片 || c.pages || []) as unknown[];
      }
    } else if (Array.isArray(obj)) {
      slidesRaw = obj as unknown[];
    }
  }
  if (!slidesRaw || !slidesRaw.length) {
    return {ok: false, msg: `章「${lockedChapter.title}」未解析到 slides`};
  }

  const slides: OutlineFilledJson["chapters"][0]["slides"] = [];
  for (let j = 0; j < lockedChapter.slides.length; j++) {
    const lockedSl = lockedChapter.slides[j];
    const sl = (slidesRaw[j] || {}) as Record<string, unknown>;
    const title = pickStr(lockedSl.title, sl.title, sl.标题, sl.name, sl.页标题);
    const layout = normalizeSlideLayout(String(sl.layout || sl.版式 || "list"));
    let tips = coerceTips(sl.tips || sl.要点 || sl.items || sl.points || sl.bullets);
    if (layout === "metric_list" || layout === "metric") {
      tips = normalizeMetricListTipsArray(tips);
    }
    tips = capTipsByLayout(layout, tips);
    slides.push({
      title: (title || lockedSl.title).slice(0, 20),
      layout,
      tips,
    });
  }
  const bad = validateFilledSlides(slides);
  if (bad) return {ok: false, msg: bad};
  return {
    ok: true,
    value: {title: lockedChapter.title, subtitle: lockedChapter.subtitle, slides},
  };
}

/** 章内 layout 选型结果解析（含可选 intent） */
export function parseLayoutAssignFromModel(
  text: string,
  lockedChapter: OutlineStructureJson["chapters"][0],
): {
  ok: true;
  layouts: OutlineJsonLayout[];
  intents: Array<string | undefined>;
} | {ok: false; msg: string} {
  const obj = extractJsonObject(text);
  if (!obj || typeof obj !== "object") {
    return {ok: false, msg: `章「${lockedChapter.title}」未解析到 layout 选型 JSON`};
  }
  const o = obj as Record<string, unknown>;
  let slidesRaw: unknown[] | null = null;
  if (Array.isArray(o.slides) || Array.isArray(o.幻灯片)) {
    slidesRaw = (o.slides || o.幻灯片) as unknown[];
  } else if (Array.isArray(o.chapters)) {
    const chs = o.chapters as unknown[];
    const hit =
      chs.find((c: any) => pickStr(c?.title, c?.标题) === lockedChapter.title) ||
      chs[0];
    if (hit && typeof hit === "object") {
      const c = hit as Record<string, unknown>;
      slidesRaw = (c.slides || c.幻灯片 || []) as unknown[];
    }
  }
  if (!slidesRaw?.length) {
    return {ok: false, msg: `章「${lockedChapter.title}」选型结果无 slides`};
  }
  const layouts: OutlineJsonLayout[] = [];
  const intents: Array<string | undefined> = [];
  for (let j = 0; j < lockedChapter.slides.length; j++) {
    const sl = (slidesRaw[j] || {}) as Record<string, unknown>;
    const picked = normalizeSlideLayout(String(sl.layout || sl.版式 || "list"));
    layouts.push(coerceLayoutBySlideTitle(lockedChapter.slides[j].title, picked));
    const intentRaw = pickStr(sl.intent, sl.意图, sl.pageIntent);
    intents.push(normalizeSlideIntent(intentRaw || undefined));
  }
  // 总览+后续案例：总览须 columns；标成 list 时直接纠偏，不整章失败
  for (let j = 0; j < lockedChapter.slides.length; j++) {
    const title = lockedChapter.slides[j].title;
    const ctx = lockedChapter.slides.map((s, i) => ({
      title: s.title,
      layout: layouts[i],
      tips: [] as string[],
    }));
    if (isOverviewTitle(title) && hasFollowUpExpansion(ctx, j)) {
      if (layouts[j] === "list" || layouts[j] === "metric_list") {
        layouts[j] = "columns";
      }
    }
  }
  // 全章 list：挑一页抬成 columns/metric_list，不整章失败
  const listOnly =
    layouts.length >= 2 && layouts.every((l) => (l as string) === "list");
  if (listOnly) {
    const titles = lockedChapter.slides.map((s) => s.title);
    let idx = titles.findIndex((t) =>
      /对照|对比|几种|三类|三种|两大|几大|多维|分轴|vs|打法/i.test(t),
    );
    let next: OutlineJsonLayout = "columns";
    if (idx < 0) {
      idx = titles.findIndex((t) =>
        /大盘|增速|规模|占比|GMV|销售额|同比|渗透|播放量/.test(t),
      );
      if (idx >= 0) {
        next = "metric_list";
      } else {
        idx = titles.findIndex(
          (t) => !/(?:类型|清单|名单|话题|盘点)$/.test(t),
        );
        if (idx < 0) idx = 0;
        next = "columns";
      }
    }
    layouts[idx] = next;
  }
  return {ok: true, layouts, intents};
}

/** 单页 tips 填充解析（layout 已锁定；evidence 为检索原文，用于数值忠实性） */
export function parseFilledSlideFromModel(
  text: string,
  lockedTitle: string,
  lockedLayout: OutlineJsonLayout,
  chapterSlides: FilledSlide[],
  index: number,
  evidence?: string,
): {ok: true; value: FilledSlide} | {ok: false; msg: string} {
  const obj = extractJsonObject(text);
  let tipSrc: Record<string, unknown> | null = null;
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (Array.isArray(o.tips) || o.要点 || o.items) {
      tipSrc = o;
    } else if (Array.isArray(o.slides) && o.slides[0]) {
      tipSrc = o.slides[0] as Record<string, unknown>;
    } else if (Array.isArray(o.chapters) && (o.chapters[0] as any)?.slides?.[0]) {
      tipSrc = (o.chapters[0] as any).slides[0];
    }
  }
  if (!tipSrc) {
    return {ok: false, msg: `页「${lockedTitle}」未解析到 tips JSON`};
  }
  let tips = coerceTips(
    tipSrc.tips || tipSrc.要点 || tipSrc.items || tipSrc.points || tipSrc.bullets,
  );
  const layout = lockedLayout;
  if (layout === "metric_list" || layout === "metric") {
    tips = normalizeMetricListTipsArray(tips);
  }
  tips = capTipsByLayout(layout, tips);
  // 分栏副标重复：修复（保首个删其余）而非整页拒收，避免「colSub 同文」耗尽重试
  const dedupSub = dropDuplicateColSub(tips);
  if (dedupSub.dropped) {
    console.warn(
      "ppt-outline-dup-colsub-dropped",
      lockedTitle,
      dedupSub.dropped,
    );
    tips = dedupSub.tips;
  }
  const slide: FilledSlide = {
    title: lockedTitle.slice(0, 20),
    layout,
    intent: chapterSlides[index]?.intent,
    tips,
  };
  const next = chapterSlides.map((s, i) => (i === index ? slide : s));
  const bad = validateFilledSlideInChapter(next, index, evidence);
  if (bad) return {ok: false, msg: bad};
  return {ok: true, value: slide};
}

export function validateOutlineFilled(
  data: unknown,
  locked?: OutlineStructureJson,
): {ok: true; value: OutlineFilledJson} | {ok: false; msg: string} {
  if (!locked?.chapters?.length) {
    return {ok: false, msg: "缺少锁定结构"};
  }
  const coerced = coerceOutlineStructureData(data);
  const root = (coerced || data) as Record<string, unknown>;
  let chaptersRaw = (root?.chapters || root?.章节) as unknown;
  if (!Array.isArray(chaptersRaw)) {
    // 整份返回被截断时，尝试当单章 slides 用
    if (root && (root.slides || root.幻灯片)) {
      chaptersRaw = [root];
    } else {
      return {ok: false, msg: "填充结果缺少 chapters"};
    }
  }

  const chapters: OutlineFilledJson["chapters"] = [];
  for (let i = 0; i < locked.chapters.length; i++) {
    const lockedCh = locked.chapters[i];
    const ch =
      (chaptersRaw as any[]).find(
        (c) => pickStr(c?.title, c?.标题, c?.name) === lockedCh.title,
      ) || (chaptersRaw as any[])[i];
    if (!ch || typeof ch !== "object") {
      return {ok: false, msg: `缺少章「${lockedCh.title}」的填充`};
    }
    const slidesRaw = ((ch as any).slides ||
      (ch as any).幻灯片 ||
      (ch as any).pages ||
      []) as unknown[];
    const slides: OutlineFilledJson["chapters"][0]["slides"] = [];
    for (let j = 0; j < lockedCh.slides.length; j++) {
      const lockedSl = lockedCh.slides[j];
      const sl = (slidesRaw[j] || {}) as Record<string, unknown>;
      const title = pickStr(
        lockedSl.title,
        sl.title,
        sl.标题,
        sl.name,
        sl.页标题,
      );
      const layout = normalizeSlideLayout(String(sl.layout || sl.版式 || "list"));
      let tips = coerceTips(
        sl.tips || sl.要点 || sl.items || sl.points || sl.bullets,
      );
      if (tips.length < 2) {
        return {
          ok: false,
          msg: `页「${title || lockedSl.title}」tips 不足 2 条（现 ${tips.length}），须从材料填写真实要点`,
        };
      }
      if (isPlaceholderTips(tips)) {
        return {
          ok: false,
          msg: `页「${title || lockedSl.title}」tips 仍是占位句，须换成材料中的真实要点`,
        };
      }
      const metaTip = findMetaDiagnosticTips(tips);
      if (metaTip) {
        return {
          ok: false,
          msg:
            `页「${title || lockedSl.title}」tips 含检索诊断「${metaTip}」，禁止写进大纲；` +
            `材料不足时改写可执行的选品短动作，勿写「材料未覆盖/口径未标注」`,
        };
      }
      if (layout === "metric_list" || layout === "metric") {
        tips = normalizeMetricListTipsArray(tips);
      }
      tips = capTipsByLayout(layout, tips);
      slides.push({
        title: (title || lockedSl.title).slice(0, 20),
        layout,
        tips,
      });
    }
    const bad = validateFilledSlides(slides);
    if (bad) return {ok: false, msg: bad};
    chapters.push({
      title: lockedCh.title,
      subtitle: lockedCh.subtitle,
      slides,
    });
  }
  return {
    ok: true,
    value: {
      title: pickStr(root.title, root.标题, locked.title) || locked.title,
      chapters,
    },
  };
}

/** 从用户短句提取主题，避免章名顶替全文标题 */
export function topicFromUserMessage(userMessage: string, fallback = ""): string {
  const m = String(userMessage || "").match(/主题是【(.+?)】/);
  const t = (m?.[1] || fallback || "").trim();
  return t.slice(0, 40);
}

export function filledToMarkdown(data: OutlineFilledJson): string {
  const lines: string[] = [`# ${(data.title || "").trim() || "未命名大纲"}`];
  for (const ch of data.chapters || []) {
    lines.push("", `## ${(ch.title || "").trim() || "未命名章节"}`);
    const sub = (ch.subtitle || "").trim();
    if (sub) lines.push(`- chapterSub: ${sub}`);
    for (const sl of ch.slides || []) {
      lines.push("");
      lines.push(`### ${(sl.title || "").trim() || "内容要点"}`);
      const layout = normalizeSlideLayout(sl.layout);
      lines.push(`- layout: ${layout}`);
      const tipList =
        layout === "metric_list" || layout === "metric"
          ? normalizeMetricListTipsArray(sl.tips || [])
          : sl.tips || [];
      for (const tip of tipList) {
        const t = String(tip || "").trim();
        if (t) lines.push(`- ${t}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function structureToMarkdown(data: OutlineStructureJson): string {
  const lines = [`# ${data.title}`];
  for (const ch of data.chapters) {
    lines.push("", `## ${ch.title}`);
    if ((ch.subtitle || "").trim()) lines.push(`- chapterSub: ${ch.subtitle!.trim()}`);
    for (const sl of ch.slides) {
      lines.push(`### ${sl.title}`);
    }
  }
  return lines.join("\n");
}

/** 把任意助手回复尽量收成可保存的 Markdown（优先保留已有 layout/要点） */
export function assistantContentToOutlineMarkdown(
  text: string,
  fallbackTitle?: string,
): string {
  const s0 = String(text || "").trim();
  // 已是带 layout/要点的完整大纲：绝不能再经「仅标题树」重写，否则 layout 会全丢成默认 list
  if (
    /^#{1,3}\s+/m.test(s0) &&
    (/^- layout\s*[:：]/im.test(s0) || /(?:^|\n)###\s+.+\n(?:- .+\n){1,}/.test(s0))
  ) {
    let s = s0;
    if (fallbackTitle) {
      const h1 = s.match(/^#\s+(?!#)(.+)$/m);
      const cur = (h1?.[1] || "").trim();
      if (!cur || isWeakDocTitle(cur)) {
        if (h1) s = s.replace(/^#\s+(?!#).+$/m, `# ${fallbackTitle}`);
        else s = `# ${fallbackTitle}\n${s}`;
      }
    }
    return s;
  }

  const obj = extractJsonObject(s0);
  if (obj) {
    const coerced = coerceOutlineStructureData(obj);
    const struct = validateOutlineStructure(coerced);
    if (struct.ok) {
      const maybeFilled = validateOutlineFilled(obj, struct.value);
      if (maybeFilled.ok) {
        const md = filledToMarkdown(maybeFilled.value);
        if (fallbackTitle && isWeakDocTitle(maybeFilled.value.title)) {
          return filledToMarkdown({...maybeFilled.value, title: fallbackTitle});
        }
        return md;
      }
      // 仅有标题树 JSON、没有 tips：保留结构即可
      return structureToMarkdown(
        fallbackTitle && isWeakDocTitle(struct.value.title)
          ? {...struct.value, title: fallbackTitle}
          : struct.value,
      );
    }
  }

  // 纯标题 Markdown（无 layout/要点）才走标题树回写
  const mdStruct = markdownToOutlineStructure(s0);
  if (mdStruct && !/^- layout\s*[:：]/im.test(s0) && !/^- /m.test(s0)) {
    return structureToMarkdown(
      fallbackTitle && isWeakDocTitle(mdStruct.title)
        ? {...mdStruct, title: fallbackTitle}
        : mdStruct,
    );
  }

  if (fallbackTitle && !/^#\s+(?!#)/m.test(s0)) {
    return `# ${fallbackTitle}\n${s0}`;
  }
  return s0;
}

function isWeakDocTitle(title: string): boolean {
  const t = (title || "").trim();
  if (!t) return true;
  if (/^(先看|再看|接着|然后)/.test(t)) return true;
  if (t.length > 28) return true;
  return false;
}
