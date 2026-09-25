/**
 * columns / metric_columns 大纲 tips 规范化（不依赖 ViewItem4Ppt）
 * 把「热点赛道为… / 机会赛道涉及 A、B」类伪分栏长句收成 col:/colSub:/短条目。
 */

export type ColumnNorm = {title: string; sub: string; items: string[]};

const TRACK_KEYS = ["热点", "机会", "新赛道", "节点", "卖点", "打法", "人群", "风格"];

function stripRole(raw: string): string {
  return String(raw || "")
    .replace(/^(?:metric|list|col|column|栏|colSub|栏副|副标)\s*[:：]\s*/i, "")
    .trim();
}

function trackKey(name: string): string | null {
  const s = String(name || "");
  for (const k of TRACK_KEYS) {
    if (s.includes(k)) return k;
  }
  return null;
}

function splitShortItems(payload: string): string[] {
  // 不用 / 切：品类常见「针织衫/毛衣」「设计师/潮牌」是一项
  return String(payload || "")
    .split(/[、,，|｜;；]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 18)
    .slice(0, 6);
}

function findOrCreateCol(cols: ColumnNorm[], name: string): ColumnNorm {
  const title = String(name || "")
    .trim()
    .replace(/^(?:内容|男装)/, "")
    .trim()
    .slice(0, 12);
  const raw = String(name || "").trim().slice(0, 12);
  const key = trackKey(raw) || trackKey(title);
  let col =
    cols.find((c) => c.title === raw || c.title === title) ||
    (key ? cols.find((c) => trackKey(c.title) === key) : undefined);
  if (!col) {
    col = {title: raw || title || "未命名栏", sub: "", items: []};
    cols.push(col);
  }
  return col;
}

function serializeCols(cols: ColumnNorm[], metricLines: string[] = []): string[] {
  const mapped = cols
    .filter((c) => (c.title || "").trim() || c.items.length)
    .slice(0, 5)
    .map((c) => ({
      title: (c.title || "未命名栏").trim().slice(0, 12),
      sub: (c.sub || "").trim().slice(0, 20),
      items: (c.items || [])
        .map((t) => t.trim().slice(0, 16))
        .filter(Boolean)
        .slice(0, 5),
    }));
  // 优先保留有短条目的栏；仅副标无条目的栏在已有 ≥2 栏时可丢弃
  let use = mapped.filter((c) => c.items.length > 0);
  if (use.length < 2) {
    use = mapped.filter((c) => c.items.length > 0 || c.sub);
  }
  use = use.slice(0, 5);
  if (use.length < 2 && !metricLines.length) return [];
  const out: string[] = [...metricLines];
  for (const c of use) {
    out.push(`col: ${c.title}`);
    if (c.sub) out.push(`colSub: ${c.sub}`);
    for (const it of c.items) out.push(it);
  }
  return out;
}

/** 已有合法 col: 结构则原样整理；否则从扁平长句推断分栏 */
export function normalizeColumnsTipsArray(tips: string[]): string[] {
  const raw = (tips || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!raw.length) return [];

  const metricLines = raw.filter((t) => /^metric\s*[:：]/i.test(t));
  const rest = raw.filter((t) => !/^metric\s*[:：]/i.test(t));

  // 已有 ≥2 个 col: → 只做轻度清洗，不改结构
  const explicitColCount = rest.filter((t) =>
    /^(?:col|column|栏)\s*[:：]/i.test(t),
  ).length;
  if (explicitColCount >= 2) {
    return [...metricLines, ...rest];
  }

  const cols: ColumnNorm[] = [];
  const leftovers: string[] = [];

  for (const tip of rest) {
    const text = stripRole(tip);
    if (!text) continue;
    // 脚注/来源不进栏
    if (/^数据来源/.test(text) || /^来源[:：]/.test(text)) continue;

    let m = text.match(/^(.{2,18}?)(?:还)?涉及(.+)$/);
    if (m) {
      const col = findOrCreateCol(cols, m[1]);
      for (const it of splitShortItems(m[2])) {
        if (!col.items.includes(it)) col.items.push(it);
      }
      continue;
    }

    m = text.match(/^(.{2,18}?)包括(.+)$/);
    if (m) {
      const col = findOrCreateCol(cols, m[1]);
      for (const it of splitShortItems(m[2])) {
        if (!col.items.includes(it)) col.items.push(it);
      }
      continue;
    }

    m = text.match(/^(.{2,12}?)(?:为|是)(.+)$/);
    if (m && !/[，,。；;]/.test(m[1])) {
      const col = findOrCreateCol(cols, m[1]);
      if (!col.sub) col.sub = m[2].trim().slice(0, 20);
      continue;
    }

    m = text.match(/^(.{2,12}?)基于(.+)$/);
    if (m && !/[，,。；;]/.test(m[1])) {
      const col = findOrCreateCol(cols, m[1]);
      if (!col.sub) col.sub = `基于${m[2].trim()}`.slice(0, 20);
      continue;
    }

    m = text.match(/^(.{2,12}?)按(.+)$/);
    if (m && !/[，,。；;]/.test(m[1])) {
      const col = findOrCreateCol(cols, m[1]);
      if (!col.sub) col.sub = `按${m[2].trim()}`.slice(0, 20);
      continue;
    }

    leftovers.push(text.slice(0, 28));
  }

  // 无栏可推断：放弃，保持原 tips（避免误伤普通 list）
  const serialized = serializeCols(cols, metricLines);
  if (serialized.length < 2 && metricLines.length === 0) {
    return raw;
  }
  if (cols.length < 2) {
    return raw;
  }

  // 残留短句均分补进各栏（仍缺条目时）
  if (leftovers.length) {
    let i = 0;
    for (const t of leftovers) {
      const col = cols[i % cols.length];
      if (col.items.length < 5) col.items.push(t.slice(0, 16));
      i++;
    }
  }

  const out = serializeCols(cols, metricLines);
  return out.length ? out : raw;
}

/** 多行 subtitle → 规范化后的多行文本 */
export function normalizeColumnsSubtitle(subTitle: string): string {
  const lines = String(subTitle || "")
    .split("\n")
    .map((l) => l.replace(/^(?:[-*+•＊]\s+)/, "").trim())
    .filter(Boolean)
    .filter((l) => !/^layout\s*[:：]/i.test(l));
  const norm = normalizeColumnsTipsArray(lines);
  return norm.join("\n");
}
