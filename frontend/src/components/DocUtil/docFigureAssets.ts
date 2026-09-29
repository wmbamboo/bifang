/**
 * Word 段落插图资产附录（九·2）：纯函数，不 import 服务层。
 * assetRef 口径与 resolveAssetBytes 一致：kb:<fileName>/<assetId>
 */
export type DocFigureAsset = {
  fileName: string;
  assetId: string;
  caption?: string;
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

/** 从 listAssets 风格条目抽出 */
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
