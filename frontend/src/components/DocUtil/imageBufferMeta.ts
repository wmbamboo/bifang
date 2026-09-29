/**
 * 从图片二进制读宽高 + OOXML cover 裁剪 srcRect（千分比，100000=100%）。
 */

export type ImageSize = {w: number; h: number};

export type SrcRect = {l: number; t: number; r: number; b: number};

export function readImageSize(buf: ArrayBuffer): ImageSize | null {
  const u8 = new Uint8Array(buf);
  if (u8.length < 24) return null;
  // PNG
  if (
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47
  ) {
    const dv = new DataView(buf);
    const w = dv.getUint32(16, false);
    const h = dv.getUint32(20, false);
    return w > 0 && h > 0 ? {w, h} : null;
  }
  // JPEG
  if (u8[0] === 0xff && u8[1] === 0xd8) {
    let i = 2;
    while (i + 9 < u8.length) {
      if (u8[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = u8[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = (u8[i + 2] << 8) | u8[i + 3];
      // SOF0 / SOF2
      if (marker === 0xc0 || marker === 0xc2) {
        const h = (u8[i + 5] << 8) | u8[i + 6];
        const w = (u8[i + 7] << 8) | u8[i + 8];
        return w > 0 && h > 0 ? {w, h} : null;
      }
      i += 2 + len;
    }
  }
  return null;
}

/** cover：居中裁切使源图填满槽位宽高比 */
export function coverSrcRect(
  imgW: number,
  imgH: number,
  slotW: number,
  slotH: number,
): SrcRect {
  if (!(imgW > 0 && imgH > 0 && slotW > 0 && slotH > 0)) {
    return {l: 0, t: 0, r: 0, b: 0};
  }
  const imgAspect = imgW / imgH;
  const slotAspect = slotW / slotH;
  const UNIT = 100000;
  if (imgAspect > slotAspect) {
    // 图更宽：裁左右
    const visible = slotAspect / imgAspect;
    const crop = (1 - visible) / 2;
    const side = Math.round(crop * UNIT);
    return {l: side, t: 0, r: side, b: 0};
  }
  if (imgAspect < slotAspect) {
    // 图更高：裁上下
    const visible = imgAspect / slotAspect;
    const crop = (1 - visible) / 2;
    const side = Math.round(crop * UNIT);
    return {l: 0, t: side, r: 0, b: side};
  }
  return {l: 0, t: 0, r: 0, b: 0};
}

/** 槽/源宽高比偏差（相对较大者），>0.15 且无裁切则应报警 */
export function aspectDeviation(
  imgW: number,
  imgH: number,
  slotW: number,
  slotH: number,
): number {
  if (!(imgW > 0 && imgH > 0 && slotW > 0 && slotH > 0)) return 0;
  const a = imgW / imgH;
  const b = slotW / slotH;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return hi > 0 ? (hi - lo) / hi : 0;
}
