/**
 * 毕方 API 基址。
 * - 配置了 bf_baseUrl → 原样用（可直连 7861）
 * - 未配置 / 空串 → 用当前页 origin（localhost:8000 或向日葵域名），
 *   走 umi proxy；OpenAI SDK 必须要绝对 URL，相对路径会 Invalid URL → Connection error
 */
export function getBfBaseUrl(): string {
  const configured = String(process.env.bf_baseUrl ?? "")
    .trim()
    .replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}
