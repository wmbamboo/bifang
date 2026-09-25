/**
 * 成品闸：灌模完成后、下载前扫描生成稿 XML/纯文本。
 * 拦 B 类（槽残留、progress、孤立数字、同文双卡）。
 */

export type ProductGateIssue = {
  page: number;
  slideName: string;
  level: 'error' | 'warn';
  reason: string;
};

export type ProductGateReport = {
  ok: boolean;
  errors: ProductGateIssue[];
  warnings: ProductGateIssue[];
};

const SLOT_RE = /\{[A-Za-z_][\w.]*(?:\[[\w.]+\])?\}/g;
const PROGRESS_RE = /\bprogress\d*\b/i;
/** 像截断指标的裸数字；不含模板装饰序号 01/02、年份、日期 */
const ORPHAN_METRIC_RE = /^(?:[+\-]?\d{2,4}|[+\-]?\d{1,3}\s*[:：]?)$/;

/** 成品闸：是否「孤立数字碎片」（须拦的截断 tip，不是模板装饰/日期） */
export function isOrphanNumberFragment(line: string): boolean {
  const s = String(line || "").trim();
  if (!s) return false;
  if (/[%％亿万元]/.test(s)) return false;
  // 模板目录/章节装饰：01、02、03…
  if (/^0\d{1,2}$/.test(s)) return false;
  // 年份 / 日期片段（采样窗灌进副标时）
  if (/^20\d{2}$/.test(s)) return false;
  if (/^20\d{2}[.\-/]\d{1,2}([.\-/]\d{1,2})?$/.test(s)) return false;
  if (/^\d{1,2}[.\-/]\d{1,2}$/.test(s)) return false;
  return ORPHAN_METRIC_RE.test(s);
}

/** 从 slide XML 抽出可读文本（合并 a:t） */
export function extractTextFromSlideXml(xml: string): string {
  const parts: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml || ''))) {
    const t = (m[1] || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (t.trim()) parts.push(t);
  }
  return parts.join('\n');
}

function scanOnePage(
  page: number,
  slideName: string,
  xml: string,
): ProductGateIssue[] {
  const issues: ProductGateIssue[] = [];
  const raw = String(xml || '');
  const text = extractTextFromSlideXml(raw);
  const slotHits = raw.match(SLOT_RE) || text.match(SLOT_RE) || [];
  if (slotHits.length) {
    const uniq = [...new Set(slotHits)].slice(0, 4).join('、');
    issues.push({
      page,
      slideName,
      level: 'error',
      reason: `未替换占位符残留：${uniq}`,
    });
  }
  if (PROGRESS_RE.test(text) || PROGRESS_RE.test(raw)) {
    issues.push({
      page,
      slideName,
      level: 'error',
      reason: '残留内部标记 progress*',
    });
  }
  const lines = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (isOrphanNumberFragment(line)) {
      issues.push({
        page,
        slideName,
        level: 'error',
        reason: `孤立数字碎片「${line}」`,
      });
      break;
    }
  }
  // 同文双卡：相邻非空行完全相同（去空白）
  const norm = lines.map((s) => s.replace(/\s+/g, '').toLowerCase()).filter((s) => s.length >= 6);
  for (let i = 1; i < norm.length; i++) {
    if (norm[i] === norm[i - 1]) {
      issues.push({
        page,
        slideName,
        level: 'warn',
        reason: '疑似同文重复填两卡',
      });
      break;
    }
  }
  return issues;
}

export type FilledSlideLike = { slideName: string; fileContent: string };

/** 扫描整份灌模结果 */
export function scanFilledSlides(slides: FilledSlideLike[]): ProductGateReport {
  const errors: ProductGateIssue[] = [];
  const warnings: ProductGateIssue[] = [];
  (slides || []).forEach((s, idx) => {
    const page = idx + 1;
    for (const issue of scanOnePage(page, s.slideName || `slide${page}`, s.fileContent || '')) {
      if (issue.level === 'error') errors.push(issue);
      else warnings.push(issue);
    }
  });
  return { ok: errors.length === 0, errors, warnings };
}

export function formatProductGateMessage(report: ProductGateReport): string {
  const top = report.errors.slice(0, 3);
  const detail = top.map((e) => `P${e.page}:${e.reason}`).join('；');
  const more =
    report.errors.length > 3 ? `等共 ${report.errors.length} 处` : '';
  return `成品闸未通过：${detail}${more}。请检查大纲填充或模板槽位后重试。`;
}
