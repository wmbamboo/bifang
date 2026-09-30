/**
 * 任务 1 / B1：cleanDocTitle 不得吞数字字母；
 * 十三·A：含数字的 ### 段题应降级为正文引导（不占 h2）。
 */
import {
  cleanDocTitle,
  Doc,
  isDataLikeDocParagraphTitle,
  lastDocTitleDemotions,
} from "@/components/DocUtil/ViewItem4Doc";
import {stripDocOutlineOrdinal} from "@/components/DocUtil/docOutlineStructure";

describe("docTitleFidelity B1", () => {
  test("cleanDocTitle 保留 polo / 200 / 3C", () => {
    expect(cleanDocTitle("polo衫销量与销售额口径")).toBe(
      "polo衫销量与销售额口径",
    );
    expect(cleanDocTitle("衬衫200元价格带表现")).toBe("衬衫200元价格带表现");
    expect(cleanDocTitle("3C配件大盘")).toBe("3C配件大盘");
    expect(cleanDocTitle("TOP6 热销款")).toBe("TOP6 热销款");
  });

  test("只剥锚定前缀序数，不误伤正文数字", () => {
    expect(cleanDocTitle("一、了解市场需求")).toBe("了解市场需求");
    expect(cleanDocTitle("1.1 趋势分析")).toBe("趋势分析");
    expect(cleanDocTitle("第一章 市场概览")).toBe("市场概览");
    expect(cleanDocTitle("第三象限机会")).toBe("第三象限机会");
    expect(stripDocOutlineOrdinal("衬衫200元价格带表现")).toBe(
      "衬衫200元价格带表现",
    );
  });

  test("旧清洁单会吃掉的样本：数字侧不再误伤", () => {
    expect(cleanDocTitle("衬衫200元价格带表现")).not.toBe(
      "衬衫元价格带表现",
    );
  });
});

describe("十三·A/B 段题数据句降级为 #### 子点", () => {
  test("体检命中数字/过长/引注", () => {
    expect(isDataLikeDocParagraphTitle("价格带结构")).toBe(false);
    expect(isDataLikeDocParagraphTitle("衬衫200元价格带表现")).toBe(true);
    expect(isDataLikeDocParagraphTitle("结论见[文档1]")).toBe(true);
    expect(isDataLikeDocParagraphTitle("a".repeat(21))).toBe(true);
  });

  test("含数字 ### 不占 h2，降为 points；显式 #### 亦挂子点", () => {
    const md = [
      "## 大盘机会",
      "### 规模概览",
      "### 增速对照",
      "## 价格带结构",
      "### 价格带对照",
      "### 客群分层",
      "### 衬衫200元价格带表现",
      "### 结论见[文档1]补述",
      "#### 衬衫主力带 200 元",
      "## 结论与建议",
      "### 优先方向",
      "### 近两周动作",
    ].join("\n");
    const chapters = Doc.getChaptersFromContent(md);
    const priceCh = chapters.find((c) => c.title.includes("价格带"));
    expect(priceCh!.paragraphs.map((p) => p.title)).toEqual([
      "价格带对照",
      "客群分层",
    ]);
    const pts = priceCh!.paragraphs[1].points.map((p) => p.label);
    expect(pts).toEqual(
      expect.arrayContaining([
        "衬衫200元价格带表现",
        "结论见[文档1]补述",
        "衬衫主力带 200 元",
      ]),
    );
    expect(lastDocTitleDemotions.length).toBeGreaterThanOrEqual(2);
    const t = Doc.checkChapter(chapters);
    expect(t.code).toBeGreaterThanOrEqual(0);
    expect(t.msg).toMatch(/数据句|降级/);
  });

  test("降级后章内仅剩 1 个 ### 时 Warn 不拒单", () => {
    const md = [
      "## 大盘机会",
      "### 规模概览",
      "### 增速对照",
      "## 价格带结构",
      "### 价格带对照",
      "### 衬衫200元价格带表现",
      "### 结论见[文档1]补述",
      "## 结论与建议",
      "### 优先方向",
      "### 近两周动作",
    ].join("\n");
    const chapters = Doc.getChaptersFromContent(md);
    const priceCh = chapters.find((c) => c.title.includes("价格带"));
    expect(priceCh!.paragraphs.filter((p) => p.heading)).toHaveLength(1);
    expect(priceCh!.paragraphs[0].points.length).toBeGreaterThanOrEqual(2);
    const t = Doc.checkChapter(chapters);
    expect(t.code).toBeGreaterThanOrEqual(0);
    expect(t.msg).toMatch(/降级|偏少/);
  });
});
