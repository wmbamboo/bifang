/**
 * metric_list 大纲 tips 规范化（不依赖 ViewItem4Ppt，供 outlineJson / 提示词共用）
 */

const METRIC_NUM_RE = /[+\-＋－]?\d[\d.,]*\s*[%％亿万]/gu;

function stripRole(raw: string): string {
  return String(raw || "")
    .replace(/^(?:metric|list)\s*[:：]\s*/i, "")
    .trim();
}

/** 把「586亿…同比增长42.3%…」拆成多条「数字 短口径」 */
export function expandMetricTipTexts(rawTips: string[]): string[] {
  const out: string[] = [];
  for (const tip of rawTips || []) {
    const text = stripRole(tip);
    if (!text) continue;
    const matches = [...text.matchAll(METRIC_NUM_RE)];
    if (matches.length === 0) continue;
    if (matches.length === 1) {
      const num = matches[0][0].trim();
      let desc = text
        .replace(matches[0][0], " ")
        .replace(/[，,。；;、]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 16);
      if (text.length > 28) {
        if (/%|％/.test(num) && /同比|增速|增长/.test(text)) desc = "同比增速";
        else if (/亿|万/.test(num) && /销售|大盘|规模/.test(text)) desc = "大盘销售额";
      }
      if (/%|％/.test(num) && /同比|增速/.test(text)) desc = "同比增速";
      if (!desc) desc = "关键口径";
      out.push(`${num} ${desc}`.trim());
      continue;
    }
    for (const m of matches) {
      const num = m[0].trim();
      const around = text.slice(
        Math.max(0, (m.index || 0) - 8),
        (m.index || 0) + num.length + 12,
      );
      let desc = "关键口径";
      if (/%|％/.test(num) && /同比|增速|增长/.test(around + text)) desc = "同比增速";
      else if (/亿|万/.test(num) && /销售|大盘|规模/.test(around + text)) desc = "大盘销售额";
      else if (/%|％/.test(num)) desc = "同比增速";
      else if (/亿|万/.test(num)) desc = "大盘销售额";
      out.push(`${num} ${desc}`);
    }
  }
  return out;
}

function splitRawTips(subTitle: string): {metrics: string[]; lists: string[]} {
  const lines = String(subTitle || "")
    .split("\n")
    .map((l) => l.replace(/^(?:[-*+•＊]\s+)/, "").trim())
    .filter(Boolean)
    .filter((l) => !/^layout\s*[:：]/i.test(l));
  const metrics: string[] = [];
  const lists: string[] = [];
  for (const line of lines) {
    if (/^metric\s*[:：]/i.test(line)) {
      metrics.push(stripRole(line));
      continue;
    }
    if (/^list\s*[:：]/i.test(line)) {
      lists.push(stripRole(line));
      continue;
    }
    if (METRIC_NUM_RE.test(line)) metrics.push(line);
    else lists.push(line);
  }
  return {metrics, lists};
}

/** 规范化为带 metric:/list: 前缀的多行 tips 文本 */
export function normalizeMetricListSubtitle(subTitle: string): string {
  const {metrics, lists} = splitRawTips(subTitle);
  let metricNorm = expandMetricTipTexts(metrics);
  if (metricNorm.length < 2) {
    const all = [...metrics, ...lists];
    const fromAll = expandMetricTipTexts(all);
    if (fromAll.length > metricNorm.length) metricNorm = fromAll;
  }
  metricNorm = metricNorm.slice(0, 5);
  const listNorm = lists
    .map((t) => stripRole(t).slice(0, 28))
    .filter(Boolean)
    .filter((t) => !metricNorm.some((m) => t.includes((m.split(/\s+/)[0] || ""))))
    .slice(0, 3);
  if (!metricNorm.length && !listNorm.length) return String(subTitle || "");
  return [
    ...metricNorm.map((t) => `metric: ${t}`),
    ...listNorm.map((t) => `list: ${t}`),
  ].join("\n");
}

/** tips 字符串数组 → 规范化后的字符串数组（填充落盘用） */
export function normalizeMetricListTipsArray(tips: string[]): string[] {
  const joined = (tips || [])
    .map((t) => {
      const s = String(t || "").trim();
      if (/^(?:metric|list)\s*[:：]/i.test(s)) return s;
      if (METRIC_NUM_RE.test(s)) return `metric: ${s}`;
      return `list: ${s}`;
    })
    .join("\n");
  const norm = normalizeMetricListSubtitle(joined);
  return norm
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
