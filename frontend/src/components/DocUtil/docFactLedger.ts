/**
 * 十九·5 / 4B：结论章材料账本。
 * 从前文已生成正文抽出指标与短摘要，注入结论段写作（不在 prompt 黑名单层硬扛「（推演）」）。
 */
import {isConclusionChapter} from "@/components/DocUtil/conclusionGate";
import {extractMetricTokens} from "@/components/DocUtil/outlineEvidenceValidate";

export type FactLedgerEntry = {
  chapterTitle: string;
  paragraphTitle: string;
  metrics: string[];
  snippet: string;
};

type ChapterLike = {
  title?: string;
  paragraphs?: Array<{title?: string; content?: string; heading?: boolean}>;
};

/** 去掉围栏残留，压成一行摘要 */
function plainSnippet(raw: string, max = 100): string {
  return String(raw || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * 收集非结论章正文事实（指标 + 短摘）。
 * 空段 / 「本段生成失败」占位跳过。
 */
export function buildFactLedger(chapters: ChapterLike[]): FactLedgerEntry[] {
  const out: FactLedgerEntry[] = [];
  for (let i = 0; i < chapters.length; i++) {
    if (isConclusionChapter(chapters, i)) continue;
    const ch = chapters[i];
    for (const p of ch.paragraphs || []) {
      const content = String(p.content || "").trim();
      if (!content || /本段生成失败|本段知识库未提供依据/.test(content)) {
        continue;
      }
      const snippet = plainSnippet(content);
      if (snippet.length < 12) continue;
      const metrics = extractMetricTokens(content).slice(0, 10);
      out.push({
        chapterTitle: String(ch.title || "").trim() || "章",
        paragraphTitle: String(p.title || "").trim() || "段",
        metrics,
        snippet,
      });
    }
  }
  return out;
}

/**
 * 拼进结论段 user prompt 的附录。空账本 → 空串（不硬塞套话）。
 */
export function formatFactLedgerAppendix(
  entries: FactLedgerEntry[],
  maxChars = 1800,
): string {
  if (!entries.length) return "";
  const lines = entries.map((e) => {
    const m = e.metrics.length ? `【数】${e.metrics.join("、")}；` : "";
    return `- ${e.chapterTitle}/${e.paragraphTitle}：${m}${e.snippet}`;
  });
  let body = lines.join("\n");
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars)}…`;
  }
  return (
    "\n【前文事实账本】以下数字与要点来自已生成正文；结论段只能引用其中已出现的数字，" +
    "禁止引入账本外新数值；建议/预判句末标「（推演）」。\n" +
    body +
    "\n"
  );
}
