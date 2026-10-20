/**
 * 十九·3 / 二十一·18：围栏退化形态容错归一。
 * 按**位置**拆行（④a→④d），再做词形兼容；词形 figureref 正则已作废作主路径。
 */

export type FenceKind = "table" | "figure" | "unknown";

export type FenceOpenMatch = {
  kind: FenceKind;
  /** 开栏同一行残余（如 `kb:...` 或 `标题| 列1 |`） */
  rest: string;
};

/**
 * 归一化顺序（二十一·18）：④a→④c → 旧词形兼容 → ④d 必须最后。
 */
export function preprocessDegradedFences(raw: string): string {
  let s = String(raw || "");

  // ④a 开栏符前置换行：正文后紧贴 ```figure / ```table
  s = s.replace(/([^\n`])```[ \t]*(?=(?:figure|table)\b)/gi, "$1\n```");

  // ④b 图片路径与 caption 切分：…pngcaption: → …png\ncaption:
  s = s.replace(
    /(\.(?:png|jpe?g|gif|webp))[ \t]*(caption|图)[ \t]*[:：]/gi,
    "$1\ncaption: ",
  );

  // ④c 表格 caption 与首个管道列切分
  s = s.replace(/(caption[ \t]*[:：][^\n|]*?)[ \t]*\|/gi, "$1\n|");

  // 旧词形兼容（合成 fixture / 偶发）
  s = s.replace(/```\s*```/g, "```\n```");
  s = s.replace(/```\s*figureref\s*[:：]\s*/gi, "```figure\nref: ");
  s = s.replace(/```\s*figurecaption\s*[:：]\s*/gi, "```figure\ncaption: ");
  s = s.replace(/```\s*tablecaption\s*[:：]\s*/gi, "```table\ncaption: ");
  s = s.replace(/```\s*figure\s+(?=ref\s*[:：])/gi, "```figure\n");
  s = s.replace(/```\s*table\s+(?=caption\s*[:：])/gi, "```table\n");

  // ④d 闭合符前置换行（必须最后）
  s = s.replace(/([^\n`])```[ \t]*$/gm, "$1\n```");

  return s;
}

/**
 * 开栏行：``` 后第一个词前缀匹配 table / figure。
 */
export function matchFenceOpen(line: string): FenceOpenMatch | null {
  const t = String(line || "").trim();
  const m = t.match(/^```\s*([A-Za-z]*)\s*(.*)$/);
  if (!m) return null;
  const tag = (m[1] || "").toLowerCase();
  const rest = (m[2] || "").trim();
  if (!tag && !rest) return null;
  if (tag.startsWith("table")) return {kind: "table", rest};
  if (tag.startsWith("figure") || tag === "figureref") {
    return {kind: "figure", rest};
  }
  if (!tag && rest) {
    if (/^(?:ref|kb:)/i.test(rest)) return {kind: "figure", rest};
    return {kind: "unknown", rest};
  }
  if (!tag) return null;
  return {kind: "unknown", rest};
}

/** 开栏同行残余写入 buffer */
export function seedFenceBuffer(
  kind: FenceKind,
  rest: string,
  buf: string[],
): void {
  const r = String(rest || "").trim();
  if (!r || kind === "unknown") return;
  if (kind === "figure") {
    if (/^(?:ref|assetRef|asset|caption|图)\s*[:：]/i.test(r)) {
      buf.push(r);
    } else if (/^kb:|^https?:/i.test(r)) {
      buf.push(`ref: ${r}`);
    } else {
      buf.push(`ref: ${r}`);
    }
    return;
  }
  if (/^caption\s*[:：]/i.test(r)) {
    buf.push(r);
    return;
  }
  if (r.includes("|")) {
    const i = r.indexOf("|");
    const cap = r.slice(0, i).trim().replace(/^caption\s*[:：]\s*/i, "");
    const rows = r.slice(i).trim();
    if (cap) buf.push(`caption: ${cap}`);
    if (rows) buf.push(rows);
    return;
  }
  buf.push(`caption: ${r}`);
}

export function contentMayHaveDocFences(raw: string): boolean {
  return /```\s*(?:table|figure)/i.test(String(raw || ""));
}
