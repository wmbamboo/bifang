/**
 * 图鉴选图：文案对齐页号 + 手动指定优先 + 顺序回退。
 */
import type { KbAssetItem } from "@/services/chatchat/kb";
import { fetchAssetBytes, listAssets } from "@/services/chatchat/kb";

export type PickedGridImage = {
  asset: KbAssetItem;
  bytes: ArrayBuffer;
};

export type ManualAssetRef = {
  file_name: string;
  asset_id: string;
};

export function assetKey(a: { doc?: string; file_name?: string; asset_id: string }): string {
  return `${a.file_name || a.doc || ""}|${a.asset_id}`;
}

/** 文案 token：数字 + 中文 2～4 字滑动窗（避免整句贪心匹配失败） */
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

/** 文案与资产 snippet/页 的相关分；越高越同源 */
export function scoreAssetAgainstCaption(
  asset: KbAssetItem,
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
  // 商品图略优于 chart
  if (asset.kind === "image") score += 0.5;
  return score;
}

/** 从资产列表挑图鉴候选（顺序回退；商品图优先） */
export function selectImageGridCandidates(
  assets: KbAssetItem[],
  count = 4,
  usedIds?: Set<string>,
): KbAssetItem[] {
  const used = usedIds || new Set<string>();
  const images = (assets || [])
    .filter((a) => a.kind === "image")
    .sort((a, b) => a.page - b.page || a.idx - b.idx);
  const out: KbAssetItem[] = [];
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

/**
 * 按图注/标题对齐选图：每条 caption 选得分最高且未用的资产；
 * 手动指定优先；不足再顺序补。
 */
export function selectImageGridByCaptions(
  assets: KbAssetItem[],
  captions: string[],
  opts?: {
    title?: string;
    manual?: Array<ManualAssetRef | null | undefined>;
    usedIds?: Set<string>;
    count?: number;
  },
): KbAssetItem[] {
  const count = opts?.count ?? Math.max(4, captions.length || 4);
  const used = opts?.usedIds || new Set<string>();
  const title = opts?.title || "";
  const out: Array<KbAssetItem | null> = Array.from({ length: count }, () => null);

  const findManual = (ref: ManualAssetRef | null | undefined): KbAssetItem | null => {
    if (!ref?.asset_id) return null;
    return (
      (assets || []).find(
        (a) =>
          a.asset_id === ref.asset_id &&
          (!ref.file_name ||
            a.file_name === ref.file_name ||
            a.doc === ref.file_name.replace(/\.pdf$/i, "")),
      ) || null
    );
  };

  // 1) 手动槽位
  for (let i = 0; i < count; i++) {
    const man = findManual(opts?.manual?.[i]);
    if (!man) continue;
    const key = assetKey(man);
    if (used.has(key)) continue;
    out[i] = man;
    used.add(key);
  }

  // 2) 文案对齐
  for (let i = 0; i < count; i++) {
    if (out[i]) continue;
    const cap = captions[i] || captions[0] || title;
    let best: KbAssetItem | null = null;
    let bestScore = 0;
    for (const a of assets || []) {
      const key = assetKey(a);
      if (used.has(key)) continue;
      if (a.kind !== "image" && a.kind !== "chart") continue;
      const sc = scoreAssetAgainstCaption(a, cap, title);
      if (sc > bestScore) {
        bestScore = sc;
        best = a;
      }
    }
    // 至少要有一点命中，否则留给顺序回退（避免乱配高分噪声）
    if (best && bestScore >= 2) {
      out[i] = best;
      used.add(assetKey(best));
    }
  }

  // 3) 顺序回退填空
  const need = out.filter((x) => !x).length;
  if (need > 0) {
    const fillers = selectImageGridCandidates(assets, need, used);
    let fi = 0;
    for (let i = 0; i < count; i++) {
      if (out[i]) continue;
      out[i] = fillers[fi++] || null;
    }
  }

  return out.filter((x): x is KbAssetItem => !!x).slice(0, count);
}

async function unwrapAssetList(res: unknown): Promise<KbAssetItem[]> {
  const list = (res as any)?.data ?? res;
  return Array.isArray(list) ? (list as KbAssetItem[]) : [];
}

/** 拉库并按文案/手动选图，返回字节 */
export async function loadImageGridBytes(
  kbName: string,
  count = 4,
  usedIds?: Set<string>,
  opts?: {
    fileName?: string;
    title?: string;
    captions?: string[];
    manual?: Array<ManualAssetRef | null | undefined>;
  },
): Promise<PickedGridImage[]> {
  if (!kbName || kbName === "all" || kbName === "__all__") return [];
  const res = await listAssets({
    knowledge_base_name: kbName,
    file_name: opts?.fileName || "",
    kinds: "image,chart",
  });
  const assets = await unwrapAssetList(res);
  const captions = opts?.captions || [];
  const picked =
    captions.length || opts?.manual?.some(Boolean)
      ? selectImageGridByCaptions(assets, captions, {
          title: opts?.title,
          manual: opts?.manual,
          usedIds,
          count,
        })
      : selectImageGridCandidates(assets, count, usedIds);

  const out: PickedGridImage[] = [];
  for (const a of picked) {
    try {
      const bytes = await fetchAssetBytes({
        knowledge_base_name: a.kb_name || kbName,
        file_name: a.file_name,
        asset_id: a.asset_id,
      });
      out.push({ asset: a, bytes });
    } catch (e) {
      console.warn("fetch asset failed", a.asset_id, e);
    }
  }
  return out;
}
