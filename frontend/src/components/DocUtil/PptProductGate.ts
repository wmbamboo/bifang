/**
 * 成品闸：灌模完成后、下载前扫描生成稿 XML/纯文本。
 * 拦 B 类（槽残留、progress、孤立数字）；跨卡同文 → warning（不阻断下载）。
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
/** 模板伪槽：progress1 / progress1-3 / progress2-5 */
export const PROGRESS_MARKER_RE = /\bprogress\d*(?:-\d+)?\b/gi;
const PROGRESS_RE = /\bprogress\d*(?:-\d+)?\b/i;
/** 检索引注：完整 [文档1] / 残缺 [文档1 / 粘连 [文档1][文档7 */
export const DOC_CITE_MARKER_RE = /\[文档\s*\d+\]?/g;
const DOC_CITE_RE = /\[文档\s*\d+\]?/;
/** 像截断指标的裸数字；不含模板装饰序号 01/02、年份、日期 */
const ORPHAN_METRIC_RE = /^(?:[+\-]?\d{2,4}|[+\-]?\d{1,3}\s*[:：]?)$/;

const XML_NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** PPTX a:t 常含 &#x7537; 数字字符引用；长度门槛必须按解码后文本算 */
export function decodeXmlEntities(s: string): string {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&#(\d+);/g, (_, d: string) => {
      const cp = Number(d);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&([a-z]+);/gi, (m, n: string) => XML_NAMED[n.toLowerCase()] ?? m);
}

/** 清掉 progress* 伪槽（须整段吃掉 progress1-3，禁止留下「-3」） */
export function stripProgressMarkers(text: string): string {
  return String(text || "")
    .replace(PROGRESS_MARKER_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 清掉检索引注 [文档N]（含未闭合 [文档1） */
export function stripDocCiteMarkers(text: string): string {
  return String(text || "")
    .replace(DOC_CITE_MARKER_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 成品闸：是否「孤立数字碎片」（须拦的截断 tip，不是模板装饰/日期） */
export function isOrphanNumberFragment(line: string): boolean {
  const s = String(line || "").trim();
  if (!s) return false;
  if (/[%％亿万元]/.test(s)) return false;
  // 模板目录/章节装饰序号：01～09、1～9、10～18（全文页上限约 18）
  if (/^0\d{1,2}$/.test(s)) return false;
  if (/^[1-9]$/.test(s)) return false;
  if (/^1[0-8]$/.test(s)) return false;
  // 年份 / 日期片段（采样窗灌进副标时）
  if (/^20\d{2}$/.test(s)) return false;
  if (/^20\d{2}[.\-/]\d{1,2}([.\-/]\d{1,2})?$/.test(s)) return false;
  if (/^\d{1,2}[.\-/]\d{1,2}$/.test(s)) return false;
  return ORPHAN_METRIC_RE.test(s);
}

/**
 * 句尾孤儿数字：整行不是孤立碎片，但汉字后粘了坏字符「0」
 * 例：618超会买0
 */
export function hasTrailingOrphanDigit(line: string): boolean {
  const s = String(line || "").trim();
  if (!s || s.length < 3) return false;
  // 已是合法指标结尾则放过
  if (/[%％亿万元]$/.test(s)) return false;
  if (/\d+\.\d+$/.test(s)) return false;
  return /[\u4e00-\u9fff]0$/.test(s);
}

/** 从 slide XML 抽出可读文本（合并 a:t；须先解码实体） */
export function extractTextFromSlideXml(xml: string): string {
  const parts: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml || ''))) {
    const t = decodeXmlEntities(m[1] || '').trim();
    if (t) parts.push(t);
  }
  return parts.join('\n');
}

/**
 * 跨卡同文：成品闸只告警不硬拦（表品类列/模板双槽合法重复常见）。
 * 硬拒收交给填充阶段 findDuplicateTips。
 * - 长句精确重复：解码后 ≥8 字（短品类列如「男士Polo」不报）
 * - 同款不同价：去掉价签后核心 ≥4 字且与原文不同 → 报
 */
export function findCrossCardDuplicateLine(lines: string[]): string | null {
  const normKeys = new Map<string, number>();
  const coreKeys = new Map<string, number>();
  for (const line of lines) {
    const s = String(line || '').trim();
    if (!s) continue;
    if (/^0?\d{1,2}$/.test(s)) continue;
    const key = s.replace(/\s+/g, '').toLowerCase();
    if (key.length >= 8) {
      const n = (normKeys.get(key) || 0) + 1;
      normKeys.set(key, n);
      if (n >= 2) return s;
    }
    // 去掉价签/销量数后的款名核心（须真的剥掉过数字，避免表头短标签误报）
    const core = s
      .replace(/[￥¥]\s*\d+(?:\.\d+)?/g, '')
      .replace(/\d+(?:\.\d+)?\s*[%％万亿]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (
      core.length >= 4 &&
      /[\u4e00-\u9fff]/.test(core) &&
      !/^\d+$/.test(core) &&
      core !== key
    ) {
      const cn = (coreKeys.get(core) || 0) + 1;
      coreKeys.set(core, cn);
      if (cn >= 2) return s;
    }
  }
  return null;
}

/** 成品闸：半句截断（与填充 isTruncatedTip 同口径，就地实现避免循环依赖） */
export function isTruncatedSlideLine(line: string): boolean {
  const s = String(line || '').trim();
  if (!s || s.length < 3) return false;
  if (/20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}\s*$/.test(s)) return false;
  if (/20\d{2}[.\-/]\d{1,2}[.\-/]?\s*$/.test(s)) return true;
  if (/至\s*20\d{2}[.\-/]\d{1,2}[.\-/]?\s*$/.test(s)) return true;
  if (/[.\-/~～—–]\s*$/.test(s)) return true;
  if (s.length >= 5 && /[的与和及为至于按]$/.test(s)) return true;
  if (/各价格$|均为各价格$/.test(s)) return true;
  if (/同比[+\-＋－]\s*$|环比[+\-＋－]\s*$|增速[+\-＋－]\s*$/.test(s)) return true;
  return false;
}

/** 成品闸：图表轴/刻度碎片 */
export function isChartAxisFragmentLine(line: string): boolean {
  const s = String(line || '').trim();
  if (!s) return false;
  const compact = s.replace(/\s+/g, '');
  if (
    /^(?:[￥¥]?\d{2,4}[\/\|、]){1,}[￥¥]?\d{2,4}$/.test(compact)
  ) {
    return true;
  }
  if (/^[￥¥]\s*\d{2,4}$/.test(s)) return true;
  if (
    /^(?:TOP款?口径|销量席位|横轴|纵轴|图例|坐标轴)$/i.test(s)
  ) {
    return true;
  }
  const parts = s.split(/\s*[\/\|、]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const crumb = parts.filter(
      (p) =>
        /^[￥¥]?\s*\d{2,4}$/.test(p) ||
        /^(?:TOP款?口径|销量席位|横轴|纵轴|图例)$/i.test(p),
    );
    if (crumb.length >= 3 && crumb.length >= parts.length - 1) return true;
  }
  return false;
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
  if (DOC_CITE_RE.test(text) || DOC_CITE_RE.test(raw)) {
    issues.push({
      page,
      slideName,
      level: 'error',
      reason: '残留检索引注「[文档N]」',
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
    if (hasTrailingOrphanDigit(line)) {
      issues.push({
        page,
        slideName,
        level: 'error',
        reason: `句尾孤儿数字「${line.slice(-12)}」`,
      });
      break;
    }
    if (isTruncatedSlideLine(line)) {
      issues.push({
        page,
        slideName,
        level: 'error',
        reason: `半句截断「${line.slice(-24)}」`,
      });
      break;
    }
    if (isChartAxisFragmentLine(line)) {
      issues.push({
        page,
        slideName,
        level: 'error',
        reason: `图表轴/刻度碎片「${line.slice(0, 20)}」`,
      });
      break;
    }
  }
  const dupLine = findCrossCardDuplicateLine(lines);
  if (dupLine) {
    issues.push({
      page,
      slideName,
      level: 'warn',
      reason: `跨卡重复文案「${dupLine.slice(0, 20)}」（已放行下载，请人工复核）`,
    });
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
