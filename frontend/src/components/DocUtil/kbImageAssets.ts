/**
 * 图鉴选图：文案对齐 + 手动优先；I/O 在本文件，纯函数见 kbImageAssetsCore。
 */
import type {KbAssetItem} from "@/services/chatchat/kb";
import {fetchAssetBytes, listAssets} from "@/services/chatchat/kb";
import {
  assetKey,
  extractAlignTokens,
  scoreAssetAgainstCaption,
  selectImageGridByCaptions,
  selectImageGridCandidates,
  type ManualAssetRef,
} from "@/components/DocUtil/kbImageAssetsCore";

export type {ManualAssetRef};
export {
  assetKey,
  extractAlignTokens,
  scoreAssetAgainstCaption,
  selectImageGridByCaptions,
  selectImageGridCandidates,
};

export type PickedGridImage = {
  asset: KbAssetItem;
  bytes: ArrayBuffer;
};

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
        file_name: a.file_name || "",
        asset_id: a.asset_id,
      });
      out.push({asset: a as KbAssetItem, bytes});
    } catch (e) {
      console.warn("fetch asset failed", a.asset_id, e);
    }
  }
  return out;
}
