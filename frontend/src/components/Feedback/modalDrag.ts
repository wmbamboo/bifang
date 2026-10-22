const POS_KEY = 'bf_fb_modal_pos';

/** 整个弹窗必须留在视口内；h≥vh 时只能贴顶 */
export function clampModalPos(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
): { x: number; y: number } {
  const maxX = Math.max(0, vw - w);
  const maxY = Math.max(0, vh - h);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

/** sessionStorage 读位置；脏数据一律 null，不抛错 */
export function readModalPos(): { x: number; y: number } | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y)
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function writeModalPos(pos: { x: number; y: number }) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore quota */
  }
}
