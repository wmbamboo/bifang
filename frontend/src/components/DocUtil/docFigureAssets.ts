/**
 * Word 段落插图资产附录（九·2 / 十·7 7a′）：纯函数，不 import 服务层。
 * assetRef 口径与 resolveAssetBytes 一致：kb:<fileName>/<assetId>
 */
export type DocFigureAsset = {
  fileName: string;
  assetId: string;
  caption?: string;
};

/** 材料池 key → 该 chunk 的源文件与 asset_ids */
export type DocKeyAssetRow = {
  source?: string;
  file_name?: string;
  asset_ids?: string[];
  page?: string | number;
  chunk?: string | number;
};

/** 从 KB chat 返回的 docs[] 抽出资产 */
export function figureAssetsFromKbDocs(docs: unknown[]): DocFigureAsset[] {
  const out: DocFigureAsset[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(docs)) return out;
  for (const d of docs) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const fileName = String(
      row.source || row.file_name || row.title || row.doc || "",
    ).trim();
    const aids = Array.isArray(row.asset_ids)
      ? row.asset_ids.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const snippet = String(
      row.snippet || row.content || row.page_content || row.text || "",
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24);
    for (const assetId of aids) {
      if (!fileName || !assetId) continue;
      const key = `${fileName}|${assetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({fileName, assetId, caption: snippet || undefined});
    }
  }
  return out;
}

/**
 * 7a′：按本段 assigned 材料键筛资产（段落级），替掉全库 listAssets 前 N 条。
 */
export function figureAssetsFromAssignedKeys(
  assignedKeys: string[] | undefined,
  keyAssets: Record<string, DocKeyAssetRow> | undefined,
  limit = 6,
): DocFigureAsset[] {
  const out: DocFigureAsset[] = [];
  const seen = new Set<string>();
  if (!assignedKeys?.length || !keyAssets) return out;
  for (const k of assignedKeys) {
    const row = keyAssets[k];
    if (!row) continue;
    const fileName = String(row.source || row.file_name || "").trim();
    const aids = Array.isArray(row.asset_ids)
      ? row.asset_ids.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const cap =
      row.page != null && String(row.page) !== ""
        ? `p${row.page}`
        : undefined;
    for (const assetId of aids) {
      if (!fileName || !assetId) continue;
      const dedupe = `${fileName}|${assetId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({fileName, assetId, caption: cap});
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 从 listAssets 风格条目抽出（遗留兜底；写作链优先用 figureAssetsFromAssignedKeys） */
export function figureAssetsFromAssetList(
  assets: Array<{file_name?: string; asset_id?: string; snippet?: string}>,
  limit = 12,
): DocFigureAsset[] {
  const out: DocFigureAsset[] = [];
  const seen = new Set<string>();
  for (const a of assets || []) {
    const fileName = String(a.file_name || "").trim();
    const assetId = String(a.asset_id || "").trim();
    if (!fileName || !assetId) continue;
    const key = `${fileName}|${assetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      fileName,
      assetId,
      caption: String(a.snippet || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 24) || undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function formatKbAssetRef(fileName: string, assetId: string): string {
  return `kb:${fileName}/${assetId}`;
}

/** 三十五：本地上传 ref（key 不含 upload: 前缀） */
export function formatUploadAssetRef(key: string): string {
  return `upload:${String(key || "").trim()}`;
}

export function isUploadAssetRef(ref: string): boolean {
  return normalizeKbAssetRef(ref).startsWith("upload:");
}

/**
 * 二十四·C：ref 归一化（解析侧与白名单匹配侧共用）。
 * - 去首尾空白与包裹引号/反引号
 * - `kb:` 后多余空白收掉（`kb: a.pdf/1` → `kb:a.pdf/1`）
 */
export function normalizeKbAssetRef(raw: string): string {
  let r = String(raw || "").trim();
  r = r.replace(/^[`"']+/, "").replace(/[`"']+$/, "").trim();
  r = r.replace(/^kb:\s*/i, "kb:");
  r = r.replace(/^upload:\s*/i, "upload:");
  return r;
}

/**
 * 三十三：解析 kb:<fileName>/<assetId>（assetId 可含 elements/、whole/）。
 */
export function parseKbAssetRef(
  raw: string,
): {fileName: string; assetId: string} | null {
  const ref = normalizeKbAssetRef(raw);
  if (!ref.startsWith("kb:")) return null;
  const path = ref.slice(3);
  const slash = path.indexOf("/");
  if (slash < 0) return null;
  const fileName = path.slice(0, slash).trim();
  const assetId = path.slice(slash + 1).trim();
  if (!fileName || !assetId) return null;
  return {fileName, assetId};
}

/** 整页图（将降采样） */
export function isWholePageAssetId(assetId: string): boolean {
  const id = String(assetId || "");
  if (id.startsWith("whole/")) return true;
  return !/_p\d+_(img|chart)\d+/i.test(id);
}

/** 列表页 / 换图宫格：拼无鉴权 asset_file URL（勿整字节 fetch） */
export function kbAssetFileUrl(
  kbName: string,
  fileName: string,
  assetId: string,
): string {
  const base = (process.env.bf_baseUrl || "").replace(/\/$/, "");
  const q = new URLSearchParams({
    knowledge_base_name: kbName,
    file_name: fileName,
    asset_id: assetId,
  });
  return `${base}/knowledge_base/asset_file?${q.toString()}`;
}

/** 三十三·5：手选后同步白名单（纯函数，可测） */
export function applyManualFigureRef(
  p: {
    blocks: Array<{kind: string; assetRef?: string; caption?: string}>;
    allowedFigureRefs?: string[];
  },
  blockIndex: number,
  nextRef: string,
): {
  blocks: Array<{kind: string; assetRef?: string; caption?: string}>;
  allowedFigureRefs: string[];
} {
  const blocks = p.blocks.map((b, i) =>
    i === blockIndex && b.kind === "figure" ? {...b, assetRef: nextRef} : b,
  );
  const allowed = [...(p.allowedFigureRefs || [])];
  const norm = normalizeKbAssetRef(nextRef);
  if (norm && !allowed.some((r) => normalizeKbAssetRef(r) === norm)) {
    allowed.push(nextRef);
  }
  return {blocks, allowedFigureRefs: allowed};
}

/** 移除 figure 块；保留 allowedFigureRefs */
export function removeManualFigure(
  p: {
    blocks: Array<{kind: string; assetRef?: string; caption?: string}>;
    allowedFigureRefs?: string[];
  },
  blockIndex: number,
): {
  blocks: Array<{kind: string; assetRef?: string; caption?: string}>;
  allowedFigureRefs: string[];
} {
  return {
    blocks: p.blocks.filter((_, i) => i !== blockIndex),
    allowedFigureRefs: [...(p.allowedFigureRefs || [])],
  };
}

/**
 * 三十三·6：与 DocBlockInjector 同源归一口径，预判导出是否 blocked。
 */
export function previewFigureStatus(
  p: {
    blocks?: Array<{kind: string; assetRef?: string}>;
    allowedFigureRefs?: string[];
  },
): Array<{index: number; ok: boolean; reason?: string}> {
  const allowed = new Set(
    (p.allowedFigureRefs || []).map(normalizeKbAssetRef).filter(Boolean),
  );
  return (p.blocks || []).flatMap((b, i) => {
    if (b.kind !== "figure") return [];
    if (allowed.size === 0) {
      return [{index: i, ok: false, reason: "本段无可用插图资产"}];
    }
    if (!allowed.has(normalizeKbAssetRef(b.assetRef || ""))) {
      return [{index: i, ok: false, reason: "ref 不在本段候选内"}];
    }
    return [{index: i, ok: true}];
  });
}

/**
 * 二十三·13：与 prepareChaptersBlocks / collectParagraphBlocks 同序的段级白名单。
 * - 有 allowedFigureRefs → 原样列表
 * - allowFigure===false → 空数组（禁全部）
 * - 否则 undefined（不做白名单校验，兼容旧态）
 */
export function collectParagraphAllowedFigureRefLists(
  chapters: Array<{
    paragraphs?: Array<{
      allowedFigureRefs?: string[];
      allowFigure?: boolean;
    }>;
  }>,
): Array<string[] | undefined> {
  const out: Array<string[] | undefined> = [];
  for (const ch of chapters || []) {
    for (const p of ch.paragraphs || []) {
      if (Array.isArray(p.allowedFigureRefs) && p.allowedFigureRefs.length) {
        out.push([...p.allowedFigureRefs]);
      } else if (p.allowFigure === false) {
        out.push([]);
      } else {
        out.push(undefined);
      }
    }
  }
  return out;
}

/**
 * 拼进段落写作 prompt 的附录。
 * 空清单 → 明令禁止 figure（九·2 硬约束）。
 */
export function buildFigureAssetAppendix(entries: DocFigureAsset[]): string {
  if (!entries.length) {
    return (
      "\n【可用插图资产】当前无可用资产，**不要写** ```figure 围栏；" +
      "本段只需散文（或符合判据时的 table）。\n"
    );
  }
  const lines = entries.map((e) => {
    const ref = formatKbAssetRef(e.fileName, e.assetId);
    const cap = e.caption ? ` | 建议图注：${e.caption}` : "";
    return `- ${ref}${cap}`;
  });
  return (
    "\n【可用插图资产】只能从下列字符串里**原样复制** ref；列表为空则不要写 figure；一段最多 1 张图：\n" +
    lines.join("\n") +
    "\n"
  );
}

/** 统计 payload 里不可 resolve 的 figure（7c′）；不含白名单拒绝 */
export function countUnresolvedFigures(
  payloads: Array<Array<{kind: string}> | null>,
): number {
  let n = 0;
  for (const items of payloads) {
    if (!items) continue;
    for (const it of items) {
      if (it.kind === "figure-missing") n += 1;
    }
  }
  return n;
}

/** 二十四·D：白名单拒绝（模型改写 ref） */
export function countBlockedFigures(
  payloads: Array<Array<{kind: string}> | null>,
): number {
  let n = 0;
  for (const items of payloads) {
    if (!items) continue;
    for (const it of items) {
      if (it.kind === "figure-blocked") n += 1;
    }
  }
  return n;
}
