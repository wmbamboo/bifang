/**
 * 图鉴：从填充证据 chunk 头提取 asset_ids / src，写入 tips 的 img: 行。
 * 故意不依赖 ViewItem4Ppt（避免 Jest 拉 nanoid）。
 */
import {
  inferImageGridCategory,
  normalizeAssetId,
} from "@/components/DocUtil/kbImageAssetsCore";

export type SlideImageAssetRef = {file_name: string; asset_id: string};

const IMG_ASSET_LINE = /^img\s*[:：]\s*(.*)$/i;

export function parseImgAssetLine(tip: string): SlideImageAssetRef | null {
  const m = (tip || "").trim().match(IMG_ASSET_LINE);
  if (!m) return null;
  const body = (m[1] || "").trim();
  if (!body) return {file_name: "", asset_id: ""};
  const pipe = body.indexOf("|");
  if (pipe >= 0) {
    return {
      file_name: body.slice(0, pipe).trim(),
      asset_id: body.slice(pipe + 1).trim(),
    };
  }
  return {file_name: "", asset_id: body};
}

export function formatImgAssetLine(ref: SlideImageAssetRef): string {
  const f = (ref.file_name || "").trim();
  const a = (ref.asset_id || "").trim();
  return f ? `img: ${f}|${a}` : `img: ${a}`;
}

export type EvidenceAssetChunk = {
  page: string;
  src: string;
  assetIds: string[];
  body: string;
};

/** 解析 ⟦chunk:…|src:…|assets:a,b⟧ */
export function parseEvidenceAssetChunks(evidence: string): EvidenceAssetChunk[] {
  const ev = String(evidence || "");
  if (!ev.includes("⟦chunk:")) return [];
  const parts = ev.split(/(?=⟦chunk:)/).filter((b) => b.trim());
  const out: EvidenceAssetChunk[] = [];
  for (const part of parts) {
    const head = part.match(/^⟦chunk:([^\]]*)⟧/);
    if (!head) continue;
    const meta = head[1] || "";
    const body = part.slice(head[0].length);
    const srcM = meta.match(/(?:^|\|)src:([^|\]]+)/);
    const assetsM = meta.match(/(?:^|\|)assets:([^|\]]+)/);
    const pageM = meta.match(/(?:^|\|)page:([^|\]]*)/);
    const assetIds = (assetsM?.[1] || "")
      .split(",")
      .map((s) => normalizeAssetId(s.trim()))
      .filter(Boolean);
    if (!assetIds.length) continue;
    out.push({
      page: (pageM?.[1] || "").trim(),
      src: (srcM?.[1] || "").trim(),
      assetIds,
      body,
    });
  }
  return out;
}

/**
 * 选证据块：优先 body 与 captions 有数字/中文 token 重叠的块，否则取 asset 最多者。
 */
export function pickEvidenceAssetsForGrid(
  evidence: string,
  captions: string[],
  count = 4,
  title = "",
): SlideImageAssetRef[] {
  const chunks = parseEvidenceAssetChunks(evidence);
  if (!chunks.length) return [];
  const blob = captions.join("\n");
  const category = inferImageGridCategory(title, captions);
  const tokens = [
    ...new Set(
      [
        ...(blob.match(/\d+(?:\.\d+)?/g) || []).filter((t) => t.length >= 2),
        ...(blob.match(/[\u4e00-\u9fff]{2,4}/g) || []),
      ].map((t) => t.toLowerCase()),
    ),
  ];
  let best = chunks[0];
  let bestScore = -1;
  for (const c of chunks) {
    let sc = c.assetIds.length;
    const low = c.body.toLowerCase();
    for (const t of tokens) {
      if (low.includes(t)) sc += /\d/.test(t) ? 3 : 2;
    }
    // 品类加权：polo 页优先含 polo 的块，衬衫页优先含衬衫的块
    if (category === "polo") {
      if (/polo/i.test(c.body)) sc += 8;
      if (/衬衫/.test(c.body) && !/polo/i.test(c.body)) sc -= 12;
    } else if (category === "shirt") {
      if (/衬衫/.test(c.body)) sc += 8;
      if (/polo/i.test(c.body) && !/衬衫/.test(c.body)) sc -= 12;
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  const src = best.src || "";
  return best.assetIds.slice(0, count).map((asset_id) => ({
    file_name: src,
    asset_id,
  }));
}

/** 把 img: 绑定并入 tips（去重；保留已有非空 img） */
export function mergeImageAssetTips(
  tips: string[],
  refs: SlideImageAssetRef[],
): string[] {
  const base = (tips || [])
    .map((t) => String(t || "").trim())
    .filter((t) => t && !parseImgAssetLine(t));
  const existing = (tips || [])
    .map((t) => parseImgAssetLine(t))
    .filter((r): r is SlideImageAssetRef => !!r?.asset_id);
  const use = existing.length ? existing : refs;
  const imgLines = use
    .filter((r) => r?.asset_id)
    .map((r) => formatImgAssetLine(r));
  return [...base, ...imgLines];
}

/** 从 tips / subTitle 推断来源文档名（首个带 file_name 的 img:） */
export function inferFileNameFromImageTips(text: string): string {
  for (const line of String(text || "").split("\n")) {
    const ref = parseImgAssetLine(line);
    if (ref?.file_name) return ref.file_name;
  }
  return "";
}

export function preferredAssetIdsFromImageTips(text: string): string[] {
  const out: string[] = [];
  for (const line of String(text || "").split("\n")) {
    const ref = parseImgAssetLine(line);
    if (ref?.asset_id) out.push(normalizeAssetId(ref.asset_id));
  }
  return out;
}
