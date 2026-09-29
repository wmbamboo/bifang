import {
  parseDocOutlineMarkdown,
  stripDocOutlineOrdinal,
} from "@/components/DocUtil/docOutlineStructure";

/**
 * 大纲查询抽屉右侧「大纲内容」的结构化视图（2026-09-29）。
 * 关键约束：**视图必须显示大纲原文**（不得经过 cleanString），否则标题里的
 * 数字与字母（polo / 200）会像内容生成页那样被吃掉（B1）。
 */

const POLO_OUTLINE = [
  "# 抖音商务男装衬衫polo衫选品分析",
  "",
  "## 大盘与品类机会",
  "### 男装大盘销量与销售额走势",
  "### 衬衫与polo衫的品类位次",
  "### 采样口径与时间区间",
  "",
  "## 价格带结构对照",
  "### 衬衫主力价格带分布",
  "### polo衫机会价格带增长",
  "",
  "## 属性特征选品要点",
  "### 面料材质销量占比",
  "### 图案花纹销量占比",
  "",
  "## 热销款式与店铺参考",
  "### 衬衫热销款式销量分布",
  "### polo衫热销款式店铺分布",
].join("\n");

describe("parseDocOutlineMarkdown", () => {
  it("解析出章/段结构与编号", () => {
    const doc = parseDocOutlineMarkdown(POLO_OUTLINE, "兜底名");
    expect(doc.title).toBe("抖音商务男装衬衫polo衫选品分析");
    expect(doc.chapters.map((c) => c.title)).toEqual([
      "大盘与品类机会",
      "价格带结构对照",
      "属性特征选品要点",
      "热销款式与店铺参考",
    ]);
    expect(doc.chapters.map((c) => c.no)).toEqual([1, 2, 3, 4]);
    expect(doc.chapters[0].paras.map((p) => p.no)).toEqual(["1.1", "1.2", "1.3"]);
    expect(doc.paraTotal).toBe(9);
    expect(doc.loose).toEqual([]);
  });

  it("原样保留标题里的数字与字母（不得像 cleanString 那样吞掉 polo / 200）", () => {
    const doc = parseDocOutlineMarkdown(
      "# 报告\n## 价格带\n### 衬衫200元价格带表现\n### polo衫销量与销售额口径",
    );
    expect(doc.chapters[0].paras.map((p) => p.title)).toEqual([
      "衬衫200元价格带表现",
      "polo衫销量与销售额口径",
    ]);
  });

  it("没有一级标题时用兜底标题（记录名）", () => {
    const doc = parseDocOutlineMarkdown("## 一、了解市场需求\n### 趋势分析", "我的大纲");
    expect(doc.title).toBe("我的大纲");
  });

  it("兼容写法 `* 1.1 …` 按段处理并标 heading=false；`### ` 段下的 * 才是要点", () => {
    const doc = parseDocOutlineMarkdown(
      ["# T", "## 一、了解市场需求", "* 1.1 趋势分析", "* 1.2 用户偏好"].join("\n"),
    );
    const chap = doc.chapters[0];
    expect(chap.paras.map((p) => [p.title, p.heading])).toEqual([
      ["1.1 趋势分析", false],
      ["1.2 用户偏好", false],
    ]);
    expect(chap.paras[0].bullets).toEqual([]);

    const withH3 = parseDocOutlineMarkdown(
      ["# T", "## 章", "### 段", "* 要点甲", "* 要点乙"].join("\n"),
    );
    expect(withH3.chapters[0].paras).toHaveLength(1);
    expect(withH3.chapters[0].paras[0].heading).toBe(true);
    expect(withH3.chapters[0].paras[0].bullets).toEqual(["要点甲", "要点乙"]);
  });

  it("table / figure 围栏归属到所在段，且不生成多余段落", () => {
    const doc = parseDocOutlineMarkdown(
      [
        "# T",
        "## 章",
        "### 段A",
        "```table",
        "caption: 各品类销量",
        "| 品类 | 销量 |",
        "| polo衫 | 403.7万 |",
        "```",
        "```figure",
        "ref: kb:doc/p12_i1.png",
        "caption: 编织肌理",
        "```",
        "### 段B",
      ].join("\n"),
    );
    const paras = doc.chapters[0].paras;
    expect(paras).toHaveLength(2);
    expect(paras[0].title).toBe("段A");
    expect(paras[0].hasTable).toBe(true);
    expect(paras[0].hasFigure).toBe(true);
    expect(paras[1].hasTable).toBe(false);
  });

  it("丢弃 PPT 风格元数据行（八·2 同口径）", () => {
    const doc = parseDocOutlineMarkdown(
      ["# T", "## 章", "* layout: metric", "### 段", "* tips: 一句话"].join("\n"),
    );
    const paras = doc.chapters[0].paras;
    expect(paras.map((p) => p.title)).toEqual(["段"]);
    // `* tips: …` 也被 RE_META 拦掉，不会变成段下的要点
    expect(paras[0].bullets).toEqual([]);
  });

  it("章节前的散行进 loose，不丢内容", () => {
    const doc = parseDocOutlineMarkdown(["# T", "补充说明一段", "## 章", "### 段"].join("\n"));
    expect(doc.loose).toEqual(["补充说明一段"]);
    expect(doc.chapters).toHaveLength(1);
  });

  it("空内容与无章节分别返回空结构", () => {
    expect(parseDocOutlineMarkdown("").chapters).toEqual([]);
    expect(parseDocOutlineMarkdown("只有一句话").chapters).toEqual([]);
    expect(parseDocOutlineMarkdown("只有一句话").loose).toEqual(["只有一句话"]);
  });
});

describe("stripDocOutlineOrdinal", () => {
  it("去掉手写序号，避免与视图「第 N 章 / 1.1」重复", () => {
    expect(stripDocOutlineOrdinal("一、了解市场需求")).toBe("了解市场需求");
    expect(stripDocOutlineOrdinal("第三章 价格带")).toBe("价格带");
    expect(stripDocOutlineOrdinal("1.1 趋势分析")).toBe("趋势分析");
    expect(stripDocOutlineOrdinal("（二）供应商")).toBe("供应商");
    expect(stripDocOutlineOrdinal("① 选品结论")).toBe("选品结论");
    expect(stripDocOutlineOrdinal("衬衫200元价格带表现")).toBe("衬衫200元价格带表现");
    expect(stripDocOutlineOrdinal("polo衫销量")).toBe("polo衫销量");
  });

  it("不误伤以年份/数量开头的标题（防 B1 同类错误）", () => {
    expect(stripDocOutlineOrdinal("2024年男装流行趋势")).toBe("2024年男装流行趋势");
    expect(stripDocOutlineOrdinal("100-200元价格带")).toBe("100-200元价格带");
    expect(stripDocOutlineOrdinal("3C配件大盘")).toBe("3C配件大盘");
    expect(stripDocOutlineOrdinal("TOP6款式销量")).toBe("TOP6款式销量");
  });
});
