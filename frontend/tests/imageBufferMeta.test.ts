import {
  aspectDeviation,
  coverSrcRect,
  readImageSize,
} from "@/components/DocUtil/imageBufferMeta";

function makePng(w: number, h: number): ArrayBuffer {
  // minimal IHDR-bearing PNG header (not a valid full PNG, enough for reader)
  const buf = new ArrayBuffer(33);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length + type
  dv.setUint32(8, 13, false);
  u8.set([0x49, 0x48, 0x44, 0x52], 12);
  dv.setUint32(16, w, false);
  dv.setUint32(20, h, false);
  return buf;
}

describe("imageBufferMeta", () => {
  it("reads PNG IHDR size", () => {
    expect(readImageSize(makePng(692, 1584))).toEqual({w: 692, h: 1584});
  });

  it("cover crops tall image for wide slot (2.8:1)", () => {
    const slotW = 5120640;
    const slotH = 1828800;
    const rect = coverSrcRect(692, 1584, slotW, slotH);
    // 竖图：上下裁切，左右 0
    expect(rect.l).toBe(0);
    expect(rect.r).toBe(0);
    expect(rect.t).toBeGreaterThan(10000);
    expect(rect.b).toBe(rect.t);
    expect(aspectDeviation(692, 1584, slotW, slotH)).toBeGreaterThan(0.15);
  });

  it("no crop when aspects match", () => {
    expect(coverSrcRect(280, 100, 2800, 1000)).toEqual({
      l: 0,
      t: 0,
      r: 0,
      b: 0,
    });
  });
});
