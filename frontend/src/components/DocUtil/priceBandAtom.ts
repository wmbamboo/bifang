/**
 * 价格带类型解析器（域无关）。
 *
 * 人脑两步里的第一步：¥100-200 → {kind, min, max, bound}。
 * 表面形式（全半角/以下/以上/连字符）只在本文件归一；闸门只消费对象。
 * 轴归属（「不能进面料页」）属域相关，住在 corpusProfile，不在此堆正则。
 */

export type PriceBandBound = "range" | "below" | "above";

export type PriceBand = {
  kind: "price_band";
  min: number | null;
  max: number | null;
  bound: PriceBandBound;
  /** 原文切片（归一化前位置对应） */
  raw: string;
  index: number;
  length: number;
};

/** 全角数字/货币/连字符 → 半角，便于单一文法 */
export function normalizePriceBandSurface(s: string): string {
  return String(s || "")
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
    )
    .replace(/￥/g, "¥")
    .replace(/～/g, "~")
    .replace(/—|–|－/g, "-");
}

const NUM = String.raw`\d+(?:\.\d+)?`;
/** 区间分隔 */
const SEP = String.raw`[-~至到]`;

/**
 * 捕获组（或分支）：
 * 1-2: ¥ min SEP max 元?
 * 3-4: min SEP max 元（无币符须带「元」）
 * 5:   ¥ n 元? 以下
 * 6:   ¥ n 元? 以上
 * 7:   n 元 以下
 * 8:   n 元 以上
 */
const BAND_FIND_RE = new RegExp(
  String.raw`¥\s*(${NUM})\s*${SEP}\s*(${NUM})\s*元?` +
    String.raw`|(${NUM})\s*${SEP}\s*(${NUM})\s*元` +
    String.raw`|¥\s*(${NUM})\s*元?\s*以下` +
    String.raw`|¥\s*(${NUM})\s*元?\s*以上` +
    String.raw`|(${NUM})\s*元\s*以下` +
    String.raw`|(${NUM})\s*元\s*以上`,
  "g",
);

function toNum(x: string | undefined): number | null {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function bandFromMatch(
  m: RegExpExecArray,
  indexInOriginal: number,
  rawSlice: string,
): PriceBand | null {
  const mk = (
    min: number | null,
    max: number | null,
    bound: PriceBandBound,
  ): PriceBand => ({
    kind: "price_band",
    min,
    max,
    bound,
    raw: rawSlice,
    index: indexInOriginal,
    length: rawSlice.length,
  });
  if (m[1] != null && m[2] != null) {
    const min = toNum(m[1]);
    const max = toNum(m[2]);
    if (min == null || max == null) return null;
    return mk(min, max, "range");
  }
  if (m[3] != null && m[4] != null) {
    const min = toNum(m[3]);
    const max = toNum(m[4]);
    if (min == null || max == null) return null;
    return mk(min, max, "range");
  }
  if (m[5] != null) {
    const max = toNum(m[5]);
    return max == null ? null : mk(null, max, "below");
  }
  if (m[6] != null) {
    const min = toNum(m[6]);
    return min == null ? null : mk(min, null, "above");
  }
  if (m[7] != null) {
    const max = toNum(m[7]);
    return max == null ? null : mk(null, max, "below");
  }
  if (m[8] != null) {
    const min = toNum(m[8]);
    return min == null ? null : mk(min, null, "above");
  }
  return null;
}

/**
 * 整段解析：成功则返回类型化价带，否则 null。
 * 入口唯一——新表面形式只改本函数/文法。
 */
export function parsePriceBand(s: string): PriceBand | null {
  const raw = String(s || "").trim();
  if (!raw) return null;
  const norm = normalizePriceBandSurface(raw);
  const re = new RegExp(`^(?:${BAND_FIND_RE.source})$`);
  const m = re.exec(norm);
  if (!m) return null;
  const band = bandFromMatch(m, 0, raw);
  if (!band) return null;
  // 整段必须吃干净（允许首尾空白已 trim）
  if (m[0].length !== norm.length) return null;
  return band;
}

/** 扫描文本中全部价带对象（不重叠，左到右） */
export function findPriceBands(text: string): PriceBand[] {
  const original = String(text || "");
  if (!original) return [];
  const norm = normalizePriceBandSurface(original);
  // 归一化保持长度一致（逐字替换），index 可对齐
  if (norm.length !== original.length) {
    // 防御：若将来归一改变长度，退回在 norm 上找再尽量映射
  }
  const out: PriceBand[] = [];
  const re = new RegExp(BAND_FIND_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const idx = m.index;
    const rawSlice = original.slice(idx, idx + m[0].length);
    const band = bandFromMatch(m, idx, rawSlice);
    if (band) out.push(band);
  }
  return out;
}

export function hasPriceBand(text: string): boolean {
  return findPriceBands(text).length > 0;
}

/** 数字落在某价带 raw 跨度内（忠实度：边界不当指标） */
export function numberInsidePriceBand(
  tip: string,
  index: number,
  len: number,
): boolean {
  if (index < 0 || len <= 0) return false;
  const end = index + len;
  for (const b of findPriceBands(tip)) {
    if (index >= b.index && end <= b.index + b.length) return true;
  }
  return false;
}

/** 裸数字是否为语境中某价带的 min/max 边界 */
export function numberIsPriceBandEdge(
  numToken: string,
  context: string,
): boolean {
  const n = Number(String(numToken || "").trim());
  if (!Number.isFinite(n)) return false;
  return findPriceBands(context).some(
    (b) => b.min === n || b.max === n,
  );
}

// ─── 兼容层：旧正则/字符串 API 委托类型化入口 ───

/** @deprecated 优先 parsePriceBand / findPriceBands；仅供尚未迁移的 .test() */
export const PRICE_BAND_ATOM_RE =
  /[￥¥]\s*\d+(?:\.\d+)?\s*[-~～至到]\s*\d+(?:\.\d+)?\s*元?|[￥¥]\s*\d+(?:\.\d+)?\s*元?\s*(?:以下|以上)|\d+(?:\.\d+)?\s*元\s*(?:以下|以上)/g;

export const PRICE_BAND_TOKEN_RE = new RegExp(
  PRICE_BAND_ATOM_RE.source,
  PRICE_BAND_ATOM_RE.flags.replace("g", ""),
);

export function isPriceBandAtom(text: string): boolean {
  return parsePriceBand(text) != null;
}

export function extractPriceBandAtoms(text: string): string[] {
  return findPriceBands(text).map((b) => b.raw);
}

const MASK_PREFIX = "⟦价带";
const MASK_SUFFIX = "⟧";

/** 拆「标题 - 描述」前先遮罩价带，避免 ¥50-100 被当成分隔符 */
export function maskPriceBandAtoms(text: string): {
  masked: string;
  bands: string[];
} {
  const found = findPriceBands(text);
  const bands = found.map((b) => b.raw);
  if (!found.length) return {masked: String(text || ""), bands};
  // 从右往左替换，index 不漂移
  let masked = String(text || "");
  for (let i = found.length - 1; i >= 0; i--) {
    const b = found[i];
    masked =
      masked.slice(0, b.index) +
      `${MASK_PREFIX}${i}${MASK_SUFFIX}` +
      masked.slice(b.index + b.length);
  }
  return {masked, bands};
}

export function unmaskPriceBandAtoms(
  text: string,
  bands: string[],
): string {
  return String(text || "").replace(
    new RegExp(`${MASK_PREFIX}(\\d+)${MASK_SUFFIX}`, "g"),
    (_, i: string) => bands[Number(i)] ?? _,
  );
}

/**
 * 在「标题 - 描述」类分隔上拆行：价带内连字符不参与拆分。
 * 找不到安全分隔则返回 null。
 */
export function splitTitleDescProtectingPriceBands(
  body: string,
  sepRe: RegExp,
): {title: string; desc: string} | null {
  const {masked, bands} = maskPriceBandAtoms(body);
  const m = masked.match(sepRe);
  if (!m || m.index == null) return null;
  const title = unmaskPriceBandAtoms(masked.slice(0, m.index).trim(), bands);
  const desc = unmaskPriceBandAtoms(
    masked.slice(m.index + m[0].length).trim(),
    bands,
  );
  if (!title || !desc) return null;
  return {title, desc};
}
