/**
 * 十四·14.3.4 / 十七·2：文章段落字数预算（单一真源）。
 * setAllPrompt / format_prompt / KB 约束 共用。
 * 公式（实测 C 档）：budget = BASE + 60×要点数，clamp 后写成 min===max 单值。
 * 禁止用 paragraph.points.length —— maxLevel≤3 时 points 已被折进 pointGuide。
 */

export type WordBudget = { min: number; max: number };

export const DOC_WORD_BUDGET = {
  /** heading 段基数 */
  baseHeading: 150,
  /** body 段基数 */
  baseBody: 120,
  perPoint: 60,
  /** 全局 clamp 上界 */
  max: 600,
  /** 显式容器不写正文 */
  container: { min: 0, max: 0 } as WordBudget,
  /**
   * 兼容旧读法：默认「无要点」时的单值区间（min===max）。
   * 新逻辑请走 wordBudgetFor。
   */
  get heading(): WordBudget {
    return { min: this.baseHeading, max: this.baseHeading };
  },
  get body(): WordBudget {
    return { min: this.baseBody, max: this.baseBody };
  },
} as const;

const ABS_MIN = 40;
const ABS_MAX = 2000;

/** 钳制到合理区间，并保证 min ≤ max */
export function clampWordBudget(b: WordBudget): WordBudget {
  let min = Math.round(Number(b?.min) || 0);
  let max = Math.round(Number(b?.max) || 0);
  if (min < 0) min = 0;
  if (max < 0) max = 0;
  if (min > 0 && min < ABS_MIN) min = ABS_MIN;
  if (max > ABS_MAX) max = ABS_MAX;
  if (max > 0 && max < min) max = min;
  if (min > max) min = max;
  return { min, max };
}

/** 从 pointGuide / prompt 抠【本段要点】条数（与 paragraphPointLabels 同口径，避免循环依赖） */
export function countPointLabels(p: {
  points?: Array<{ label?: string }>;
  pointGuide?: string;
  prompt?: string;
}): number {
  const fromPts = (p.points || [])
    .map((x) => String(x?.label || "").trim())
    .filter(Boolean);
  if (fromPts.length) return fromPts.length;
  const raw = String(p.pointGuide || p.prompt || "");
  const m = raw.match(/【本段要点】([^。\n]+)/);
  if (!m) return 0;
  return m[1]
    .split(/[、,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

export type WordBudgetSource = {
  heading?: boolean;
  container?: boolean;
  /** 显式预算（简单层手改）；优先 */
  wordBudget?: WordBudget | null;
  points?: Array<{ label?: string }>;
  pointGuide?: string;
  prompt?: string;
};

function single(n: number): WordBudget {
  const v = Math.round(n);
  return { min: v, max: v };
}

/**
 * 段级显式预算优先；否则按要点数公式出单值（min===max）。
 * 十七·1：禁止结论章系数。
 */
export function wordBudgetFor(p: WordBudgetSource): WordBudget {
  if (p.wordBudget && (p.wordBudget.min > 0 || p.wordBudget.max > 0)) {
    return clampWordBudget(p.wordBudget);
  }
  if (p.container) return { ...DOC_WORD_BUDGET.container };
  const n = countPointLabels(p);
  const base = p.heading ? DOC_WORD_BUDGET.baseHeading : DOC_WORD_BUDGET.baseBody;
  const floor = p.heading ? DOC_WORD_BUDGET.baseHeading : DOC_WORD_BUDGET.baseBody;
  const raw = base + DOC_WORD_BUDGET.perPoint * n;
  const clamped = Math.min(DOC_WORD_BUDGET.max, Math.max(floor, raw));
  return single(clamped);
}

/** 展示用：单值 → "270"；区间 → "200～400" */
export function formatWordBudgetZh(b: WordBudget): string {
  const c = clampWordBudget(b);
  if (c.min <= 0 && c.max <= 0) return "0";
  if (c.min === c.max) return `${c.min}`;
  return `${c.min}～${c.max}`;
}
