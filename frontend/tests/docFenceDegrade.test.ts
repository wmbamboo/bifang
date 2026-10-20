/**
 * 十九·3：围栏退化形态容错（三条真实 fixture）
 */
import {
  Paragraph,
  absorbBlocksFromParagraphContent,
} from "../src/components/DocUtil/ViewItem4Doc";
import {
  preprocessDegradedFences,
  matchFenceOpen,
} from "../src/components/DocUtil/docFenceNormalize";
import {
  buildKbDocWritingConstraintPrompt,
  stripHallucinatedDocCitations,
} from "../src/components/DocUtil/parseChatCompletion";

describe("十九·3 围栏退化", () => {
  test("① figureref: 归一成 figure 块，正文无泄漏", () => {
    const raw =
      "正文一句。\n" +
      "```figureref: kb:抖音单品爆款分析-商务男士衬衫polo衫.pdf/elements/x_p1_img1.png\n" +
      "caption: 抖音商务男装衬衫/polo衫热销爆款采样概览（2024.03.19–2024.04.17）\n" +
      "```\n" +
      "收尾。";
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.content).toMatch(/正文一句/);
    expect(p.content).toMatch(/收尾/);
    expect(p.content).not.toMatch(/figureref|```/);
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].kind).toBe("figure");
    if (p.blocks[0].kind === "figure") {
      expect(p.blocks[0].assetRef).toMatch(/^kb:/);
      expect(p.blocks[0].caption).toMatch(/热销爆款/);
    }
  });

  test("② tablecaption: 归一成 table 块", () => {
    const raw =
      "导语。\n" +
      "```tablecaption: polo衫在男装大盘中的位次与增速| 维度 | 位次 | 规模 | 同比 | 环比 | 占大盘 || 销量 | TOP6 | 403.7万 | 18% | 5% | 12% |\n" +
      "```\n";
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.content).toBe("导语。");
    expect(p.content).not.toMatch(/tablecaption|```/);
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].kind).toBe("table");
    if (p.blocks[0].kind === "table") {
      expect(p.blocks[0].caption).toMatch(/位次与增速/);
      expect(p.blocks[0].rows.length).toBeGreaterThanOrEqual(2);
      expect(p.blocks[0].rows[0][0]).toMatch(/维度/);
    }
  });

  test("③ 紧邻 ``` ``` 切成两块", () => {
    const raw =
      "前。\n" +
      "```table\n" +
      "caption: 价带\n" +
      "| 带 | 销量 |\n" +
      "| 300-400 | 4.9万 |\n" +
      "``````figureref: kb:demo.pdf/elements/a.png\n" +
      "caption: 样图\n" +
      "```\n" +
      "后。";
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.content).toBe("前。\n后。");
    expect(p.blocks.map((b) => b.kind)).toEqual(["table", "figure"]);
  });

  test("无图表语义的代码块不吸收、原文保留（二十四·B）", () => {
    const raw =
      "可见文字\n```xyz\nstrange payload\n```\n还有";
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.content).toMatch(/strange payload/);
    expect(p.content).toMatch(/```xyz/);
    expect(p.blocks).toHaveLength(0);
  });

  test("吸收过程中 unknown 围栏丢弃不回灌", () => {
    const raw =
      "前\n```figure\nref: kb:a.pdf/1\ncaption: 样\n```\n```xyz\nstrange\n```\n后";
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.blocks).toHaveLength(1);
    expect(p.content).toBe("前\n后");
    expect(p.content).not.toMatch(/strange|```/);
  });

  test("preprocess / matchFenceOpen 烟雾", () => {
    const s = preprocessDegradedFences(
      "```figureref: kb:a.png\n```\n```tablecaption: 题| a | b |\n```",
    );
    expect(s).toMatch(/```figure\nref: kb:a\.png/);
    expect(s).toMatch(/```table\ncaption:/);
    expect(matchFenceOpen("```figure")).toEqual({kind: "figure", rest: ""});
    expect(matchFenceOpen("```table")).toEqual({kind: "table", rest: ""});
  });
});

describe("十九·2 Ai 无检索约束", () => {
  test("hasRetrieval:false 禁止 [文档N]，true 仍允许", () => {
    const no = buildKbDocWritingConstraintPrompt(
      {min: 270, max: 270},
      {hasRetrieval: false},
    );
    expect(no).toMatch(/禁止输出任何 \[文档/);
    expect(no).not.toMatch(/可在句末用 \[文档1]/);
    const yes = buildKbDocWritingConstraintPrompt(
      {min: 270, max: 270},
      {hasRetrieval: true},
    );
    expect(yes).toMatch(/可在句末用 \[文档1\]/);
  });

  test("stripHallucinatedDocCitations 剥离引注", () => {
    const r = stripHallucinatedDocCitations(
      "销量 403.7万[文档1]，同比升[文档2][文档3]。",
    );
    expect(r.stripped).toBe(3);
    expect(r.text).not.toMatch(/\[文档/);
    expect(r.text).toMatch(/403\.7万/);
  });
});

describe("absorb 回归：标准围栏仍可用", () => {
  test("标准 ```table / ```figure", () => {
    const p = new Paragraph(1, "段");
    p.content =
      "文\n```table\ncaption: t\n| a | b |\n| 1 | 2 |\n```\n```figure\nref: kb:x.png\ncaption: f\n```\n";
    absorbBlocksFromParagraphContent(p);
    expect(p.content).toBe("文");
    expect(p.blocks.map((b) => b.kind)).toEqual(["table", "figure"]);
  });
});

describe("二十一·18 按位置归一", () => {
  test("④a+④b+④d：正文紧贴开栏、pngcaption、行尾闭合", () => {
    const raw =
      "备货结论。```figure\n" +
      "ref: kb:demo.pdf/elements/x_p1_chart.pngcaption: 热销概览```\n" +
      "收尾。";
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.content).toMatch(/备货结论/);
    expect(p.content).toMatch(/收尾/);
    expect(p.content).not.toMatch(/```|pngcaption/);
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].kind).toBe("figure");
    if (p.blocks[0].kind === "figure") {
      expect(p.blocks[0].assetRef).toBe(
        "kb:demo.pdf/elements/x_p1_chart.png",
      );
      expect(p.blocks[0].caption).toMatch(/热销概览/);
    }
  });

  test("④c：table caption 与管道列切分", () => {
    const raw =
      "导。```table\ncaption: 价带位次| 带 | 销量 |\n| 300-400 | 4.9万 |\n```\n";
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].kind).toBe("table");
    if (p.blocks[0].kind === "table") {
      expect(p.blocks[0].caption).toMatch(/价带位次/);
      expect(p.blocks[0].rows[0][0]).toMatch(/带/);
    }
  });
});

describe("二十一·9 allowFigure 约束", () => {
  test("allowFigure:false 写入禁 figure 规则", () => {
    const no = buildKbDocWritingConstraintPrompt(
      {min: 150, max: 150},
      {allowFigure: false},
    );
    expect(no).toMatch(/禁止输出.*figure/);
    const yes = buildKbDocWritingConstraintPrompt(
      {min: 150, max: 150},
      {allowFigure: true},
    );
    expect(yes).not.toMatch(/本页无可用插图资产/);
  });
});

describe("二十四·A 空单元格表格", () => {
  test("3 列含空单元格不拆坏", () => {
    const raw = [
      "```table",
      "caption: 对比",
      "| 指标 | 数值 | 说明 |",
      "| --- | --- | --- |",
      "| A |  | 高 |",
      "| B | 3 | 中 |",
      "```",
    ].join("\n");
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].kind).toBe("table");
    if (p.blocks[0].kind === "table") {
      expect(p.blocks[0].rows).toEqual([
        ["指标", "数值", "说明"],
        ["A", "", "高"],
        ["B", "3", "中"],
      ]);
    }
  });

  test("真 || 粘连仍拆行", () => {
    const raw =
      "```table\ncaption: t\n| a | b || c | d |\n```\n";
    const p = new Paragraph(1, "段");
    p.setContent(raw);
    expect(p.blocks[0].kind).toBe("table");
    if (p.blocks[0].kind === "table") {
      expect(p.blocks[0].rows.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("二十四·B 非图表代码块不误清 blocks", () => {
  test("已有 figure + 正文含 json 代码块 → 保留图与代码", () => {
    const p = new Paragraph(1, "段");
    p.blocks = [
      {kind: "figure", assetRef: "kb:a.pdf/1", caption: "样图"},
    ];
    p.content = '正文\n```json\n{"a":1}\n```\n收尾';
    absorbBlocksFromParagraphContent(p);
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].kind).toBe("figure");
    expect(p.content).toMatch(/```json/);
    expect(p.content).toMatch(/收尾/);
  });
});
