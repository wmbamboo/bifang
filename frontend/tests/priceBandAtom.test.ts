import {
  extractPriceBandAtoms,
  findPriceBands,
  hasPriceBand,
  isPriceBandAtom,
  maskPriceBandAtoms,
  numberInsidePriceBand,
  numberIsPriceBandEdge,
  parsePriceBand,
  splitTitleDescProtectingPriceBands,
  unmaskPriceBandAtoms,
  normalizePriceBandSurface,
} from "@/components/DocUtil/priceBandAtom";

describe("parsePriceBand 类型化对象", () => {
  it("range / below / above", () => {
    expect(parsePriceBand("¥100-200")).toEqual(
      expect.objectContaining({
        kind: "price_band",
        min: 100,
        max: 200,
        bound: "range",
      }),
    );
    expect(parsePriceBand("50元以下")).toEqual(
      expect.objectContaining({min: null, max: 50, bound: "below"}),
    );
    expect(parsePriceBand("¥200元以上")).toEqual(
      expect.objectContaining({min: 200, max: null, bound: "above"}),
    );
    expect(parsePriceBand("100~200元")).toEqual(
      expect.objectContaining({min: 100, max: 200, bound: "range"}),
    );
    expect(parsePriceBand("100")).toBeNull();
    expect(parsePriceBand("200")).toBeNull();
  });

  it("全角货币/数字归一后仍解析", () => {
    expect(normalizePriceBandSurface("￥１００－２００")).toBe("¥100-200");
    expect(parsePriceBand("￥100-200")?.min).toBe(100);
    expect(parsePriceBand("￥50以下")?.bound).toBe("below");
  });

  it("findPriceBands 扫出多个对象", () => {
    const bands = findPriceBands(
      "男士衬衫|¥50-100|129.4万；对照 50元以下 与 ¥200-300",
    );
    expect(bands.map((b) => ({min: b.min, max: b.max, bound: b.bound}))).toEqual(
      expect.arrayContaining([
        {min: 50, max: 100, bound: "range"},
        {min: null, max: 50, bound: "below"},
        {min: 200, max: 300, bound: "range"},
      ]),
    );
  });

  it("边界数字落在价带跨度内 / 是 min|max", () => {
    const tip = "polo衫|¥50-100|172.6万";
    const idx = tip.indexOf("50");
    expect(numberInsidePriceBand(tip, idx, 2)).toBe(true);
    expect(numberIsPriceBandEdge("100", tip.replace(/\s+/g, ""))).toBe(true);
    expect(numberIsPriceBandEdge("172", tip)).toBe(false);
  });
});

describe("priceBandAtom 兼容 API", () => {
  it("recognizes 以下 / 区间 as atomic objects", () => {
    expect(isPriceBandAtom("50元以下")).toBe(true);
    expect(isPriceBandAtom("¥50以下")).toBe(true);
    expect(isPriceBandAtom("￥50-100")).toBe(true);
    expect(isPriceBandAtom("¥100-200")).toBe(true);
    expect(isPriceBandAtom("¥200元以上")).toBe(true);
    expect(isPriceBandAtom("100")).toBe(false);
    expect(hasPriceBand("面料棉 45%")).toBe(false);
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

    const {masked, bands} = maskPriceBandAtoms("polo ¥100-200 销量");
    expect(masked).not.toContain("-");
    expect(unmaskPriceBandAtoms(masked, bands)).toBe("polo ¥100-200 销量");
  });
});
