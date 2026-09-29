/**
 * 任务 8 · 结论层闸（十·8 / B8）：落前端（与实体闸同层）。
 * - 结论章数值 ⊆ 前文正文已出现的指标集合
 * - 推演/建议句强制尾标「（推演）」
 */
import {
  extractMetricTokens,
  normalizeMetricToken,
} from "@/components/DocUtil/outlineEvidenceValidate";

/** 与 ViewItem4Doc.DOC_CONCLUSION_CHAPTER_RE 同口径（避免循环依赖） */
const CONCLUSION_CHAPTER_RE =
  /结论|建议|动作|取舍|下一步|筛选与打法/;

export type ConclusionGateReport = {
  blocked_count: number;
  tagged_count: number;
  dropped_sentences: number;
};

type ChapterLike = {
  title?: string;
  paragraphs?: Array<{content?: string; title?: string; setContent?: (c: string) => void}>;
};

const SPECULATIVE_RE =
  /建议|应当|应该|宜(?!人)|可考虑|预计|有望|值得|优先跟进|推荐|不妨/;

function splitSentences(text: string): string[] {
  const src = String(text || "").trim();
  if (!src) return [];
  return src
    .split(/(?<=[。！？；\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isConclusionChapter(
  chapters: ChapterLike[],
  chapterIndex: number,
): boolean {
  const ch = chapters[chapterIndex];
  if (!ch) return false;
  return (
    chapterIndex === chapters.length - 1 ||
    CONCLUSION_CHAPTER_RE.test(ch.title || "")
  );
}

/** 收集非结论章正文中的指标 token */
export function collectBodyMetrics(chapters: ChapterLike[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < chapters.length; i++) {
    if (isConclusionChapter(chapters, i)) continue;
    for (const p of chapters[i].paragraphs || []) {
      for (const tok of extractMetricTokens(p.content || "")) {
        out.add(normalizeMetricToken(tok));
      }
    }
  }
  return out;
}

export function applyConclusionGate(
  text: string,
  allowedMetrics: Set<string>,
): {text: string; report: ConclusionGateReport} {
  const report: ConclusionGateReport = {
    blocked_count: 0,
    tagged_count: 0,
    dropped_sentences: 0,
  };
  const sentences = splitSentences(text);
  if (!sentences.length) return {text: text || "", report};

  const kept: string[] = [];
  const allowEmpty = allowedMetrics.size === 0;

  for (let sent of sentences) {
    const toks = extractMetricTokens(sent).map(normalizeMetricToken);
    const bad = allowEmpty
      ? []
      : toks.filter((t) => t && !allowedMetrics.has(t));
    if (bad.length) {
      report.blocked_count += 1;
      report.dropped_sentences += 1;
      continue;
    }
    if (SPECULATIVE_RE.test(sent) && !/（推演）|\(推演\)/.test(sent)) {
      const core = sent.replace(/[。！？；\n]*$/u, "");
      sent = `${core}（推演）。`;
      report.tagged_count += 1;
    }
    kept.push(sent);
  }

  return {text: kept.join(""), report};
}

/** 对整篇大纲：scrub 所有结论章段落 */
export function scrubConclusionChapters<T extends ChapterLike>(
  chapters: T[],
): {chapters: T[]; report: ConclusionGateReport} {
  const allowed = collectBodyMetrics(chapters);
  const report: ConclusionGateReport = {
    blocked_count: 0,
    tagged_count: 0,
    dropped_sentences: 0,
  };
  for (let i = 0; i < chapters.length; i++) {
    if (!isConclusionChapter(chapters, i)) continue;
    for (const p of chapters[i].paragraphs || []) {
      const {text, report: r} = applyConclusionGate(p.content || "", allowed);
      if (typeof p.setContent === "function") {
        p.setContent(text);
      } else {
        p.content = text;
      }
      report.blocked_count += r.blocked_count;
      report.tagged_count += r.tagged_count;
      report.dropped_sentences += r.dropped_sentences;
    }
  }
  return {chapters, report};
}
