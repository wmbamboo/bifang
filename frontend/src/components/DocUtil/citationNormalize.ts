/**
 * 任务 5 · 引用格式统一（十·5：禁盲映射）。
 * 唯一目标格式：`[文档N]`。混用时删除裸 `[N]`，不猜测映射。
 */

export type CitationNormalizeReport = {
  mapped: number;
  removed: number;
  had_doc_cites: boolean;
  had_bare_cites: boolean;
};

const DOC_CITE_RE = /\[文档(\d+)\]/g;
/** 裸 [N]：前面不是「文档」 */
const BARE_CITE_RE = /(?<!文档)\[(\d+)\]/g;

export function countBareCitations(text: string): number {
  const m = (text || "").match(BARE_CITE_RE);
  return m ? m.length : 0;
}

export function normalizeCitations(
  text: string,
  opts?: {docCount?: number},
): {text: string; report: CitationNormalizeReport} {
  const src = text || "";
  const report: CitationNormalizeReport = {
    mapped: 0,
    removed: 0,
    had_doc_cites: DOC_CITE_RE.test(src),
    had_bare_cites: BARE_CITE_RE.test(src),
  };
  // 全局 regex lastIndex 复位
  DOC_CITE_RE.lastIndex = 0;
  BARE_CITE_RE.lastIndex = 0;

  if (!report.had_bare_cites) {
    return {text: src, report};
  }

  if (report.had_doc_cites) {
    const out = src
      .replace(BARE_CITE_RE, () => {
        report.removed += 1;
        return "";
      })
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +([，。；！？、])/g, "$1");
    return {text: out, report};
  }

  const docCount = opts?.docCount;
  const out = src.replace(BARE_CITE_RE, (_m, nStr: string) => {
    const n = parseInt(nStr, 10);
    if (!Number.isFinite(n) || n < 1) {
      report.removed += 1;
      return "";
    }
    if (docCount != null && n > docCount) {
      report.removed += 1;
      return "";
    }
    report.mapped += 1;
    return `[文档${n}]`;
  });
  return {text: out, report};
}
