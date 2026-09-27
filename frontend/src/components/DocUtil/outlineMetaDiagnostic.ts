/**
 * 检索诊断/元话语词表：大纲 tip、填充校验、提示词、重试反馈共用，禁止复制粘贴漂移。
 */

/** 硬拒收：模型把检索困难写进 tip（非业务建议） */
export const META_DIAGNOSTIC_PHRASES = [
  "材料未覆盖",
  "知识库无",
  "口径未标注",
  "无法定位",
  "仅见一项",
  "未提供依据",
  "检索不足",
] as const;

/**
 * 软拒收（动作页可能合法出现，默认仍拦；若误杀再移出）：
 * 「材料不足」「证据不足」在「证据不足时先小单测款」类建议里会撞车。
 */
export const META_DIAGNOSTIC_SOFT_PHRASES = ["材料不足", "证据不足"] as const;

export const META_DIAGNOSTIC_TIP_RE = new RegExp(
  [...META_DIAGNOSTIC_PHRASES, ...META_DIAGNOSTIC_SOFT_PHRASES].join("|"),
);

/**
 * 示范动作语：提示词里的教学示例被原样抄进 tip（无数字）。
 * 例：回查属性特征页面料占比图 / 对照爆款图鉴
 */
export const DEMO_ACTION_TIP_RE =
  /^(?:list\s*[:：]\s*)?(?:回查|对照|补采)[^0-9%％亿万]*?(?:属性特征页|属性页|爆款图鉴|占比图|原图)[^0-9%％亿万]*$/;

/** 提示词禁令短句（拼进 columns 契约 / 重试反馈） */
export function metaDiagnosticBanClause(): string {
  const examples = META_DIAGNOSTIC_PHRASES.slice(0, 5).join("/");
  return (
    `禁止把检索诊断写进 tip（如「${examples}」）；` +
    `材料不足时：并入有证据的页、或改写含材料事实/原数字的短 tip；` +
    `禁止原样照抄教学示例动作语（如「回查属性特征页」「对照爆款图鉴」）`
  );
}

/** 重试时追加的短提示 */
export function metaDiagnosticRetryHint(): string {
  return (
    `【禁元话语】禁止 tip 写「${META_DIAGNOSTIC_PHRASES.slice(0, 4).join("/")}」；` +
    `材料薄时并页或写含事实/数字的 tip，禁止照抄「回查属性页/对照爆款图鉴」等示范动作语。`
  );
}

function tipBody(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^(?:col|column|栏|colSub|栏副|副标|metric|list|layout)\s*[:：]\s*/i, "")
    .trim();
}

/** tip 数组中是否含检索诊断元话语；返回命中片段 */
export function findMetaDiagnosticTips(tips: string[]): string | null {
  for (const raw of tips || []) {
    const t = String(raw || "").trim();
    if (!t) continue;
    if (/^(?:col|column|栏|colSub|栏副|副标|metric|list|layout)\s*[:：]/i.test(t)) {
      // 仍检查 body：list: 材料未覆盖
      const body = tipBody(t);
      if (body && META_DIAGNOSTIC_TIP_RE.test(body)) {
        return body.length > 24 ? `${body.slice(0, 24)}…` : body;
      }
      continue;
    }
    if (META_DIAGNOSTIC_TIP_RE.test(t)) {
      return t.length > 24 ? `${t.slice(0, 24)}…` : t;
    }
  }
  return null;
}

/** 示范动作语被照抄进 tip（无原数字） */
export function findDemoActionTips(tips: string[]): string | null {
  for (const raw of tips || []) {
    const body = tipBody(raw);
    if (!body) continue;
    if (/^(?:col|column|栏)\s*[:：]/i.test(String(raw || "").trim())) continue;
    if (DEMO_ACTION_TIP_RE.test(body)) {
      return body.length > 28 ? `${body.slice(0, 28)}…` : body;
    }
  }
  return null;
}

/** 文本是否含元话语（生成内容校验用） */
export function textHasMetaDiagnostic(blob: string): boolean {
  return META_DIAGNOSTIC_TIP_RE.test(String(blob || ""));
}
