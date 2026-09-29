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

/** 统计 payload 里不可 resolve 的 figure（7c′） */
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
