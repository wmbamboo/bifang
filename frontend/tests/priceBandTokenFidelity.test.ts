import {
  extractMetricTokens,
  uniqueMetricTokens,
  validateTipsAgainstEvidence,
} from "@/components/DocUtil/outlineEvidenceValidate";

describe("price band digits not standalone metrics", () => {
  it("does not extract 50/100 from ¥50-100 in table tip", () => {
    const tip = "polo衫|¥50-100|172.6万|+17.09%|1.31亿";
    const tokens = uniqueMetricTokens(extractMetricTokens(tip));
    expect(tokens.some((t) => t === "50" || t === "100")).toBe(false);
    expect(tokens.some((t) => /172\.6/.test(t))).toBe(true);
    expect(tokens.some((t) => /1\.31/.test(t))).toBe(true);
  });

  it("table price-band tip passes when evidence lacks bare 100", () => {
    const tip = "polo衫|¥50-100|172.6万|+17.09%|1.31亿";
    // 证据只有销量/同比/销售额，故意不含裸数字 100（复现线上误拦）
    const ev =
      "⟦chunk:band⟧ 男士polo衫中价段销量172.6万 占比42.76% 同比+17.09%。本期销售额1.31亿。";
    const err = validateTipsAgainstEvidence("爆款价格与销量对照", [tip], ev, {
      intent: "price-band",
    });
    expect(err).toBeNull();
  });
});
