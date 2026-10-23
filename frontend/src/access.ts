/**
 * @see https://umijs.org/docs/max/access#access
 */
export default function access(initialState: { currentUser?: API.CurrentUser } | undefined) {
  const { currentUser } = initialState ?? {};
  const roles: string[] =
    currentUser?.roles && currentUser.roles.length
      ? currentUser.roles
      : currentUser?.access
        ? [currentUser.access]
        : [];
  const has = (code: string) => roles.includes(code);
  return {
    canAdmin: has('admin'),
    /** 知识库管理：admin 或 kb_manager */
    canKbMgt: has('admin') || has('kb_manager'),
    /** 反馈开发管理：仅程序猿（coder），不含 admin 隐式授权 */
    canFeedbackDev: has('coder'),
  };
}
