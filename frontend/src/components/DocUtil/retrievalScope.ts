/**
 * 检索范围：跟着「证据承诺」（是否绑定了源文档）走，不猜用户意图。
 *
 * - bound_only：仅用所选文档
 * - kb_supplement：扩展知识库补充（跨文档数字须带来源标注）
 */

export type RetrievalScope = "bound_only" | "kb_supplement";

export function defaultRetrievalScope(
  boundSourceFiles: string[] | null | undefined,
): RetrievalScope {
  return boundSourceFiles && boundSourceFiles.length > 0
    ? "bound_only"
    : "kb_supplement";
}

export function retrievalScopeLabel(scope: RetrievalScope): string {
  return scope === "bound_only" ? "仅用所选文档" : "扩展知识库补充";
}
