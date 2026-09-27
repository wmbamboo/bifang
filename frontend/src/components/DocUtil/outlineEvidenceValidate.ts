/**
 * P0-1：数值忠实性 —— tips 中的原数字必须出现在检索证据里，
 * 且每个数字独立对上实体（大盘 / 衬衫 / polo），拦住张冠李戴。
 *
 * 收敛计划：关键词表只在本文件导出；窗口/就近类启发式是过渡方案。
 * 表头与数据分家若再误杀 ≥2 次（邻块拼接仍不够）：停止加启发式，转 JSON 双轨
 *（把「数字↔实体」单元格归属直接入库，用 id 比对替代文本距离）。
 */

import {
  PRICE_BAND_TOKEN_RE,
  isPriceBandAtom,
  extractPriceBandAtoms,
  hasPriceBand,
  numberInsidePriceBand,
} from "@/components/DocUtil/priceBandAtom";
import {
  isTruncatedPlainLine,
  isChartAxisFragmentPlain,
} from "@/components/DocUtil/outlineTextFragments";
import {
  ENTITY_DAPAN,
  ENTITY_SHIRT,
  ENTITY_POLO,
  ENTITY_CATEGORY_ALL,
  CATEGORY_TITLE_RE,
  CATEGORY_CLAIM_RE,
  DAPAN_CLAIM_RE,
  SHARE_OF_MACRO_RE,
  tipClaimsBareDapan,
  getCategoryHitWords,
  getDapanHitWords,
  getEntityClassWords,
  getEntityClassLabelZh,
  getActiveCorpusProfile,
  isAttrAxisPageTitle,
  isPriceBandPageTitle,
  wordsForEntityGroup,
  type EntityClass,
} from "@/components/DocUtil/corpusProfile";

export { PRICE_BAND_TOKEN_RE, isPriceBandAtom, extractPriceBandAtoms };

/** 实体/品类词表来自语料画像（corpusProfile）；换域=换 JSON */
export {
  ENTITY_DAPAN,
  ENTITY_SHIRT,
  ENTITY_POLO,
  ENTITY_CATEGORY_ALL,
  CATEGORY_TITLE_RE,
  CATEGORY_CLAIM_RE,
  DAPAN_CLAIM_RE,
  SHARE_OF_MACRO_RE,
  tipClaimsBareDapan,
};
export type { EntityClass };

/** 与大纲 metric 口径一致 */
export const EVIDENCE_METRIC_RE =
  /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([%％亿万]|元)?/gu;

/** 短窗：无 tip 口径时数字±实体距离 */
export const WINDOW_TIGHT = 28;
/** 松窗：混合 chunk 降级 / 无分块时 tip 已点名口径 */
export const WINDOW_LOOSE = 96;
/** tip 已点名口径且 chunk 实体纯净时：整 chunk 作用域（传给 metricNearEntity） */
export const CHUNK_SCOPE = -1;

/** 扫描窗内找大盘词：忽略落在份额附属语（如「占大盘」）里的宏词 */
function indexDapanOutsideShareIdiom(
  s: string,
  fromEnd: boolean,
): number {
  if (!s) return -1;
  const idioms = getActiveCorpusProfile().raw.shareOfMacroIdioms || [];
  let mask = s;
  for (const idiom of idioms) {
    if (!idiom) continue;
    mask = mask.split(idiom).join("＿".repeat(idiom.length));
  }
  const words = getDapanHitWords();
  return fromEnd ? lastIndexAny(mask, words) : firstIndexAny(mask, words);
}

export type OutlineSlideIntent =
  | "category-position"
  | "macro-market"
  | "category-detail"
  | "price-band"
  | "generic";

const INTENT_ALIASES: Record<string, OutlineSlideIntent> = {
  "category-position": "category-position",
  category_position: "category-position",
  position: "category-position",
  "macro-market": "macro-market",
  macro_market: "macro-market",
  macro: "macro-market",
  "category-detail": "category-detail",
  category_detail: "category-detail",
  detail: "category-detail",
  "price-band": "price-band",
  price_band: "price-band",
  generic: "generic",
};

/**
 * 页意图：优先读大纲声明的 intent；缺失时才用标题正则降级。
 * 标题降级故意收窄（只要「位置/在大盘/占大盘」），避免「价格带对比」假阳性。
 */
export function resolveSlideIntent(
  title: string,
  intent?: string | null,
): OutlineSlideIntent {
  const raw = String(intent || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
  if (raw && INTENT_ALIASES[raw]) return INTENT_ALIASES[raw];

  const t = String(title || "");
  if (DAPAN_CLAIM_RE.test(t) && !CATEGORY_TITLE_RE.test(t)) return "macro-market";
  if (isPriceBandPageTitle(t)) return "price-band";
  if (
    CATEGORY_TITLE_RE.test(t) &&
    /位置|在大盘|占大盘|品类位置|相对大盘/.test(t)
  ) {
    return "category-position";
  }
  if (CATEGORY_TITLE_RE.test(t)) return "category-detail";
  return "generic";
}

export function isCategoryPositionSlide(
  title: string,
  intent?: string | null,
): boolean {
  return resolveSlideIntent(title, intent) === "category-position";
}

export function normalizeSlideIntent(
  raw: string | undefined | null,
): OutlineSlideIntent | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const key = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
  if (INTENT_ALIASES[key]) return INTENT_ALIASES[key];
  return undefined;
}

/** 标题可推断出非 generic 时回填，避免选型省略 intent 导致管道空转 */
export function inferSlideIntentOrUndefined(
  title: string,
): OutlineSlideIntent | undefined {
  const inferred = resolveSlideIntent(title);
  return inferred === "generic" ? undefined : inferred;
}

export type TipEvidenceIssue = {
  tip: string;
  reason: string;
};

/** 去掉千分位等，便于「7,280.1」对「7280.1」 */
export function normalizeMetricToken(raw: string): string {
  return String(raw || "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/％/g, "%");
}

/** 从 tip 抽出需核对的数字 token（带单位优先）；日期/采样窗/价格带边界数字不抽 */
export function extractMetricTokens(tip: string): string[] {
  const s = String(tip || "");
  const out: string[] = [];
  const re = new RegExp(EVIDENCE_METRIC_RE.source, "gu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const num = (m[1] || "").replace(/,/g, "");
    const unit = m[2] || "";
    if (!num) continue;
    // 年份、日期片段不当指标（采样窗 2024.03.19-04.17）
    if (isDateLikeNumberToken(num, unit, s, m.index)) continue;
    // 价格带区间边界不当指标（¥50-100 里的 50/100）
    if (isPriceBandBoundToken(num, unit, s, m.index)) continue;
    const token = normalizeMetricToken(num + unit);
    if (token && !out.includes(token)) out.push(token);
    if (num && !out.includes(num)) out.push(num);
  }
  return out;
}

/**
 * 价格带区间边界：禁止进忠实度校验。
 * 例：`polo衫|¥50-100|172.6万` 里的 50/100 是区间标签，不是销量/销售额。
 * 万/亿/% 单位一律不当边界（真指标）。
 */
export function isPriceBandBoundToken(
  num: string,
  unit: string,
  tip: string,
  indexInTip: number = -1,
): boolean {
  if (unit && /[%％亿万]/.test(unit)) return false;
  const n = String(num || "").trim();
  if (!n || indexInTip < 0) return false;
  return numberInsidePriceBandSpan(tip, indexInTip, n.length);
}

/**
 * 日期 / 采样窗数字：禁止进忠实度校验。
 * - 纯年份 20xx
 * - YYYY.MM / YYYY-MM / MM.DD 且落在日期区间上下文
 * - tip 内落在日期串跨度里的日/月碎片（如 7280.1万（2024.03.19-04.17）里的 19）
 * - tip 本身是采样窗/时间区间说明
 */
export function isDateLikeNumberToken(
  num: string,
  unit: string,
  tip: string,
  indexInTip: number = -1,
): boolean {
  if (unit && /[%％亿万元]/.test(unit)) return false;
  const n = String(num || "").trim();
  if (!n) return true;
  if (/^20\d{2}$/.test(n)) return true;
  if (/^20\d{2}[.\-/]\d{1,2}([.\-/]\d{1,2})?$/.test(n)) return true;
  // 落在 tip 内任一日期/区间跨度中 → 一律不当指标
  if (indexInTip >= 0 && numberInsideDateSpan(tip, indexInTip, n.length)) {
    return true;
  }
  // 04.17 / 3.19 这类月日：仅在采样/日期语境跳过，避免误伤真指标
  if (/^\d{1,2}[.\-/]\d{1,2}$/.test(n)) {
    if (isSamplingWindowTip(tip)) return true;
    if (indexInTip >= 0) {
      const win = tip.slice(
        Math.max(0, indexInTip - 24),
        Math.min(tip.length, indexInTip + n.length + 16),
      );
      if (/采样|时间|日期|区间|至|~|—|–/.test(win) || /20\d{2}/.test(win)) {
        return true;
      }
    }
  }
  // 孤立两位日/月数字贴在日期串旁（…19-04… 里的 19）
  if (/^\d{1,2}$/.test(n)) {
    if (isSamplingWindowTip(tip)) return true;
    if (indexInTip >= 0) {
      const win = tip.slice(
        Math.max(0, indexInTip - 28),
        Math.min(tip.length, indexInTip + n.length + 20),
      );
      if (/20\d{2}/.test(win) && /[.\-/至到~～—–]/.test(win)) return true;
    }
  }
  return false;
}

/** tip 内日期/区间跨度（含括号旁注采样窗） */
const DATE_SPAN_RE =
  /20\d{2}[.\-/]\d{1,2}(?:[.\-/]\d{1,2})?(?:\s*[-~～至到—–]\s*(?:20\d{2}[.\-/])?\d{1,2}(?:[.\-/]\d{1,2})?)?/g;

function numberInsideDateSpan(
  tip: string,
  index: number,
  len: number,
): boolean {
  const s = String(tip || "");
  if (!s || index < 0) return false;
  DATE_SPAN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_SPAN_RE.exec(s))) {
    const start = m.index;
    const end = start + m[0].length;
    if (index >= start && index + len <= end) return true;
  }
  return false;
}

function numberInsidePriceBandSpan(
  tip: string,
  index: number,
  len: number,
): boolean {
  return numberInsidePriceBand(tip, index, len);
}

/** colSub/短句：采样时间窗说明（非整页指标） */
export function isSamplingWindowTip(tip: string): boolean {
  const s = String(tip || "")
    .replace(/^(?:colSub|columnSub|栏副|副标|metric|list|col|column|栏)\s*[:：]\s*/i, "")
    .trim();
  if (!s) return false;
  if (/采样|时间窗|时间区间|采样窗|统计周期|数据周期/.test(s) && /20\d{2}/.test(s)) {
    return true;
  }
  // 纯日期区间行：2024.03.19-04.17 / 2024-03-19至2024-04-17
  if (
    /^20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}\s*[-~～至到—–]\s*(?:20\d{2}[.\-/])?\d{1,2}[.\-/]\d{1,2}/.test(
      s,
    )
  ) {
    return true;
  }
  return false;
}

/** 同一数值只留一个代表 token（优先带单位），避免 7280.1 / 7280.1万 双验 */
export function uniqueMetricTokens(tokens: string[]): string[] {
  const byNum = new Map<string, string>();
  for (const tok of tokens || []) {
    const num = normalizeMetricToken(tok).replace(/[%％亿万元]/g, "");
    if (!num || num.length < 2) continue;
    const prev = byNum.get(num);
    if (!prev || /[%％亿万元]/.test(tok)) byNum.set(num, tok);
  }
  return [...byNum.values()];
}

function evidenceCompact(evidence: string): string {
  return normalizeMetricToken(evidence);
}

/** 证据里是否出现该数字（允许千分位差异） */
export function evidenceHasMetric(evidence: string, token: string): boolean {
  const ev = evidenceCompact(evidence);
  const tok = normalizeMetricToken(token);
  if (!tok || tok.length < 2) return true;
  if (ev.includes(tok)) return true;
  if (/^\d+(?:\.\d+)?$/.test(tok)) {
    return (
      ev.includes(tok + "%") ||
      ev.includes(tok + "亿") ||
      ev.includes(tok + "万") ||
      ev.includes(tok + "元")
    );
  }
  return false;
}

/** 页标题 → 期望实体词（用于「数字附近须贴实体」）；品类来自当前语料画像 */
export function titleEntityHints(title: string): {
  requireNear: string[];
  forbidNear: string[];
} {
  const t = String(title || "");
  if (DAPAN_CLAIM_RE.test(t) && !CATEGORY_TITLE_RE.test(t)) {
    return {requireNear: [...ENTITY_DAPAN], forbidNear: []};
  }
  const hitIds: string[] = [];
  const profile = getActiveCorpusProfile();
  for (const id of profile.categoryGroupIds) {
    const words = wordsForEntityGroup(id);
    if (words.some((w) => w && t.toLowerCase().includes(w.toLowerCase()))) {
      hitIds.push(id);
    }
  }
  if (hitIds.length === 1) {
    return {requireNear: [...wordsForEntityGroup(hitIds[0])], forbidNear: []};
  }
  if (hitIds.length > 1) {
    const requireNear: string[] = [];
    for (const id of hitIds) requireNear.push(...wordsForEntityGroup(id));
    return {requireNear, forbidNear: []};
  }
  if (isPriceBandPageTitle(t)) {
    return {
      requireNear: ["价格带", "￥", "元", "主力", "机会"],
      forbidNear: [],
    };
  }
  return {requireNear: [], forbidNear: []};
}

function blockHasEntity(evidence: string, entities: readonly string[]): boolean {
  const low = String(evidence || "")
    .replace(/,/g, "")
    .toLowerCase();
  return entities.some(
    (e) => e && low.includes(e.replace(/,/g, "").toLowerCase()),
  );
}

/** 证据块内出现的实体类（按当前画像 entityGroups 分立） */
export function chunkEntityClasses(body: string): Set<EntityClass> {
  const classes = new Set<EntityClass>();
  for (const {cls, words} of getEntityClassWords()) {
    if (blockHasEntity(body, words)) classes.add(cls);
  }
  return classes;
}

export function entityClassOfLabels(
  labels: readonly string[],
): EntityClass | "unknown" {
  const hits: EntityClass[] = [];
  for (const {cls, words, caseInsensitive} of getEntityClassWords()) {
    const hit = labels.some((l) => {
      const s = String(l || "");
      if ((words as readonly string[]).includes(s)) return true;
      if (caseInsensitive) {
        const low = s.toLowerCase();
        return words.some((w) => w && low.includes(w.toLowerCase()));
      }
      return words.some((w) => w && s.includes(w));
    });
    if (hit) hits.push(cls);
  }
  if (hits.length !== 1) return "unknown";
  return hits[0];
}

/** chunk 仅含期望的一类实体 → 纯净（金标/调试用；对齐主路径已改就近实体类） */
export function chunkIsPureForEntities(
  body: string,
  expectEntities: readonly string[],
): boolean {
  const want = entityClassOfLabels(expectEntities);
  if (want === "unknown") return false;
  const classes = chunkEntityClasses(body);
  return classes.size === 1 && classes.has(want);
}

function bodyHasAnyEntityWord(body: string): boolean {
  return chunkEntityClasses(body).size > 0;
}

function collectEntityHits(
  text: string,
): Array<{cls: EntityClass; pos: number; len: number}> {
  const hits: Array<{cls: EntityClass; pos: number; len: number}> = [];
  const textLow = text.toLowerCase();
  for (const {cls, words, caseInsensitive} of getEntityClassWords()) {
    for (const w of words) {
      const needle = caseInsensitive ? w.toLowerCase() : w;
      const hay = caseInsensitive ? textLow : text;
      let f = 0;
      while (f < hay.length) {
        const i = hay.indexOf(needle, f);
        if (i < 0) break;
        hits.push({cls, pos: i, len: needle.length});
        f = i + needle.length;
      }
    }
  }
  return hits;
}

/**
 * 在证据块内找距数字最近的实体类集合（平距并列全部收入，无遍历顺序偏向）。
 * opts.prev/next：表头与数据分家时邻块拼接（只影响校验距离，不改入库）。
 */
export function nearestEntityClassesToNumber(
  body: string,
  compactNum: string,
  opts?: {prev?: string; next?: string},
): Set<EntityClass> {
  const p = String(opts?.prev || "").replace(/,/g, "");
  const b = String(body || "").replace(/,/g, "");
  const n = String(opts?.next || "").replace(/,/g, "");
  const text = p + b + n;
  if (!compactNum || !b.includes(compactNum)) return new Set();

  const bodyStart = p.length;
  const bodyEnd = p.length + b.length;
  const numPositions: number[] = [];
  let from = bodyStart;
  while (from < bodyEnd) {
    const i = text.indexOf(compactNum, from);
    if (i < 0 || i >= bodyEnd) break;
    numPositions.push(i);
    from = i + compactNum.length;
  }
  if (!numPositions.length) return new Set();

  const hits = collectEntityHits(text);
  if (!hits.length) return new Set();

  /** 数字跨度含紧随的单位（亿/万/%），避免「9.9」截断使右侧实体看起来更远 */
  const numSpanEnd = (npos: number) => {
    let end = npos + compactNum.length;
    const um = text.slice(end).match(/^[%％亿万元]/);
    if (um) end += um[0].length;
    return end;
  };

  let minDist = Infinity;
  const atMin = new Set<EntityClass>();
  for (const npos of numPositions) {
    const numEnd = numSpanEnd(npos);
    for (const h of hits) {
      const entityEnd = h.pos + h.len;
      let dist: number;
      if (entityEnd <= npos) dist = npos - entityEnd;
      else if (h.pos >= numEnd) dist = h.pos - numEnd;
      else dist = 0;
      if (dist < minDist) {
        minDist = dist;
        atMin.clear();
        atMin.add(h.cls);
      } else if (dist === minDist) {
        atMin.add(h.cls);
      }
    }
  }
  return atMin;
}

/** @deprecated 单类版本；平距时任意一类；新代码用 nearestEntityClassesToNumber */
export function nearestEntityClassToNumber(
  body: string,
  compactNum: string,
): EntityClass | null {
  const set = nearestEntityClassesToNumber(body, compactNum);
  if (!set.size) return null;
  return set.values().next().value as EntityClass;
}

/**
 * CHUNK_SCOPE 对齐：含数字 chunk；若块内零实体词则拼接前后邻块再就近判定
 * （表头/数据分家；再出现 2 次同类误杀应转 JSON 双轨，勿继续堆启发式）
 */
export function alignMetricChunkScope(
  evidence: string,
  numToken: string,
  expectEntities: readonly string[],
): {
  ok: boolean;
  want: EntityClass | "unknown";
  nearest: Set<EntityClass>;
  stitched: boolean;
} {
  const want = entityClassOfLabels(expectEntities);
  const empty = {
    ok: false,
    want,
    nearest: new Set<EntityClass>(),
    stitched: false,
  };
  const compactNum = normalizeMetricToken(numToken).replace(/[%％亿万元]/g, "");
  if (!compactNum) return {...empty, ok: true};

  const ev = String(evidence || "");
  const hasChunks = ev.includes("⟦chunk:");
  const rawBlocks = hasChunks
    ? ev.split(/(?=⟦chunk:)/).filter((b) => b.trim())
    : [ev];
  const bodies = rawBlocks.map((block) =>
    block.replace(/^⟦chunk:[^\]]*⟧\s*/, ""),
  );

  let anyNearest = new Set<EntityClass>();
  let usedStitch = false;

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (
      !evidenceHasMetric(body, compactNum) &&
      !body.replace(/,/g, "").includes(compactNum)
    ) {
      continue;
    }
    let prev: string | undefined;
    let next: string | undefined;
    if (hasChunks && !bodyHasAnyEntityWord(body)) {
      prev = i > 0 ? bodies[i - 1] : undefined;
      next = i + 1 < bodies.length ? bodies[i + 1] : undefined;
      // 表头多在上：上一块已有实体则不拼下一块，避免下一品类 chunk 抢「最近」
      if (prev && bodyHasAnyEntityWord(prev)) {
        next = undefined;
      }
      if (prev || next) usedStitch = true;
    }
    const nearest = nearestEntityClassesToNumber(body, compactNum, {
      prev,
      next,
    });
    nearest.forEach((c) => anyNearest.add(c));
    if (want === "unknown") {
      if (nearest.size || blockHasEntity(body, expectEntities as string[])) {
        return {ok: true, want, nearest, stitched: usedStitch};
      }
      continue;
    }
    if (nearest.has(want)) {
      return {ok: true, want, nearest, stitched: usedStitch};
    }
  }

  if (!hasChunks) {
    const nearest = nearestEntityClassesToNumber(ev, compactNum);
    if (want === "unknown") {
      return {
        ok: nearest.size > 0 || blockHasEntity(ev, expectEntities as string[]),
        want,
        nearest,
        stitched: false,
      };
    }
    return {ok: nearest.has(want), want, nearest, stitched: false};
  }

  return {ok: false, want, nearest: anyNearest, stitched: usedStitch};
}

/**
 * 在证据中找数字出现位置，看实体是否对齐。
 * - WINDOW_TIGHT / WINDOW_LOOSE：数字 ±window 内含实体
 * - CHUNK_SCOPE(-1)：tip 已点名口径 —— 就近实体类（平距并列）∋ 期望类；
 *   数字块零实体时邻块拼接（表头分家）
 */
export function metricNearEntity(
  evidence: string,
  numToken: string,
  entities: string[],
  window: number = WINDOW_TIGHT,
): boolean {
  if (!entities.length) return true;
  const compactNum = normalizeMetricToken(numToken).replace(/[%％亿万元]/g, "");
  if (!compactNum) return true;

  if (window === CHUNK_SCOPE) {
    return alignMetricChunkScope(evidence, numToken, entities).ok;
  }

  const ev = String(evidence || "");
  const hasChunks = ev.includes("⟦chunk:");
  const chunks = hasChunks
    ? ev.split(/(?=⟦chunk:)/).filter((b) => b.trim())
    : [ev];
  const w = window > 0 ? window : WINDOW_LOOSE;

  for (const block of chunks) {
    const body = block.replace(/^⟦chunk:[^\]]*⟧\s*/, "");
    if (
      !evidenceHasMetric(body, compactNum) &&
      !body.replace(/,/g, "").includes(compactNum)
    ) {
      continue;
    }
    if (metricNearEntityInBlock(body, compactNum, entities, w)) {
      return true;
    }
  }
  if (!hasChunks) {
    return metricNearEntityInBlock(ev, compactNum, entities, w);
  }
  return false;
}

function metricNearEntityInBlock(
  evidence: string,
  compactNum: string,
  entities: readonly string[],
  window: number,
): boolean {
  const evNoComma = String(evidence || "").replace(/,/g, "");
  const positions: number[] = [];
  let from = 0;
  while (from < evNoComma.length) {
    const i = evNoComma.indexOf(compactNum, from);
    if (i < 0) break;
    positions.push(i);
    from = i + compactNum.length;
  }
  if (!positions.length) return false;
  for (const pos of positions) {
    const start = Math.max(0, pos - window);
    const end = Math.min(evNoComma.length, pos + compactNum.length + window);
    const slice = evNoComma.slice(start, end);
    if (blockHasEntity(slice, entities)) {
      return true;
    }
  }
  return false;
}

function lastIndexAny(s: string, words: readonly string[]): number {
  let best = -1;
  for (const w of words) {
    const i = s.lastIndexOf(w);
    if (i > best) best = i;
  }
  return best;
}

function firstIndexAny(s: string, words: readonly string[]): number {
  let best = Infinity;
  for (const w of words) {
    const i = s.indexOf(w);
    if (i >= 0 && i < best) best = i;
  }
  return best === Infinity ? -1 : best;
}

/** 最近品类命中词及其 labels（不做 ALL 兜底；词表来自画像） */
function lastCategoryHit(
  s: string,
): {at: number; labels: readonly string[]} | null {
  let best = -1;
  let labels: readonly string[] | null = null;
  const hay = s;
  const hayLow = s.toLowerCase();
  for (const {word, labels: lab, groupId} of getCategoryHitWords()) {
    const ci = !!getEntityClassWords().find((g) => g.cls === groupId)
      ?.caseInsensitive;
    const i = ci ? hayLow.lastIndexOf(word.toLowerCase()) : hay.lastIndexOf(word);
    if (i > best) {
      best = i;
      labels = lab;
    }
  }
  return best >= 0 && labels ? {at: best, labels} : null;
}

function firstCategoryHit(
  s: string,
): {at: number; labels: readonly string[]} | null {
  let best = Infinity;
  let labels: readonly string[] | null = null;
  const hay = s;
  const hayLow = s.toLowerCase();
  for (const {word, labels: lab, groupId} of getCategoryHitWords()) {
    const ci = !!getEntityClassWords().find((g) => g.cls === groupId)
      ?.caseInsensitive;
    const i = ci ? hayLow.indexOf(word.toLowerCase()) : hay.indexOf(word);
    if (i >= 0 && i < best) {
      best = i;
      labels = lab;
    }
  }
  return best < Infinity && labels ? {at: best, labels} : null;
}

export type TipLocalClaim =
  | {kind: "dapan" | "category"; labels: string[]}
  | {kind: "price-band"; labels: string[]};

/** 在 tip 正文里看数字左右近邻标了什么口径（用于多数字 tip 逐 token 归属）。
 *
 *  before：取最靠右的实体（离数字最近）；
 *  after：取最靠左的实体（离数字最近）——禁止用 lastIndex 把远处的「占大盘」抢成主量口径。
 */
export function entitiesClaimedNearNumberInTip(
  tip: string,
  numToken: string,
  window: number = WINDOW_TIGHT,
): TipLocalClaim | null {
  const tipFlat = String(tip || "").replace(/,/g, "");
  const compactNum = normalizeMetricToken(numToken).replace(/[%％亿万元]/g, "");
  if (!compactNum) return null;
  const idx = tipFlat.indexOf(compactNum);
  if (idx < 0) return null;
  const before = tipFlat.slice(Math.max(0, idx - window), idx);
  const after = tipFlat.slice(
    idx + compactNum.length,
    Math.min(tipFlat.length, idx + compactNum.length + window),
  );

  const pickCloser = (
    dapanAt: number,
    cat: {at: number; labels: readonly string[]} | null,
    /** before=越大越近；after=越小越近 */
    preferLarger: boolean,
  ): TipLocalClaim | null => {
    const catAt = cat?.at ?? -1;
    if (dapanAt < 0 && catAt < 0) return null;
    if (dapanAt < 0 && cat) {
      return {kind: "category", labels: [...cat.labels]};
    }
    if (catAt < 0) {
      return {kind: "dapan", labels: [...ENTITY_DAPAN]};
    }
    const catCloser = preferLarger ? catAt > dapanAt : catAt < dapanAt;
    if (catCloser && cat) {
      return {kind: "category", labels: [...cat.labels]};
    }
    return {kind: "dapan", labels: [...ENTITY_DAPAN]};
  };

  const fromBefore = (): TipLocalClaim | null => {
    if (!before) return null;
    return pickCloser(
      indexDapanOutsideShareIdiom(before, true),
      lastCategoryHit(before),
      true,
    );
  };

  const fromAfter = (): TipLocalClaim | null => {
    if (!after) return null;
    return pickCloser(
      indexDapanOutsideShareIdiom(after, false),
      firstCategoryHit(after),
      false,
    );
  };

  // 价格带区间本身即口径（避免「￥50-100 销量」被裸数字兜底误杀）；品类/大盘优先
  return (
    fromBefore() ||
    fromAfter() ||
    (hasPriceBand(tipFlat) ? {kind: "price-band", labels: ["价格带"]} : null)
  );
}

/** tip 内附属占比/同比/环比（%），且同 tip 已有万/亿主量：只验存在性，不单独就近实体。
 *  避免 KPI 表里「总销量/总销售额」抢「占比 5.5%」的最近类（源文本与 403.7万同格配对）。
 */
export function isCompanionRateToken(token: string, tip: string): boolean {
  const tipFlat = String(tip || "");
  if (!/[\d.]+\s*[万亿]/.test(tipFlat)) return false;
  const tok = normalizeMetricToken(token);
  if (/[%％]/.test(tok) || /[%％]/.test(token)) return true;
  const num = tok.replace(/[%％亿万元]/g, "");
  if (!num) return false;
  const flat = tipFlat.replace(/,/g, "");
  const idx = flat.indexOf(num);
  if (idx < 0) return false;
  const win = flat.slice(Math.max(0, idx - 12), idx + num.length + 8);
  return /占比|同比|环比|占大盘/.test(win);
}

/** 孤立数字碎片：整 tip 几乎只有一个短数字、无单位无实体 */
export function isOrphanNumberTip(tip: string): boolean {
  const s = String(tip || "").trim();
  if (!s) return false;
  if (/^[+\-]?\d{1,4}$/.test(s)) return true;
  if (/^[+\-]?\d{1,4}\s*$/.test(s)) return true;
  if (/^\d{2,4}\s*[:：]?\s*$/.test(s)) return true;
  return false;
}

/** 剥前缀后的 tip 正文 */
function tipBodyPlain(tip: string): string {
  return String(tip || "")
    .replace(
      /^(?:metric|list|col|column|栏|colSub|columnSub|栏副|副标)\s*[:：]\s*/i,
      "",
    )
    .trim();
}

/**
 * 短标签核心：去掉价签/销量数后的款名核心。
 * 专治「腰腹加宽/高弹衬衫 ¥129」与「… ¥119」两卡同款名。
 */
export function tipLabelCore(tip: string): string {
  return tipBodyPlain(tip)
    .replace(/[￥¥]\s*\d+(?:\.\d+)?/g, "")
    .replace(/\d+(?:\.\d+)?\s*[%％万亿]/g, "")
    .replace(/本期销量\s*[:：]?\s*/g, "")
    .replace(/[\s|｜]+/g, "")
    .toLowerCase();
}

/**
 * 半句截断：日期缺日、句尾虚词/连字符、价格带残词等。
 * 例：…至2024-04- / …均为各价格 / 同比+
 */
export function isTruncatedTip(tip: string): boolean {
  return isTruncatedPlainLine(tipBodyPlain(tip));
}

/**
 * 图表轴/图例碎片：价位刻度串、坐标轴黑话，不成句。
 */
export function isChartAxisFragmentTip(tip: string): boolean {
  return isChartAxisFragmentPlain(tipBodyPlain(tip));
}

/** 页内 ≥2 条图表碎片且几乎无成句指标 → 拒收 */
export function findChartAxisFragmentPage(
  tips: string[],
): string | null {
  const frags: string[] = [];
  let realMetric = 0;
  for (const tip of tips || []) {
    const raw = String(tip || "").trim();
    if (!raw) continue;
    if (/^(?:colSub|columnSub|栏副|副标|layout|col|column|栏)\s*[:：]/i.test(raw)) {
      continue;
    }
    if (isChartAxisFragmentTip(raw)) {
      frags.push(tipBodyPlain(raw).slice(0, 16));
      continue;
    }
    const body = tipBodyPlain(raw);
    if (/[%％]/.test(body) || /\d+(?:\.\d+)?\s*[万亿]/.test(body)) {
      realMetric += 1;
    } else if (/[\u4e00-\u9fff]{4,}/.test(body) && body.length >= 8) {
      realMetric += 1;
    }
  }
  if (frags.length >= 2 && realMetric === 0) {
    return (
      `要点多为图表轴/刻度碎片「${frags.slice(0, 2).join('、')}」；` +
      `请写成可读短句（含口径+数字），勿把坐标轴标签直接灌进卡片`
    );
  }
  return null;
}

export type ValidateTipsEvidenceOpts = {
  /** 大纲选型阶段声明的页意图；缺省则标题正则降级 */
  intent?: string | null;
  /** 定框绑定的主文档；扩库模式下跨文档数字须标来源 */
  boundSources?: string[] | null;
  /** bound_only | kb_supplement */
  retrievalScope?: string | null;
};

/** 从证据块头解析 src= */
export function sourcesForMetricInEvidence(
  evidence: string,
  token: string,
): string[] {
  const ev = String(evidence || "");
  const tok = normalizeMetricToken(token);
  if (!tok) return [];
  const parts = ev.split(/(?=⟦chunk:)/);
  const found = new Set<string>();
  for (const part of parts) {
    if (!part.trim()) continue;
    const head = part.match(/^⟦chunk:([^\]]*)⟧/);
    const body = head ? part.slice(head[0].length) : part;
    if (!evidenceHasMetric(body, tok) && !evidenceHasMetric(part, tok)) continue;
    const srcM = (head?.[1] || "").match(/(?:^|\|)src:([^|\]]+)/);
    const src = (srcM?.[1] || "").trim();
    if (src) found.add(src);
  }
  return [...found];
}

/**
 * 证据中该数字所在块的语义轴（ingest 写入的 axis= / |axes:）。
 * 有则查表，无则空——闸门可据此拒「价带数进面料页」，不必再猜词面。
 */
export function axesForMetricInEvidence(
  evidence: string,
  token: string,
): string[] {
  const ev = String(evidence || "");
  const tok = normalizeMetricToken(token);
  if (!tok) return [];
  const parts = ev.split(/(?=⟦chunk:)/);
  const found = new Set<string>();
  for (const part of parts) {
    if (!part.trim()) continue;
    const head = part.match(/^⟦chunk:([^\]]*)⟧/);
    const body = head ? part.slice(head[0].length) : part;
    if (!evidenceHasMetric(body, tok) && !evidenceHasMetric(part, tok)) continue;
    const axesHead = (head?.[1] || "").match(/(?:^|\|)axes:([^|\]]+)/);
    if (axesHead?.[1]) {
      for (const a of axesHead[1].split(",")) {
        const t = a.trim();
        if (t) found.add(t);
      }
    }
    // 行内 axis=价格带（format_extracts / 伪 doc）
    const lineRe = /axis\s*[=：]\s*([^\s|，,；;]+)/g;
    let lm: RegExpExecArray | null;
    while ((lm = lineRe.exec(body))) {
      // 仅收数字邻近行的轴：同段或同一行
      const lineStart = body.lastIndexOf("\n", lm.index) + 1;
      const lineEnd = body.indexOf("\n", lm.index);
      const line = body.slice(
        lineStart,
        lineEnd < 0 ? body.length : lineEnd,
      );
      if (evidenceHasMetric(line, tok) || evidenceHasMetric(body, tok)) {
        found.add(lm[1].trim());
      }
    }
  }
  return [...found];
}

export function tipHasSourceAttribution(tip: string): boolean {
  return /来源\s*[:：]|出处\s*[:：]|（来源[：:]/.test(String(tip || ""));
}

/** 从栏标题/短句解析口径归属（供 col: 继承） */
export function claimFromAxisTitle(
  axis: string,
): {kind: "dapan" | "category"; labels: string[]} | null {
  const s = String(axis || "").trim();
  if (!s) return null;
  if (DAPAN_CLAIM_RE.test(s) && !CATEGORY_CLAIM_RE.test(s)) {
    return {kind: "dapan", labels: [...ENTITY_DAPAN]};
  }
  if (/大盘/.test(s) && !CATEGORY_CLAIM_RE.test(s)) {
    return {kind: "dapan", labels: [...ENTITY_DAPAN]};
  }
  const cat = lastCategoryHit(s);
  if (cat) return {kind: "category", labels: [...cat.labels]};
  if (CATEGORY_CLAIM_RE.test(s)) {
    // 命中正则但 lastCategoryHit 未中 — 按画像 category 组拆
    for (const id of getActiveCorpusProfile().categoryGroupIds) {
      const words = wordsForEntityGroup(id);
      if (words.some((w) => w && s.toLowerCase().includes(w.toLowerCase()))) {
        return {kind: "category", labels: [...words]};
      }
    }
  }
  return null;
}

/**
 * 校验 tips 相对检索证据。
 * 每个数字 token 独立做存在性 + 实体对齐（禁止「一条 tip 两个数只验第一个」）。
 * columns 页：`col: 轴名` 后的短条目继承该栏口径（避免「同比+30.6%」掉栏成裸数字）。
 */
export function validateTipsAgainstEvidence(
  title: string,
  tips: string[],
  evidence: string,
  opts?: ValidateTipsEvidenceOpts,
): string | null {
  const ev = String(evidence || "").trim();
  if (!ev) {
    return null;
  }

  const intent = resolveSlideIntent(title, opts?.intent);
  const positionPage = intent === "category-position";
  const titleIsDapan = intent === "macro-market";
  const {requireNear} = titleEntityHints(title);
  const issues: string[] = [];
  /** 属性轴页：禁止价带区间 tip（轴名/标签来自画像） */
  const attrAxisPage = isAttrAxisPageTitle(String(title || ""));
  const attrLabelAlts = getActiveCorpusProfile()
    .attrAxes.flatMap((a) => a.labels)
    .map((w) => String(w || "").trim())
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const attrLabelRe = attrLabelAlts.length
    ? new RegExp(attrLabelAlts.join("|"))
    : /(?!)/;

  /** 当前分栏轴口径（遇下一个 col: 更新；colSub 不打断） */
  let colClaim: TipLocalClaim | null = null;

  for (const tip of tips || []) {
    const t = String(tip || "").trim();
    if (!t) continue;

    if (attrAxisPage && hasPriceBand(t) && !attrLabelRe.test(t)) {
      issues.push(
        `「${t}」含价格带区间，但本页是属性/面料轴；请改用棉/纯色等属性标签占比，禁止用¥价带销量凑数`,
      );
      continue;
    }
    // 查表：证据已标 axis=价格带 的数字，不得进属性页（18.80% 类串窗）
    if (attrAxisPage && !attrLabelRe.test(t) && !hasPriceBand(t)) {
      const toks = uniqueMetricTokens(extractMetricTokens(t));
      const priceAxisTok = toks.find((tok) =>
        axesForMetricInEvidence(ev, tok).includes("价格带"),
      );
      if (priceAxisTok) {
        issues.push(
          `「${t}」数字「${priceAxisTok}」在证据中标注 axis=价格带，不能写入属性/面料页；请改用棉/纯色等属性标签占比`,
        );
        continue;
      }
    }

    const colM = t.match(/^(?:col|column|栏)\s*[:：]\s*(.+)$/i);
    if (colM) {
      colClaim = claimFromAxisTitle(colM[1]);
      if (!EVIDENCE_METRIC_RE.test(t)) continue;
    } else if (/^(?:colSub|columnSub|栏副|副标)\s*[:：]/i.test(t)) {
      if (!EVIDENCE_METRIC_RE.test(t)) continue;
    } else if (
      /^(?:metric|list)\s*[:：]/i.test(t) &&
      !EVIDENCE_METRIC_RE.test(t)
    ) {
      continue;
    }

    if (isOrphanNumberTip(t)) {
      issues.push(`「${t}」像截断碎片，须写完整口径（含单位/价格带名）`);
      continue;
    }

    if (isTruncatedTip(t)) {
      issues.push(`「${t}」疑似半句截断（日期/虚词/价格带残缺），请补全后再填`);
      continue;
    }

    if (isChartAxisFragmentTip(t)) {
      issues.push(
        `「${t}」像图表轴/刻度标签，请改写成含口径的短句，勿直接灌坐标文字`,
      );
      continue;
    }

    // 采样窗/日期副标：不是指标，不做数字↔实体对齐
    if (isSamplingWindowTip(t)) {
      continue;
    }

    const tokens = uniqueMetricTokens(extractMetricTokens(t));
    if (!tokens.length) continue;

    const tipClaimsDapan = tipClaimsBareDapan(t);
    const tipClaimsCat = CATEGORY_CLAIM_RE.test(t);

    if (tipClaimsDapan && !tipClaimsCat && !titleIsDapan && !positionPage) {
      issues.push(
        `「${t}」是大盘口径，本页标题点名品类，禁止把大盘总销量写成品类事实`,
      );
      continue;
    }

    // 位次页：有「占大盘x%」但未点名衬衫/polo → 主量会被误当成大盘；要求写清品类
    if (
      positionPage &&
      SHARE_OF_MACRO_RE.test(t) &&
      !tipClaimsCat &&
      /[\d.]+\s*[万亿]/.test(t)
    ) {
      issues.push(
        `「${t}」写了占大盘份额但未点名衬衫/polo；请写成「3.3亿 男士衬衫销售额，占大盘5.6%」这类品类主量+份额`,
      );
      continue;
    }

    for (const token of tokens) {
      if (!evidenceHasMetric(ev, token)) {
        issues.push(
          `「${t}」中的数字「${token}」未在本页检索证据中出现（禁止编造或串窗）`,
        );
        break;
      }

      // 有主文档时：按检索范围约束跨文档数字
      const bound = (opts?.boundSources || [])
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      const rScope = String(opts?.retrievalScope || "").toLowerCase();
      if (bound.length) {
        const srcs = sourcesForMetricInEvidence(ev, token);
        if (srcs.length) {
          const inBound = srcs.some((s) =>
            bound.some((b) => s === b || s.includes(b) || b.includes(s)),
          );
          if (!inBound) {
            if (rScope === "bound_only" || rScope === "bound") {
              issues.push(
                `「${t}」中的数字「${token}」来自未绑定文档「${srcs[0]}」；` +
                  `当前为「仅用所选文档」，禁止整段引用库外材料（如防晒服白皮书）`,
              );
              break;
            }
            if (
              (rScope === "kb_supplement" || rScope === "supplement") &&
              !tipHasSourceAttribution(t)
            ) {
              issues.push(
                `「${t}」中的数字「${token}」仅见于补充文档「${srcs[0]}」，` +
                  `请标注「（来源：${srcs[0]}）」或改用主文档口径`,
              );
              break;
            }
          }
        }
      }

      if (!requireNear.length && intent === "generic") continue;

      const numOnly = normalizeMetricToken(token).replace(/[%％亿万元]/g, "");
      if (!numOnly) continue;

      const local =
        entitiesClaimedNearNumberInTip(t, numOnly) || colClaim;
      // 价格带 tip 已点名区间（含 ¥50以下/以上）：只验证据存在
      if (local?.kind === "price-band" || (intent === "price-band" && hasPriceBand(t))) {
        continue;
      }
      // tip 已点名品类/大盘 + 同条有万/亿主量时：占比/同比% 只验存在，不单独就近
      if (
        isCompanionRateToken(token, t) &&
        (local?.kind === "category" ||
          local?.kind === "dapan" ||
          tipClaimsCat ||
          tipClaimsDapan ||
          !!colClaim)
      ) {
        continue;
      }
      let expectEntities: string[];
      if (local?.kind === "dapan") {
        expectEntities = local.labels;
      } else if (local?.kind === "category") {
        expectEntities = local.labels;
      } else if (tipClaimsDapan && !tipClaimsCat && positionPage) {
        expectEntities = [...ENTITY_DAPAN];
      } else if (requireNear.length) {
        // 无 tip/栏口径：禁止裸同比环比挂多实体页（须写清衬衫/polo/大盘或放在对应 col: 下）
        issues.push(
          `「${t}」含数字但未点名口径；请写在对应 \`col: 衬衫/polo/大盘\` 下，或 tip 内写明品类/大盘，禁止裸同比/环比`,
        );
        break;
      } else {
        continue;
      }

      // tip/栏已点名 → CHUNK_SCOPE（就近类 + 邻块拼接）；否则短窗
      const useChunkScope =
        !!local ||
        (tipClaimsDapan && !tipClaimsCat && positionPage);
      const alignWindow = useChunkScope ? CHUNK_SCOPE : WINDOW_TIGHT;
      if (alignWindow === CHUNK_SCOPE) {
        const aligned = alignMetricChunkScope(ev, numOnly, expectEntities);
        if (aligned.ok) continue;
        const want = aligned.want;
        const nearest = [...aligned.nearest];
        if (want !== "unknown" && nearest.length && !aligned.nearest.has(want)) {
          const zh = getEntityClassLabelZh();
          const got = nearest.map((c) => zh[c] || c).join("/");
          const wantZh = zh[want] || want;
          issues.push(
            `「${t}」点名${wantZh}，但数字「${token}」在证据中最近实体是${got}，禁止串用`,
          );
          break;
        }
        if (!nearest.length) {
          issues.push(
            `「${t}」数字「${token}」所在证据块未找到实体词（疑似表头与数据分家），疑似张冠李戴`,
          );
          break;
        }
        issues.push(
          `「${t}」数字「${token}」在证据中与本页实体未对齐，疑似张冠李戴`,
        );
        break;
      }
      if (metricNearEntity(ev, numOnly, expectEntities, alignWindow)) {
        continue;
      }

      issues.push(
        `「${t}」数字「${token}」在证据中与本页实体未对齐，疑似张冠李戴`,
      );
      break;
    }
  }

  if (positionPage && CATEGORY_TITLE_RE.test(title)) {
    const hasCatTip = (tips || []).some((tip) =>
      CATEGORY_CLAIM_RE.test(String(tip || "")),
    );
    if (!hasCatTip) {
      issues.push(
        "品类位置页除大盘对照外，至少一条 tip 须点名衬衫或 polo（含栏标题）",
      );
    }
  }

  if (!issues.length) return null;
  return `页「${title}」数值不忠实：${issues[0]}`;
}

/** 同页 tips 去重（完全相同、或去掉价签后短标签核心相同）。
 * 跨卡/跨栏：去掉 list:/metric: 前缀后全页比对；colSub/副标 允许弱重复。
 */
export function findDuplicateTips(tips: string[]): string | null {
  const seenExact = new Set<string>();
  const seenCore = new Set<string>();
  for (const tip of tips || []) {
    const raw = String(tip || "").trim();
    if (!raw) continue;
    if (/^(?:colSub|columnSub|栏副|副标|layout|col|column|栏)\s*[:：]/i.test(raw)) {
      continue;
    }
    const body = raw
      .replace(/^(?:metric|list)\s*[:：]\s*/i, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!body || body.length < 4) continue;
    if (seenExact.has(body)) {
      return `存在重复要点「${raw.slice(0, 24)}」，禁止同文填两卡（含跨卡）`;
    }
    seenExact.add(body);

    const core = tipLabelCore(raw);
    // 短款名核心 ≥4 字且含中文：同款不同价也算跨卡重复
    if (
      core.length >= 4 &&
      /[\u4e00-\u9fff]/.test(core) &&
      // 纯数字残核跳过
      !/^\d+$/.test(core)
    ) {
      if (seenCore.has(core)) {
        return (
          `存在重复短标签「${core.slice(0, 20)}」` +
          `（已忽略价签差异），禁止同款名填两卡`
        );
      }
      seenCore.add(core);
    }
  }
  return null;
}

/** 页题与 tip 同文（页题串台成第一条 tip） */
export function findTitleTipEcho(title: string, tips: string[]): string | null {
  const t = String(title || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  if (!t || t.length < 8) return null;
  for (const tip of tips || []) {
    const raw = String(tip || "").trim();
    if (!raw) continue;
    if (/^(?:col|column|栏|colSub|栏副|副标|layout)\s*[:：]/i.test(raw)) continue;
    const body = raw
      .replace(/^(?:metric|list)\s*[:：]\s*/i, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (body === t || (t.length >= 12 && body.includes(t)) || (body.length >= 12 && t.includes(body))) {
      return `页题与要点同文「${String(title).slice(0, 20)}」，页题须≤16 字短标题，事实放 tips`;
    }
  }
  return null;
}

/**
 * 分栏副标同文：修复（保首个删其余）而非整页拒收。
 */
export function dropDuplicateColSub(tips: string[]): {
  tips: string[];
  dropped: string | null;
} {
  const seen = new Set<string>();
  let dropped: string | null = null;
  const out: string[] = [];
  for (const tip of tips || []) {
    const raw = String(tip || "").trim();
    if (/^(?:colSub|columnSub|栏副|副标)\s*[:：]/i.test(raw)) {
      const key = raw.replace(/\s+/g, "").toLowerCase();
      if (seen.has(key)) {
        if (!dropped) dropped = raw.slice(0, 24);
        continue;
      }
      seen.add(key);
    }
    out.push(tip);
  }
  return dropped ? {tips: out, dropped} : {tips: tips || [], dropped: null};
}
