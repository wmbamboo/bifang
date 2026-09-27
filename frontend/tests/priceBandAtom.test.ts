import {
  extractPriceBandAtoms,
  isPriceBandAtom,
  maskPriceBandAtoms,
  splitTitleDescProtectingPriceBands,
  unmaskPriceBandAtoms,
} from "@/components/DocUtil/priceBandAtom";

describe("priceBandAtom", () => {
  it("recognizes 以下 / 区间 as atomic objects", () => {
    expect(isPriceBandAtom("50元以下")).toBe(true);
    expect(isPriceBandAtom("¥50以下")).toBe(true);
    expect(isPriceBandAtom("￥50-100")).toBe(true);
    expect(isPriceBandAtom("¥100-200")).toBe(true);
    expect(isPriceBandAtom("¥200元以上")).toBe(true);
    expect(isPriceBandAtom("100")).toBe(false);
    expect(isPriceBandAtom("200")).toBe(false);
  });

  it("extracts multiple bands from a tip line", () => {
    const bands = extractPriceBandAtoms(
      "男士衬衫|¥50-100|129.4万；对照 50元以下 与 ¥200-300",
    );
    expect(bands).toEqual(
      expect.arrayContaining(["¥50-100", "50元以下", "¥200-300"]),
    );
  });

  it("protects band hyphen when splitting title - desc", () => {
    const hit = splitTitleDescProtectingPriceBands(
      "¥50-100 销量占比 - 机会价带可核对",
      /\s*-\s*/,
    );
    expect(hit).toEqual({
      title: "¥50-100 销量占比",
      desc: "机会价带可核对",
    });

    const { masked, bands } = maskPriceBandAtoms("polo ¥100-200 销量");
    expect(masked).not.toContain("-");
    expect(unmaskPriceBandAtoms(masked, bands)).toBe("polo ¥100-200 销量");
  });
});
