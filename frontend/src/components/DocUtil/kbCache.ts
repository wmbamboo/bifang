/** 跨页记住最近一次选中的知识库（含「全库」） */
export const LAST_KB_STORAGE_KEY = "bf_last_kb_name";

/** 与 kbSelectorModal.ALL_KB_NAME 一致 */
export const ALL_KB_NAME = "__all__";

export function getCachedKbName(fallback: string = ALL_KB_NAME): string {
  try {
    const v = (localStorage.getItem(LAST_KB_STORAGE_KEY) || "").trim();
    if (v) return v;
  } catch {
    /* private mode / SSR */
  }
  return fallback;
}

export function setCachedKbName(name: string): void {
  const n = (name || "").trim();
  if (!n) return;
  try {
    localStorage.setItem(LAST_KB_STORAGE_KEY, n);
  } catch {
    /* ignore quota */
  }
}
