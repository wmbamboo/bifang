/**
 * 图鉴选图：文案对齐 + 手动优先 + 证据 asset_ids；I/O 在本文件，纯函数见 kbImageAssetsCore。
 */
import type {KbAssetItem} from "@/services/chatchat/kb";
import {fetchAssetBytes, listAssets} from "@/services/chatchat/kb";
import {
  assertImageGridSameSource,
  assetKey,
  extractAlignTokens,
  filterAssetsByImageGridCategory,
  inferImageGridCategory,
  normalizeAssetId,
  scoreAssetAgainstCaption,
  selectImageGridByCaptions,
  selectImageGridCandidates,
  type ManualAssetRef,
} from "@/components/DocUtil/kbImageAssetsCore";
import {aspectDeviation, readImageSize} from "@/components/DocUtil/imageBufferMeta";

export type {ManualAssetRef};
export {
  assetKey,
  extractAlignTokens,
  filterAssetsByImageGridCategory,
  inferImageGridCategory,
  normalizeAssetId,
  scoreAssetAgainstCaption,
  selectImageGridByCaptions,
  selectImageGridCandidates,
};

export type PickedGridImage = {
  asset: KbAssetItem;
  bytes: ArrayBuffer;
};

export type LoadImageGridResult = {
  picked: PickedGridImage[];
  /** 空槽 / 拉取失败，须上报 UI，勿仅 console.warn */
  warnings: string[];
};

async function unwrapAssetList(res: unknown): Promise<KbAssetItem[]> {
  const list = (res as any)?.data ?? res;
  return Array.isArray(list) ? (list as KbAssetItem[]) : [];
}

/** 拉库并按证据 asset_ids / 文案 / 手动选图，返回字节 + 告警 */
export async function loadImageGridBytes(
  kbName: string,
  count = 4,
  usedIds?: Set<string>,
  opts?: {
    fileName?: string;
    title?: string;
    captions?: string[];
    manual?: Array<ManualAssetRef | null | undefined>;
    preferredAssetIds?: string[];
  },
): Promise<LoadImageGridResult> {
  const warnings: string[] = [];
  if (!kbName || kbName === "all" || kbName === "__all__") {
    return {picked: [], warnings: ["知识库未指定，跳过图鉴取图"]};
  }
  const fileName = (opts?.fileName || "").trim();
  if (!fileName) {
    warnings.push("未传 fileName，将扫全库资产（易跨文档串图）");
  }
  const res = await listAssets({
    knowledge_base_name: kbName,
    file_name: fileName,
    kinds: "image,chart",
  });
  const assets = await unwrapAssetList(res);
  const captions = opts?.captions || [];
  const title = opts?.title || "";
  const category = inferImageGridCategory(title, captions);
  if (category) {
    const narrowed = filterAssetsByImageGridCategory(assets, category);
    if (narrowed.length < assets.length) {
      warnings.push(
        `品类「${category === "polo" ? "polo" : "衬衫"}」已过滤 ${assets.length - narrowed.length} 张异品类图`,
      );
    }
  }
  const preferredAssetIds = (opts?.preferredAssetIds || [])
    .map((id) => normalizeAssetId(id))
    .filter(Boolean);
  const pickedMeta =
    captions.length ||
    opts?.manual?.some(Boolean) ||
    preferredAssetIds.length
      ? selectImageGridByCaptions(assets, captions, {
          title,
          manual: opts?.manual,
          usedIds,
          count,
          preferredAssetIds,
          category,
          strictCategory: true,
        })
      : selectImageGridCandidates(
          filterAssetsByImageGridCategory(assets, category),
          count,
          usedIds,
        );

  if (pickedMeta.length < count) {
    warnings.push(
      `图鉴仅选到 ${pickedMeta.length}/${count} 张（缺槽将保留模板占位图）`,
    );
  }
  const srcErr = assertImageGridSameSource(pickedMeta);
  if (srcErr) warnings.push(srcErr);

  // image_grid 槽位约 2.8:1（模板 slide43）；偏差>15% 须靠灌模 srcRect 裁切
  const SLOT_ASPECT_W = 5120640;
  const SLOT_ASPECT_H = 1828800;

  const out: PickedGridImage[] = [];
  for (const a of pickedMeta) {
    try {
      const bytes = await fetchAssetBytes({
        knowledge_base_name: a.kb_name || kbName,
        file_name: a.file_name || fileName || "",
        asset_id: a.asset_id,
      });
      const size =
        a.w && a.h
          ? {w: a.w, h: a.h}
          : readImageSize(bytes);
      if (size) {
        const dev = aspectDeviation(
          size.w,
          size.h,
          SLOT_ASPECT_W,
          SLOT_ASPECT_H,
        );
        if (dev > 0.15) {
          warnings.push(
            `${a.asset_id} 宽高比偏差 ${(dev * 100).toFixed(0)}%，灌模须写 srcRect cover`,
          );
        }
      }
      out.push({asset: a as KbAssetItem, bytes});
      if (usedIds) usedIds.add(assetKey(a));
    } catch (e) {
      const msg = `拉取失败 ${a.asset_id}`;
      warnings.push(msg);
      console.warn("fetch asset failed", a.asset_id, e);
    }
  }
  return {picked: out, warnings};
}
