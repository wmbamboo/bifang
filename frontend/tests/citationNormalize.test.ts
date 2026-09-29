/**
 * 任务 5 验收：引用格式统一（十·5 禁盲映射）
 */
import {
  countBareCitations,
  normalizeCitations,
} from "@/components/DocUtil/citationNormalize";

describe("citationNormalize B5", () => {
  test("仅裸引用 → 映射为 [文档N]", () => {
    const {text, report} = normalizeCitations(
      "棉占比 72.18%[1]，纯色 70.07%[2][3]。",
      {docCount: 5},
    );
    expect(text).toBe("棉占比 72.18%[文档1]，纯色 70.07%[文档2][文档3]。");
    expect(report.mapped).toBe(3);
    expect(report.removed).toBe(0);
    expect(countBareCitations(text)).toBe(0);
  });

  test("越界裸引用删除", () => {
    const {text, report} = normalizeCitations("引用[1]与越界[9]。", {
      docCount: 3,
    });
    expect(text).toBe("引用[文档1]与越界。");
    expect(report.mapped).toBe(1);
    expect(report.removed).toBe(1);
  });

  test("混用 → 删裸保留 [文档N]，不做盲映射", () => {
    const {text, report} = normalizeCitations(
      "A 面料棉 72%[文档1]，另述纯色 70%[2]；又见[文档6]与[1]。",
      {docCount: 8},
    );
    expect(text).toContain("[文档1]");
    expect(text).toContain("[文档6]");
    expect(countBareCitations(text)).toBe(0);
    expect(report.mapped).toBe(0);
    expect(report.removed).toBeGreaterThanOrEqual(2);
  });

  test("已是 [文档N] 不变", () => {
    const src = "结论见[文档1][文档2]。";
    const {text, report} = normalizeCitations(src, {docCount: 2});
    expect(text).toBe(src);
    expect(report.had_bare_cites).toBe(false);
  });
});
