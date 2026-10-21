import {
  Chapter,
  Paragraph,
  Doc,
  absorbBlocksFromParagraphContent,
  countChapterMedia,
  countParagraphMedia,
} from "@/components/DocUtil/ViewItem4Doc";

describe("文章生成 · 有表有图状态", () => {
  it("setContent 吸收 table/figure 围栏到 blocks", () => {
    const chapters = Doc.getChaptersFromContent(
      "# 标题\n\n## 章一\n\n* 段一说明\n",
    );
    const key = chapters[0].paragraphs[0].key;
    const body =
      "本段概述如下。\n" +
      "```table\n" +
      "caption: 销量对照\n" +
      "| 品类 | 销量 |\n" +
      "| --- | --- |\n" +
      "| 衬衫 | 100 |\n" +
      "```\n" +
      "```figure\n" +
      "ref: kb:demo.pdf/elements/a.png\n" +
      "caption: 爆款图\n" +
      "```\n";
    Doc.setContent(chapters, key, body);
    const p = chapters[0].paragraphs[0];
    expect(p.content).not.toMatch(/```/);
    expect(p.content).toContain("本段概述");
    expect(p.blocks.filter((b) => b.kind === "table")).toHaveLength(1);
    expect(p.blocks.filter((b) => b.kind === "figure")).toHaveLength(1);
    expect(countParagraphMedia(p)).toEqual({tables: 1, figures: 1});
    expect(countChapterMedia(chapters[0])).toEqual({tables: 1, figures: 1});
  });

  it("二次吸收不清空已有 blocks（正文已无围栏）", () => {
    const p = new Paragraph(1, "段");
    p.content =
      "正文\n```table\ncaption: t\n| a | b |\n| 1 | 2 |\n```\n";
    absorbBlocksFromParagraphContent(p);
    expect(p.blocks).toHaveLength(1);
    const before = p.blocks.length;
    absorbBlocksFromParagraphContent(p);
    expect(p.blocks).toHaveLength(before);
  });

  it("无 blocks 时从正文围栏兜底计数", () => {
    const p = new Paragraph(1, "段");
    p.content = "x\n```figure\nref: kb:a/b.png\ncaption: c\n```\n";
    p.blocks = [];
    expect(countParagraphMedia(p).figures).toBe(1);
  });

  it("截图口径：中文路径 figure 围栏可吸收且正文不再含围栏", () => {
    const p = new Paragraph(1, "衬衫集中度信号");
    p.content =
      "TOP7销售额占比约60%[文档2]。\n\n" +
      "```figure\n" +
      "ref: kb:抖音单品爆款分析-商务男士衬衫polo衫.pdf/抖音单品爆款分析-商务男士衬衫polo衫_p4_0.png\n" +
      "caption: 男士衬衫品类大盘与头部集中度概览 (p4)\n" +
      "```\n";
    absorbBlocksFromParagraphContent(p);
    expect(p.content).not.toMatch(/```/);
    expect(p.content).toMatch(/TOP7/);
    expect(p.blocks).toEqual([
      expect.objectContaining({
        kind: "figure",
        assetRef:
          "kb:抖音单品爆款分析-商务男士衬衫polo衫.pdf/抖音单品爆款分析-商务男士衬衫polo衫_p4_0.png",
      }),
    ]);
  });

  it("有 table blocks 时正文残留 figure 围栏仍计入 figures", () => {
    const p = new Paragraph(1, "段");
    p.blocks = [
      {kind: "table", caption: "t", rows: [["a", "b"], ["1", "2"]]},
    ];
    p.content = "文\n```figure\nref: kb:a.pdf/x.png\ncaption: c\n```\n";
    expect(countParagraphMedia(p)).toEqual({tables: 1, figures: 1});
  });
});
