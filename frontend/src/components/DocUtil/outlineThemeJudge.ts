/**
 * 同主题判断：默认用画像轴词做确定性强检查；可选 LLM hook（需调用方注入）。
 * 词面规则只做「页题点名的轴 vs tip 是否同轴」；模糊语义留给 judgeFn。
 */

import {
  getActiveCorpusProfile,
  isAttrAxisPageTitle,
  isPriceBandPageTitle,
} from "@/components/DocUtil/corpusProfile";
import {hasPriceBand} from "@/components/DocUtil/priceBandAtom";

export type ThemeJudgeResult = {
  ok: boolean;
  reason: string;
  /** rule | llm */
  via: "rule" | "llm";
};

export type ThemeJudgeFn = (
  title: string,
  tips: string[],
) => Promise<ThemeJudgeResult> | ThemeJudgeResult;

let injectedJudge: ThemeJudgeFn | null = null;

/** 测试/线上可注入便宜模型：返回 ok=false 时填充闸拒收 */
export function setThemeAlignJudge(fn: ThemeJudgeFn | null): void {
  injectedJudge = fn;
}

/**
 * 规则版：属性页 tip 不得主写价带；价带页 tip 不得主写属性轴标签。
 * 跨域靠画像，不靠衬衫硬编码。
 */
export function judgeThemeAlignRule(
  title: string,
  tips: string[],
): ThemeJudgeResult {
  const t = String(title || "");
  const blob = (tips || []).map((x) => String(x || "")).join("\n");
  if (!t.trim() || !blob.trim()) {
    return {ok: true, reason: "", via: "rule"};
  }
  const profile = getActiveCorpusProfile();
  const attrLabels = profile.attrAxes.flatMap((a) => a.labels);
  const hasAttrLabel = attrLabels.some((lab) => lab && blob.includes(lab));

  if (isAttrAxisPageTitle(t) && hasPriceBand(blob) && !hasAttrLabel) {
    return {
      ok: false,
      reason: "页题为属性轴，但要点主要是价格带；请改用属性标签占比",
      via: "rule",
    };
  }
  if (isPriceBandPageTitle(t) && hasAttrLabel && !hasPriceBand(blob)) {
    // 价带页偶尔写材质对比可放行；仅当几乎全是属性标签、无价带时拒
    const bandish = /价格带|价位|客单|[￥¥]/.test(blob);
    if (!bandish) {
      return {
        ok: false,
        reason: "页题为价格带，但要点全是属性标签；请写价带区间销量",
        via: "rule",
      };
    }
  }
  return {ok: true, reason: "", via: "rule"};
}

/** 先规则；规则过再跑可选 LLM（贵且慢，默认不注入） */
export async function judgeThemeAlign(
  title: string,
  tips: string[],
): Promise<ThemeJudgeResult> {
  const rule = judgeThemeAlignRule(title, tips);
  if (!rule.ok) return rule;
  if (!injectedJudge) return rule;
  try {
    const r = await injectedJudge(title, tips);
    return {...r, via: "llm"};
  } catch {
    return rule;
  }
}
