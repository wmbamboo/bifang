/**
 * 任务 1 / B1 验收（十·1）：标题经 getChaptersFromContent 往返后保留数字与字母。
 */
import {cleanDocTitle, Doc} from "@/components/DocUtil/ViewItem4Doc";
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

  test("getChaptersFromContent 往返逐字符一致", () => {
    const md = [
      "# 抖音选品",
      "## 价格带结构",
      "### 衬衫200元价格带表现",
      "### polo衫销量与销售额口径",
      "### 3C配件大盘",
    ].join("\n");
    const chapters = Doc.getChaptersFromContent(
      Doc.getContentFromMsg(md),
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0].paragraphs.map((p) => p.title)).toEqual([
      "衬衫200元价格带表现",
      "polo衫销量与销售额口径",
      "3C配件大盘",
    ]);
  });

  test("旧清洁单会吃掉的样本：数字侧不再误伤", () => {
    // 回归：charsToReplace 含 0-9 时「200」被删
    expect(cleanDocTitle("衬衫200元价格带表现")).not.toBe(
      "衬衫元价格带表现",
    );
  });
});
