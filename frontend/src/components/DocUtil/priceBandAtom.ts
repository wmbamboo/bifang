/**
 * 价格带原子：人脑把「50元以下 / ¥50-100 / ¥100-200」当成一个对象，
 * 不是两个数字或「标题-描述」分隔符。解析、忠实度、成品闸共用本模块。
 */

/** 价带整段（区间 / 以下 / 以上）；匹配后应整段保留，禁止从中间的 - 拆开 */
export const PRICE_BAND_ATOM_RE =
  /[￥¥]\s*\d+(?:\.\d+)?\s*[-~～至到]\s*\d+(?:\.\d+)?\s*元?|[￥¥]\s*\d+(?:\.\d+)?\s*元?\s*(?:以下|以上)|\d+(?:\.\d+)?\s*元\s*(?:以下|以上)/g;

/** 与历史 PRICE_BAND_TOKEN_RE 兼容的「是否含价带」检测（非 global） */
export const PRICE_BAND_TOKEN_RE = new RegExp(
  PRICE_BAND_ATOM_RE.source,
  PRICE_BAND_ATOM_RE.flags.replace("g", ""),
);

export function isPriceBandAtom(text: string): boolean {
  const s = String(text || "").trim();
  if (!s) return false;
  const re = new RegExp(`^${PRICE_BAND_ATOM_RE.source}$`);
  return re.test(s);
}

export function extractPriceBandAtoms(text: string): string[] {
  const s = String(text || "");
  const out: string[] = [];
  const re = new RegExp(PRICE_BAND_ATOM_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[0]) out.push(m[0].trim());
  }
  return out;
}

const MASK_PREFIX = "⟦价带";
const MASK_SUFFIX = "⟧";

/** 拆「标题 - 描述」前先遮罩价带，避免 ¥50-100 被当成分隔符 */
export function maskPriceBandAtoms(text: string): {
  masked: string;
  bands: string[];
} {
  const bands: string[] = [];
  const re = new RegExp(PRICE_BAND_ATOM_RE.source, "g");
  const masked = String(text || "").replace(re, (m) => {
    const i = bands.length;
    bands.push(m);
    return `${MASK_PREFIX}${i}${MASK_SUFFIX}`;
  });
  return { masked, bands };
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
): { title: string; desc: string } | null {
  const { masked, bands } = maskPriceBandAtoms(body);
  const m = masked.match(sepRe);
  if (!m || m.index == null) return null;
  const title = unmaskPriceBandAtoms(masked.slice(0, m.index).trim(), bands);
  const desc = unmaskPriceBandAtoms(
    masked.slice(m.index + m[0].length).trim(),
    bands,
  );
  if (!title || !desc) return null;
  return { title, desc };
}
