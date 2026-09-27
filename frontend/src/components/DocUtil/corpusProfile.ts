/**
 * 语料画像：层 3 词面规则（实体表 / 轴词 / 品类正则）的唯一数据源。
 * 闸门代码只「加载画像→应用」；换域=换 JSON，不发版。
 *
 * 默认装载 apparel；测试可用 setActiveCorpusProfile / resetCorpusProfile。
 * 后续可由 KB `assets/<域>/profile.json` 覆盖（见 loadCorpusProfileJson）。
 */

import apparelJson from "@/data/corpusProfiles/apparel.json";
import digital3cStubJson from "@/data/corpusProfiles/digital3c.stub.json";
import foodJson from "@/data/corpusProfiles/food.json";

export type CorpusEntityGroup = {
  id: string;
  labelZh: string;
  words: string[];
  caseInsensitive?: boolean;
};

export type CorpusAttrAxis = {
  axis: string;
  titleHints: string[];
  labels: string[];
  /** 单字短 hint（如「袖」）须正文已有专属 label 才定轴 */
  shortHintNeedsLabel?: boolean;
};

export type CorpusCoverageItemDef = {
  id: string;
  label: string;
  titleHints: string[];
  required?: boolean;
  requiredIfTopicHints?: string[];
};

export type CorpusProfileJson = {
  id: string;
  label?: string;
  version?: number;
  macroGroupId: string;
  shareOfMacroIdioms: string[];
  entityGroups: CorpusEntityGroup[];
  categoryGroupIds: string[];
  attrAxes: CorpusAttrAxis[];
  attrPageTitleHints: string[];
  priceBandPageHints: string[];
  coverageDetectHints: string[];
  coverageItems: CorpusCoverageItemDef[];
};

export type EntityClass = string;

export type CompiledCorpusProfile = {
  raw: CorpusProfileJson;
  entityGroups: CorpusEntityGroup[];
  macroGroupId: string;
  categoryGroupIds: readonly string[];
  /** 品类标题/口径 */
  categoryTitleRe: RegExp;
  categoryClaimRe: RegExp;
  dapanClaimRe: RegExp;
  shareOfMacroRe: RegExp;
  attrPageTitleRe: RegExp;
  priceBandPageRe: RegExp;
  entityById: Map<string, readonly string[]>;
  categoryHitWords: Array<{word: string; labels: readonly string[]; groupId: string}>;
  dapanHitWords: readonly string[];
  entityClassWords: Array<{cls: EntityClass; words: string[]; caseInsensitive: boolean}>;
  entityClassLabelZh: Record<string, string>;
  attrAxes: readonly CorpusAttrAxis[];
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unionAlt(words: readonly string[], flags = "i"): RegExp {
  const alts = words
    .map((w) => String(w || "").trim())
    .filter(Boolean)
    .map(escapeRe);
  if (!alts.length) return /(?!)/; // never match
  return new RegExp(alts.join("|"), flags);
}

export function compileCorpusProfile(raw: CorpusProfileJson): CompiledCorpusProfile {
  const entityGroups = (raw.entityGroups || []).map((g) => ({
    ...g,
    words: [...(g.words || [])],
  }));
  const entityById = new Map<string, readonly string[]>();
  for (const g of entityGroups) {
    entityById.set(g.id, g.words);
  }
  const macroId = raw.macroGroupId || "dapan";
  const categoryIds = [...(raw.categoryGroupIds || [])];
  const catWords: string[] = [];
  for (const id of categoryIds) {
    catWords.push(...(entityById.get(id) || []));
  }
  const dapanWords = [...(entityById.get(macroId) || [])];
  const share = [...(raw.shareOfMacroIdioms || [])];

  const categoryHitWords: CompiledCorpusProfile["categoryHitWords"] = [];
  for (const id of categoryIds) {
    const labels = entityById.get(id) || [];
    for (const word of [...labels].sort((a, b) => b.length - a.length)) {
      categoryHitWords.push({word, labels, groupId: id});
    }
  }
  // 较长词优先
  categoryHitWords.sort((a, b) => b.word.length - a.word.length);

  const entityClassWords = entityGroups.map((g) => ({
    cls: g.id as EntityClass,
    words: [...g.words].sort((a, b) => b.length - a.length),
    caseInsensitive: !!g.caseInsensitive,
  }));

  const entityClassLabelZh: Record<string, string> = {};
  for (const g of entityGroups) {
    entityClassLabelZh[g.id] = g.labelZh || g.id;
  }

  return {
    raw,
    entityGroups,
    macroGroupId: macroId,
    categoryGroupIds: categoryIds,
    categoryTitleRe: unionAlt(catWords, "i"),
    categoryClaimRe: unionAlt(catWords, "i"),
    dapanClaimRe: unionAlt(dapanWords, ""),
    shareOfMacroRe: share.length ? unionAlt(share, "") : /(?!)/,
    attrPageTitleRe: unionAlt(raw.attrPageTitleHints || [], ""),
    priceBandPageRe: unionAlt(raw.priceBandPageHints || [], ""),
    entityById,
    categoryHitWords,
    dapanHitWords: dapanWords,
    entityClassWords,
    entityClassLabelZh,
    attrAxes: [...(raw.attrAxes || [])],
  };
}

export const APPAREL_PROFILE_JSON = apparelJson as CorpusProfileJson;
export const DIGITAL3C_STUB_PROFILE_JSON = digital3cStubJson as CorpusProfileJson;
export const FOOD_PROFILE_JSON = foodJson as CorpusProfileJson;

let active: CompiledCorpusProfile = compileCorpusProfile(APPAREL_PROFILE_JSON);

/** 兼容导出：随 setActiveCorpusProfile 更新（ESM live binding） */
export let ENTITY_DAPAN: readonly string[] = active.entityById.get("dapan") || [];
export let ENTITY_SHIRT: readonly string[] = active.entityById.get("shirt") || [];
export let ENTITY_POLO: readonly string[] = active.entityById.get("polo") || [];
export let ENTITY_CATEGORY_ALL: readonly string[] = [
  ...ENTITY_SHIRT,
  ...ENTITY_POLO,
  ...(active.entityById.get("tee") || []),
];
export let CATEGORY_TITLE_RE: RegExp = active.categoryTitleRe;
export let CATEGORY_CLAIM_RE: RegExp = active.categoryClaimRe;
export let DAPAN_CLAIM_RE: RegExp = active.dapanClaimRe;
export let SHARE_OF_MACRO_RE: RegExp = active.shareOfMacroRe;
export let ATTR_AXIS_LEXICON: readonly CorpusAttrAxis[] = active.attrAxes;

function syncCompatExports(): void {
  ENTITY_DAPAN = active.entityById.get(active.macroGroupId) || [];
  ENTITY_SHIRT = active.entityById.get("shirt") || [];
  ENTITY_POLO = active.entityById.get("polo") || [];
  const tee = active.entityById.get("tee") || [];
  const cats: string[] = [];
  for (const id of active.categoryGroupIds) {
    cats.push(...(active.entityById.get(id) || []));
  }
  ENTITY_CATEGORY_ALL = cats.length ? cats : [...ENTITY_SHIRT, ...ENTITY_POLO, ...tee];
  CATEGORY_TITLE_RE = active.categoryTitleRe;
  CATEGORY_CLAIM_RE = active.categoryClaimRe;
  DAPAN_CLAIM_RE = active.dapanClaimRe;
  SHARE_OF_MACRO_RE = active.shareOfMacroRe;
  ATTR_AXIS_LEXICON = active.attrAxes;
}

export function getActiveCorpusProfile(): CompiledCorpusProfile {
  return active;
}

export function setActiveCorpusProfile(raw: CorpusProfileJson): CompiledCorpusProfile {
  active = compileCorpusProfile(raw);
  syncCompatExports();
  return active;
}

export function resetCorpusProfile(): CompiledCorpusProfile {
  return setActiveCorpusProfile(APPAREL_PROFILE_JSON);
}

export function loadCorpusProfileJson(raw: unknown): CompiledCorpusProfile {
  if (!raw || typeof raw !== "object") {
    throw new Error("corpus profile: expected object");
  }
  const p = raw as CorpusProfileJson;
  if (!p.id || !Array.isArray(p.entityGroups)) {
    throw new Error("corpus profile: missing id/entityGroups");
  }
  return setActiveCorpusProfile(p);
}

export function wordsForEntityGroup(id: string): readonly string[] {
  return active.entityById.get(id) || [];
}

export function getCategoryHitWords(): CompiledCorpusProfile["categoryHitWords"] {
  return active.categoryHitWords;
}

export function getDapanHitWords(): readonly string[] {
  return active.dapanHitWords;
}

export function getEntityClassWords(): CompiledCorpusProfile["entityClassWords"] {
  return active.entityClassWords;
}

export function getEntityClassLabelZh(): Record<string, string> {
  return active.entityClassLabelZh;
}

/** 去掉份额附属语后再判是否点名大盘总盘口径 */
export function tipClaimsBareDapan(tip: string): boolean {
  let stripped = String(tip || "");
  for (const idiom of active.raw.shareOfMacroIdioms || []) {
    if (idiom) stripped = stripped.split(idiom).join("");
  }
  return active.dapanClaimRe.test(stripped);
}

export function isAttrAxisPageTitle(title: string): boolean {
  return active.attrPageTitleRe.test(String(title || ""));
}

export function isPriceBandPageTitle(title: string): boolean {
  return active.priceBandPageRe.test(String(title || ""));
}

/** 填充检索：按页题生成【检索偏向】行，避免 lastUser 主题污染 primary */
export function retrievalBiasLineForTitle(title: string): string {
  const t = String(title || "").trim();
  if (!t) return "";
  if (isAttrAxisPageTitle(t)) {
    const axes = active.attrAxes.map((a) => a.axis).join(" ");
    return `【检索偏向】属性 面料 材质 占比 ${axes}`.trim();
  }
  if (isPriceBandPageTitle(t)) {
    return "【检索偏向】价格带 价位 客单";
  }
  if (active.dapanClaimRe.test(t) && !active.categoryTitleRe.test(t)) {
    return "【检索偏向】大盘 总销量 总销售额";
  }
  return "";
}

/** 主题是否命中当前画像的覆盖检测（未命中则覆盖闸跳过） */
export function topicMatchesProfileCoverage(topicBlob: string): boolean {
  const hints = active.raw.coverageDetectHints || [];
  if (!hints.length) return false;
  const t = String(topicBlob || "");
  // 至少命中 2 个 hint，避免单字误触
  let n = 0;
  for (const h of hints) {
    if (h && t.toLowerCase().includes(h.toLowerCase())) n += 1;
    if (n >= 2) return true;
  }
  return false;
}

export function buildCoverageItemsFromProfile(topicBlob: string): Array<{
  id: string;
  label: string;
  titleHints: string[];
  required: boolean;
}> {
  if (!topicMatchesProfileCoverage(topicBlob)) return [];
  const t = String(topicBlob || "");
  const out: Array<{
    id: string;
    label: string;
    titleHints: string[];
    required: boolean;
  }> = [];
  for (const item of active.raw.coverageItems || []) {
    let required = !!item.required;
    if (item.requiredIfTopicHints?.length) {
      required = item.requiredIfTopicHints.some(
        (h) => h && t.toLowerCase().includes(h.toLowerCase()),
      );
    }
    if (!required) continue;
    out.push({
      id: item.id,
      label: item.label,
      titleHints: [...item.titleHints],
      required: true,
    });
  }
  return out;
}
