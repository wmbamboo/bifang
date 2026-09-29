/**
 * 任务 3 · 榜单排名闸（B3）——十·3 第 1 步：先改判定，不动 OCR。
 * 捕获「位居首位/第一/最大」类断言，与证据中共现百分数取 max 核对；冲突则改写。
 */

export type RankingPair = {label: string; pct: number};

export type RankingGateItem = {
  sentence: string;
  action: "pass" | "rewrite" | "drop";
  reason: string;
  result?: string;
};

export type RankingGateReport = {
  blocked_count: number;
  rewritten_count: number;
  items: RankingGateItem[];
};

/** 排名断言触发词（十·3 / 方案任务 3） */
export const RANK_CLAIM_RE =
  /位居首位|排名第一|是第一|居首位|居首|默认结构|最大/;

/**
 * 从文本抽「标签 + 百分数」对。
 * 覆盖：常规袖 79.76% / 常规袖以15.06% / 落肩袖占 15.06％
 */
export function extractLabelPctPairs(text: string): RankingPair[] {
  const s = String(text || "");
  const out: RankingPair[] = [];
  const seen = new Set<string>();
  const re =
    /([\u4e00-\u9fffA-Za-z]{1,16}?)\s*(?:以|占|为|达)?\s*(\d+(?:\.\d+)?)\s*[%％]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let label = (m[1] || "").trim();
    // 去掉尾部连接词残留
    label = label.replace(/^(以|占|为|的|了)+/, "").replace(/(以|占|为)$/, "");
    if (!label || label.length > 12) continue;
    // 过滤纯量词/无意义
    if (/^(约|近|超|达|共|均|为)$/.test(label)) continue;
    const pct = parseFloat(m[2]);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
    const key = `${label}|${pct}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({label, pct});
  }
  return out;
}

export function pickTopPair(pairs: RankingPair[]): RankingPair | null {
  if (!pairs.length) return null;
  return pairs.reduce((a, b) => (b.pct > a.pct ? b : a));
}

/** 句中被断言为「第一」的标签（断言词左侧最近标签） */
export function claimedRankLabel(sentence: string): string | null {
  const s = sentence || "";
  const claim = s.match(RANK_CLAIM_RE);
  if (!claim || claim.index == null) return null;
  const left = s.slice(0, claim.index);
  // 优先「X以N%位居首位」里的 X
  const withPct = left.match(
    /([\u4e00-\u9fffA-Za-z]{1,12}?)\s*(?:以|占|为)\s*\d+(?:\.\d+)?\s*[%％]\s*$/,
  );
  if (withPct) return withPct[1].trim();
  // 「X位居首位」
  const bare = left.match(/([\u4e00-\u9fffA-Za-z]{1,12})\s*$/);
  return bare ? bare[1].trim() : null;
}

function labelsMatch(a: string, b: string): boolean {
  const x = a.replace(/\s+/g, "");
  const y = b.replace(/\s+/g, "");
  if (!x || !y) return false;
  if (x === y) return true;
  // 常规 / 常规袖
  if (x.includes(y) || y.includes(x)) return true;
  return false;
}

function formatTopSentence(top: RankingPair, original: string): string {
  const pctStr = Number.isInteger(top.pct)
    ? String(top.pct)
    : String(top.pct);
  // 尽量保留句号
  const end = /[。！？]$/.test(original) ? original.slice(-1) : "。";
  return `${top.label}以${pctStr}%居首${end}`;
}

export function judgeRankingSentence(
  sentence: string,
  evidence: string,
): RankingGateItem {
  if (!RANK_CLAIM_RE.test(sentence)) {
    return {sentence, action: "pass", reason: "无排名断言"};
  }
  const claimed = claimedRankLabel(sentence);
  // 证据 + 本句共现百分数（本句也常带错误的小数）
  const pairs = [
    ...extractLabelPctPairs(evidence),
    ...extractLabelPctPairs(sentence),
  ];
  // 同标签保留较大 pct（证据优先：后面覆盖时用 max）
  const byLabel = new Map<string, RankingPair>();
  for (const p of pairs) {
    const prev = byLabel.get(p.label);
    if (!prev || p.pct > prev.pct) byLabel.set(p.label, p);
  }
  const uniq = [...byLabel.values()];
  const top = pickTopPair(uniq);
  if (!top) {
    return {sentence, action: "pass", reason: "证据无百分数对，跳过"};
  }
  if (claimed && labelsMatch(claimed, top.label)) {
    return {sentence, action: "pass", reason: "断言与证据第一名一致"};
  }
  // 冲突：改写为证据第一名
  const result = formatTopSentence(top, sentence);
  return {
    sentence,
    action: "rewrite",
    reason: claimed
      ? `断言「${claimed}」第一，证据最大为「${top.label} ${top.pct}%」`
      : `排名断言与证据第一名「${top.label} ${top.pct}%」不一致`,
    result,
  };
}

function splitSentences(text: string): string[] {
  const s = String(text || "").trim();
  if (!s) return [];
  return s
    .split(/(?<=[。！？；\n])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function applyRankingGate(
  text: string,
  evidence: string,
): {text: string; report: RankingGateReport} {
  const sentences = splitSentences(text);
  const items: RankingGateItem[] = [];
  const out: string[] = [];
  let blocked = 0;
  let rewritten = 0;
  for (const sent of sentences) {
    const j = judgeRankingSentence(sent, evidence);
    items.push(j);
    if (j.action === "pass") {
      out.push(sent);
    } else if (j.action === "rewrite" && j.result) {
      out.push(j.result);
      rewritten++;
      blocked++;
    } else {
      blocked++;
    }
  }
  return {
    text: out.join("").replace(/\n{3,}/g, "\n\n").trim(),
    report: {blocked_count: blocked, rewritten_count: rewritten, items},
  };
}
