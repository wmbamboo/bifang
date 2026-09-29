/**
 * 生产接线：图鉴扩格 + N>9 降 table
 */
import {
  coerceOverflowByTipCount,
  tipsToOverflowTableRows,
} from "@/components/DocUtil/outlineJson";
import {
  buildImageGridFillVars,
  countImageGridSlots,
} from "@/components/DocUtil/ViewItem4Ppt";

describe("countImageGridSlots / buildImageGridFillVars", () => {
  test("按图注条数到 6/8/9", () => {
    const six = Array.from({ length: 6 }, (_, i) => `- 图${i + 1}`).join("\n");
    expect(countImageGridSlots(six)).toBe(6);
    const { vars, count } = buildImageGridFillVars(six, {});
    expect(count).toBe(6);
    expect(vars.cap6).toMatch(/图6/);
    expect(vars.cap7).toBeUndefined();
  });

  test("超过 9 钳到 9", () => {
    const many = Array.from({ length: 12 }, (_, i) => `- t${i + 1}`).join("\n");
    expect(countImageGridSlots(many)).toBe(9);
  });

  test("忽略 img: 行", () => {
    const sub = ["- 图A", "- 图B", "img: foo.png#x"].join("\n");
    expect(countImageGridSlots(sub)).toBe(2);
  });
});

describe("coerceOverflowByTipCount", () => {
  test("≤9 不改", () => {
    const tips = Array.from({ length: 9 }, (_, i) => `要点${i + 1}`);
    expect(coerceOverflowByTipCount("list", tips)).toEqual({ layout: "list" });
  });

  test(">9 无竖线 → 改写 table", () => {
    const tips = Array.from({ length: 11 }, (_, i) => `阶段${i + 1}：动作${i + 1}`);
    const r = coerceOverflowByTipCount("progress", tips);
    expect(r.layout).toBe("table");
    expect(r.tips?.[0]).toBe("要点|说明");
    expect(r.tips!.length).toBeLessThanOrEqual(8);
    expect(r.warn).toMatch(/>9/);
  });

  test(">9 已有 | → 直接 table 切片", () => {
    const tips = Array.from(
      { length: 12 },
      (_, i) => `列A|列B${i}`,
    );
    const r = coerceOverflowByTipCount("list", tips);
    expect(r.layout).toBe("table");
    expect(r.tips!.length).toBe(8);
    expect(r.tips![0]).toContain("|");
  });

  test("tipsToOverflowTableRows 拆冒号", () => {
    expect(tipsToOverflowTableRows(["选品定锚：锁定品类", "裸句"])).toEqual([
      "要点|说明",
      "选品定锚|锁定品类",
      "裸句|—",
    ]);
  });
});
