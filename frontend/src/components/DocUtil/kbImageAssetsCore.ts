/**
 * 图鉴选图纯函数（无 umi/request），供 Jest 与运行时共用。
 */
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
};

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
  },
): KbAssetLike[] {
  const count = opts?.count ?? Math.max(4, captions.length || 4);
  const used = opts?.usedIds || new Set<string>();
  const title = opts?.title || "";
  const out: Array<KbAssetLike | null> = Array.from({length: count}, () => null);

  const findManual = (
    ref: ManualAssetRef | null | undefined,
  ): KbAssetLike | null => {
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

  for (let i = 0; i < count; i++) {
    const man = findManual(opts?.manual?.[i]);
    if (!man) continue;
    const key = assetKey(man);
    if (used.has(key)) continue;
    out[i] = man;
    used.add(key);
  }

  for (let i = 0; i < count; i++) {
    if (out[i]) continue;
    const cap = captions[i] || captions[0] || title;
    let best: KbAssetLike | null = null;
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
    if (best && bestScore >= 2) {
      out[i] = best;
      used.add(assetKey(best));
    }
  }

  const need = out.filter((x) => !x).length;
  if (need > 0) {
    const fillers = selectImageGridCandidates(assets, need, used);
    let fi = 0;
    for (let i = 0; i < count; i++) {
      if (out[i]) continue;
      out[i] = fillers[fi++] || null;
    }
  }

  return out.filter((x): x is KbAssetLike => !!x).slice(0, count);
}
