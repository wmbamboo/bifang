import {
  Chapter,
  Paragraph,
  Doc,
  absorbBlocksFromParagraphContent,
  countChapterMedia,
  countParagraphMedia,
  countResidualFenceMedia,
  simpleDocParagraphPrompt,
} from "@/components/DocUtil/ViewItem4Doc";
import {contentMayHaveDocBlockFences} from "@/components/DocUtil/docFenceNormalize";

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

  it("无 blocks 时 countParagraphMedia=0，残留围栏另计", () => {
    const p = new Paragraph(1, "段");
    p.content = "x\n```figure\nref: kb:a/b.png\ncaption: c\n```\n";
    p.blocks = [];
    expect(countParagraphMedia(p).figures).toBe(0);
    expect(countResidualFenceMedia(p.content).figures).toBe(1);
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

  it("三十九·4：有 table blocks 时正文残留 figure 不计入含图 Tag", () => {
    const p = new Paragraph(1, "段");
    p.blocks = [
      {kind: "table", caption: "t", rows: [["a", "b"], ["1", "2"]]},
    ];
    p.content = "文\n```figure\nref: kb:a.pdf/x.png\ncaption: c\n```\n";
    expect(countParagraphMedia(p)).toEqual({tables: 1, figures: 0});
    expect(countResidualFenceMedia(p.content).figures).toBe(1);
  });

  it("三十九·1 simpleDocParagraphPrompt 不含系统契约", () => {
    const p = new Paragraph(1, "衬衫集中度信号");
    p.role = "选品师";
    p.question = "头部是否更集中？";
    p.pointGuide = "【本段要点】TOP 占比、同比";
    p.prompt =
      "【输出格式·文章段落】禁止以根据知识库开头 ```table ```figure";
    const s = simpleDocParagraphPrompt(p);
    expect(s).toMatch(/衬衫集中度信号/);
    expect(s).toMatch(/选品师/);
    expect(s).toMatch(/头部是否更集中/);
    expect(s).toMatch(/TOP 占比/);
    expect(s).not.toMatch(/输出格式/);
    expect(s).not.toMatch(/```table/);
  });

  it("paragraphPointLabels 勿把整串契约拆成要点", () => {
    const {paragraphPointLabels} = require("@/components/DocUtil/ViewItem4Doc");
    const p = new Paragraph(1, "趋势分析");
    p.role = "选品师";
    p.question = "围绕「了解市场需求」说明本段贡献";
    p.points = [];
    p.pointGuide = "";
    p.prompt =
      "文章标题是<如何帮助选品师筛选出抖音男装的爆品>，请为它的【了解市场需求】章节中的段落： [趋势分析]撰写约120字的具体内容。" +
      "直接输出正文；禁止以「根据知识库内容」等套话开头；" +
      "【输出格式·文章段落】约 120 字；可分 1～3 个自然段。";
    expect(paragraphPointLabels(p)).toEqual([]);
    const s = simpleDocParagraphPrompt(p);
    expect(s).not.toMatch(/输出格式/);
    expect(s).not.toMatch(/根据知识库/);
    expect(s).toMatch(/选品师/);
  });

  it("三十九·3：```json 内嵌 kb:…png 不触发图表围栏门闩", () => {
    const json =
      '```json\n{"assetRef":"kb:demo.pdf/elements/a.png","caption":"x"}\n```\n';
    expect(contentMayHaveDocBlockFences(json)).toBe(false);
    const fig =
      "```figure\nref: kb:demo.pdf/elements/a.png\ncaption: x\n```\n";
    expect(contentMayHaveDocBlockFences(fig)).toBe(true);
  });
});
