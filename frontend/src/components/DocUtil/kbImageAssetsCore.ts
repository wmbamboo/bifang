/**
 * 图鉴选图纯函数（无 umi/request），供 Jest 与运行时共用。
 */
import {ENTITY_POLO, ENTITY_SHIRT} from "@/components/DocUtil/corpusProfile";

export type KbAssetLike = {
  doc?: string;
  file_name?: string;
  asset_id: string;
  page: number;
  kind: string;
  idx: number;
  snippet?: string;
  kb_name?: string;
  url?: string;
  w?: number;
  h?: number;
};

/** 归一化 asset_id：统一相对路径形态，便于与证据/列表对齐 */
export function normalizeAssetId(assetId: string): string {
  const rel = String(assetId || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!rel) return "";
  if (rel.includes("/")) return rel;
  // 裸名：元素图惯例挂 elements/
  if (/_p\d+_(img|chart)\d+\./i.test(rel)) return `elements/${rel}`;
  return rel;
}

export function assetIdsEqual(a: string, b: string): boolean {
  const na = normalizeAssetId(a);
  const nb = normalizeAssetId(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // 裸名 ↔ elements/裸名
  const an = na.includes("/") ? na.split("/").pop()! : na;
  const bn = nb.includes("/") ? nb.split("/").pop()! : nb;
  return !!an && an === bn;
}

/** 五·4.3：图鉴槽位须同源文档（跨文档串图即失败） */
export function assertImageGridSameSource(
  assets: Array<{file_name?: string; doc?: string}>,
): string | null {
  const files = [
    ...new Set(
      (assets || [])
        .map((a) => String(a.file_name || a.doc || "").trim())
        .filter(Boolean),
    ),
  ];
  if (files.length > 1) {
    return `图鉴图片跨文档（${files.slice(0, 3).join("、")}），须同源 asset_id`;
  }
  return null;
}

/** 图鉴页品类：用于隔离 polo / 衬衫元素图池 */
export type ImageGridCategory = "polo" | "shirt";

function blobHasAny(blob: string, words: readonly string[]): boolean {
  const s = String(blob || "");
  for (const w of words) {
    const t = String(w || "").trim();
    if (!t) continue;
    if (t.toLowerCase() !== t) {
      if (s.includes(t)) return true;
    } else if (s.toLowerCase().includes(t.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * 从页题/图注推断图鉴品类。标题优先；双品类并存时看标题偏向。
 */
export function inferImageGridCategory(
  title: string,
  captions: string[] = [],
): ImageGridCategory | null {
  const titleS = String(title || "");
  const tipBlob = captions.join("\n");
  const blob = `${titleS}\n${tipBlob}`;
  const poloWords = [...ENTITY_POLO, "polo", "Polo"];
  const shirtWords = [...ENTITY_SHIRT];
  const titlePolo = blobHasAny(titleS, poloWords) || /polo/i.test(titleS);
  const titleShirt = blobHasAny(titleS, shirtWords);
  if (titlePolo && !titleShirt) return "polo";
  if (titleShirt && !titlePolo) return "shirt";
  if (titlePolo && titleShirt) {
    // 「polo热销…」vs「衬衫热销…」：谁先出现谁赢
    const pi = titleS.search(/polo/i);
    const si = titleS.indexOf("衬衫");
    if (pi >= 0 && (si < 0 || pi < si)) return "polo";
    if (si >= 0) return "shirt";
  }
  const tipPolo = blobHasAny(tipBlob, poloWords) || /polo/i.test(tipBlob);
  const tipShirt = blobHasAny(tipBlob, shirtWords);
  if (tipPolo && !tipShirt) return "polo";
  if (tipShirt && !tipPolo) return "shirt";
  return null;
}

/** 资产 snippet/文件名是否属该品类（拒绝对品类专属页） */
export function assetMatchesImageGridCategory(
  asset: KbAssetLike,
  category: ImageGridCategory,
): boolean {
  const blob = `${asset.snippet || ""} ${asset.asset_id || ""} ${asset.doc || ""}`;
  const hasPolo = blobHasAny(blob, [...ENTITY_POLO, "polo"]) || /polo/i.test(blob);
  const hasShirt = blobHasAny(blob, ENTITY_SHIRT);
  if (category === "polo") {
    // 纯衬衫页（snippet 有衬衫无 polo）剔除
    if (hasShirt && !hasPolo) return false;
    return true;
  }
  // shirt：纯 polo 页剔除
  if (hasPolo && !hasShirt) return false;
  return true;
}

export function filterAssetsByImageGridCategory(
  assets: KbAssetLike[],
  category: ImageGridCategory | null | undefined,
): KbAssetLike[] {
  if (!category) return assets || [];
  const kept = (assets || []).filter((a) =>
    assetMatchesImageGridCategory(a, category),
  );
  // 滤空则退回原池（避免库内无 snippet 时一张都没有）
  return kept.length ? kept : assets || [];
}

export type ManualAssetRef = {
  file_name: string;
  asset_id: string;
};

export function assetKey(a: {
  doc?: string;
  file_name?: string;
  asset_id: string;
}): string {
  return `${a.file_name || a.doc || ""}|${a.asset_id}`;
}

/** 文案 token：数字 + 中文 2～4 字滑动窗 */
export function extractAlignTokens(text: string): string[] {
  const s = String(text || "");
  const out: string[] = [];
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) {
    if ((m[0] || "").length >= 2) out.push(m[0]);
  }
  for (const m of s.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const seg = m[0];
    const maxLen = Math.min(4, seg.length);
    for (let len = 2; len <= maxLen; len++) {
      for (let i = 0; i + len <= seg.length; i++) {
        out.push(seg.slice(i, i + len));
      }
    }
  }
  return [...new Set(out)];
}

export function scoreAssetAgainstCaption(
  asset: KbAssetLike,
  caption: string,
  title = "",
): number {
  const blob = `${asset.snippet || ""} ${asset.page || ""}`.toLowerCase();
  const query = `${title}\n${caption}`;
  const tokens = extractAlignTokens(query);
  if (!tokens.length) return 0;
  let score = 0;
  for (const tok of tokens) {
    const t = tok.toLowerCase();
    if (blob.includes(t)) {
      score += /\d/.test(tok) ? 3 : 2;
    }
  }
  if (asset.kind === "image") score += 0.5;
  return score;
}

export function selectImageGridCandidates(
  assets: KbAssetLike[],
  count = 4,
  usedIds?: Set<string>,
): KbAssetLike[] {
  const used = usedIds || new Set<string>();
  const images = (assets || [])
    .filter((a) => a.kind === "image")
    .sort((a, b) => a.page - b.page || a.idx - b.idx);
  const out: KbAssetLike[] = [];
  for (const a of images) {
    const key = assetKey(a);
    if (used.has(key)) continue;
    out.push(a);
    used.add(key);
    if (out.length >= count) break;
  }
  if (out.length < count) {
    const charts = (assets || [])
      .filter((a) => a.kind === "chart")
      .sort((a, b) => a.page - b.page || a.idx - b.idx);
    for (const a of charts) {
      const key = assetKey(a);
      if (used.has(key)) continue;
      out.push(a);
      used.add(key);
      if (out.length >= count) break;
    }
  }
  return out;
}

export function selectImageGridByCaptions(
  assets: KbAssetLike[],
  captions: string[],
  opts?: {
    title?: string;
    manual?: Array<ManualAssetRef | null | undefined>;
    usedIds?: Set<string>;
    count?: number;
    /** 证据 chunk 的 asset_ids：优先绑定，文案相似度只在池内 / 兜底 */
    preferredAssetIds?: string[];
    /** 品类过滤；默认从 title+captions 推断 */
    category?: ImageGridCategory | null;
    /** 为 true 时绝不跨品类兜底（默认 true） */
    strictCategory?: boolean;
  },
): KbAssetLike[] {
  const count = opts?.count ?? Math.max(4, captions.length || 4);
  const used = opts?.usedIds || new Set<string>();
  const title = opts?.title || "";
  const out: Array<KbAssetLike | null> = Array.from({length: count}, () => null);
  const category =
    opts?.category !== undefined
      ? opts.category
      : inferImageGridCategory(title, captions);
  const strictCategory = opts?.strictCategory !== false;
  // 品类池：polo/衬衫互斥；手动指定仍可从全量找（人工覆盖）
  const catPool = filterAssetsByImageGridCategory(assets || [], category);
  const pool = strictCategory && category ? catPool : assets || [];

  const findById = (
    assetId: string,
    from: KbAssetLike[] = pool,
  ): KbAssetLike | null => {
    const id = normalizeAssetId(assetId);
    if (!id) return null;
    return (
      from.find(
        (a) =>
          (a.kind === "image" || a.kind === "chart") &&
          assetIdsEqual(a.asset_id, id),
      ) || null
    );
  };

  const findManual = (
    ref: ManualAssetRef | null | undefined,
  ): KbAssetLike | null => {
    if (!ref?.asset_id) return null;
    // 手动选图允许跨品类（用户明确点的）
    return (
      (assets || []).find(
        (a) =>
          assetIdsEqual(a.asset_id, ref.asset_id) &&
          (!ref.file_name ||
            a.file_name === ref.file_name ||
            a.doc === ref.file_name.replace(/\.pdf$/i, "")),
      ) || null
    );
  };

  // 0) preferred：只保留品类池内的 id（证据若串到衬衫页则丢掉）
  const preferred = (opts?.preferredAssetIds || [])
    .map((id) => findById(id, pool))
    .filter((a): a is KbAssetLike => !!a);

  for (let i = 0; i < count; i++) {
    const man = findManual(opts?.manual?.[i]);
    if (!man) continue;
    const key = assetKey(man);
    if (used.has(key)) continue;
    out[i] = man;
    used.add(key);
  }

  // 1) preferred：槽位映射 → 池内文案 → 池内页序补空（不跨品类）
  if (preferred.length) {
    for (let i = 0; i < count; i++) {
      if (out[i]) continue;
      const cand = preferred[i];
      if (!cand) continue;
      const key = assetKey(cand);
      if (used.has(key)) continue;
      out[i] = cand;
      used.add(key);
    }
    for (let i = 0; i < count; i++) {
      if (out[i]) continue;
      const cap = captions[i] || captions[0] || title;
      let best: KbAssetLike | null = null;
      let bestScore = 0;
      for (const a of preferred) {
        const key = assetKey(a);
        if (used.has(key)) continue;
        const sc = scoreAssetAgainstCaption(a, cap, title);
        if (sc > bestScore) {
          bestScore = sc;
          best = a;
        }
      }
      if (best && bestScore >= 2) {
        out[i] = best;
        used.add(assetKey(best));
      }
    }
    const rest = preferred
      .filter((a) => !used.has(assetKey(a)))
      .sort((a, b) => a.page - b.page || a.idx - b.idx);
    let ri = 0;
    for (let i = 0; i < count; i++) {
      if (out[i]) continue;
      const a = rest[ri++];
      if (!a) break;
      out[i] = a;
      used.add(assetKey(a));
    }
  }

  // 2) 文案相似度：只在品类池内（禁止 polo 页扫到衬衫店铺图）
  for (let i = 0; i < count; i++) {
    if (out[i]) continue;
    const cap = captions[i] || captions[0] || title;
    let best: KbAssetLike | null = null;
    let bestScore = 0;
    for (const a of pool) {
      const key = assetKey(a);
      if (used.has(key)) continue;
      if (a.kind !== "image" && a.kind !== "chart") continue;
      const sc = scoreAssetAgainstCaption(a, cap, title);
      if (sc > bestScore) {
        bestScore = sc;
        best = a;
      }
    }
    if (best && bestScore >= 2) {
      out[i] = best;
      used.add(assetKey(best));
    }
  }

  // 3) 顺序补空：仍限品类池；strict 时绝不回退全库
  const need = out.filter((x) => !x).length;
  if (need > 0) {
    const fillers = selectImageGridCandidates(pool, need, used);
    let fi = 0;
    for (let i = 0; i < count; i++) {
      if (out[i]) continue;
      out[i] = fillers[fi++] || null;
    }
  }

  return out.filter((x): x is KbAssetLike => !!x).slice(0, count);
}
