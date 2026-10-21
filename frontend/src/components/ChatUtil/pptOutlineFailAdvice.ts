/**
 * PPT 大纲流水线失败建议：按真实错误分流，勿在已选具体库时仍催「不要用全部」。
 */
import {ALL_KB_NAME} from "@/components/DocUtil/kbCache";

export function pptOutlineFailAdvice(
  err: string,
  kbName?: string,
): string {
  const e = String(err || "");
  if (
    /connection|network|timeout|ECONN|fetch failed|Failed to fetch|网络|超时|连不上/i.test(
      e,
    )
  ) {
    return "请检查网络或稍后重试。";
  }
  if (!kbName || kbName === ALL_KB_NAME || kbName === "all") {
    return "请换具体知识库（不要用「全部」）后重试，或简化主题。";
  }
  return "请简化主题后重试，或稍后再试。";
}
