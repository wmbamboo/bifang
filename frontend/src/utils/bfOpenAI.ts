import OpenAI, { type ClientOptions } from 'openai';

/**
 * OpenAI SDK 的鉴权只走 apiKey → Authorization: Bearer，
 * 不经过 requestErrorConfig 的 umi-request 拦截器。
 * 这里用自定义 fetch 在每次请求时注入当前 session token，
 * 避免模块顶层构造时把旧 token 固化下来。
 */
export const bfAuthFetch: typeof fetch = (input, init) => {
  const token =
    (typeof localStorage !== 'undefined' && localStorage.getItem('token')) ||
    '';
  const headers = new Headers((init?.headers as HeadersInit) || {});
  if (token) {
    headers.set('token', token); // 后端 extract_token 第一优先
    headers.set('Authorization', `Bearer ${token}`); // 兼容只认 Bearer 的场景
  }
  return fetch(input, { ...init, headers });
};

export function bfOpenAI(baseURL: string, opts: Partial<ClientOptions> = {}) {
  return new OpenAI({
    apiKey: 'bf-session-token', // 占位，真实凭据由 bfAuthFetch 注入
    baseURL,
    dangerouslyAllowBrowser: true,
    fetch: bfAuthFetch,
    ...opts,
  });
}
