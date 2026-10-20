import {
  DOC_WORD_BUDGET,
  clampWordBudget,
  formatWordBudgetZh,
  wordBudgetFor,
  countPointLabels,
} from "../src/components/DocUtil/docWordBudget";
import {
  Paragraph,
  Doc,
  assembleDocParagraphPrompt,
  buildDocParagraphFormatPrompt,
  paragraphHasStructuredPrompt,
  paragraphPointLabels,
  applyDocPromptSavePatch,
  DOC_OUTLINE_MARKDOWN_INIT,
} from "../src/components/DocUtil/ViewItem4Doc";
import { buildKbDocWritingConstraintPrompt } from "../src/components/DocUtil/parseChatCompletion";
import { markdownToOutlineStructure } from "../src/components/DocUtil/outlineJson";

describe("docWordBudget 十七·2 要点数驱动单值", () => {
  test("n=0 → heading 150 / body 120", () => {
    expect(wordBudgetFor({ heading: true })).toEqual({ min: 150, max: 150 });
    expect(wordBudgetFor({ heading: false })).toEqual({ min: 120, max: 120 });
    expect(wordBudgetFor({ container: true })).toEqual(DOC_WORD_BUDGET.container);
  });

  test("n=3 → 330", () => {
    expect(
      wordBudgetFor({
        heading: true,
        pointGuide: "【本段要点】a、b、c",
      }),
    ).toEqual({ min: 330, max: 330 });
  });

  test("n=20 → 600 clamp 上界", () => {
    const labels = Array.from({ length: 20 }, (_, i) => ({ label: `p${i}` }));
    expect(wordBudgetFor({ heading: true, points: labels })).toEqual({
      min: 600,
      max: 600,
    });
  });

  test("要点在 pointGuide（points 空）仍算对 n — 17.2.1 回归", () => {
    expect(
      countPointLabels({
        points: [],
        pointGuide: "【本段要点】销量排名第6、同比增250%+、增速高于同价带",
      }),
    ).toBe(3);
    expect(
      wordBudgetFor({
        heading: true,
        points: [],
        pointGuide: "【本段要点】销量排名第6、同比增250%+、增速高于同价带",
      }),
    ).toEqual({ min: 330, max: 330 });
  });

  test("formatWordBudgetZh 单值不写波浪线", () => {
    expect(formatWordBudgetZh({ min: 270, max: 270 })).toBe("270");
    expect(formatWordBudgetZh({ min: 200, max: 400 })).toBe("200～400");
  });

  test("显式预算优先；clamp 保 min≤max", () => {
    expect(
      wordBudgetFor({ heading: true, wordBudget: { min: 100, max: 250 } }),
    ).toEqual({ min: 100, max: 250 });
    expect(clampWordBudget({ min: 500, max: 100 })).toEqual({
      min: 500,
      max: 500,
    });
  });

  test("format / KB 约束共用单值字面", () => {
    const b = { min: 270, max: 270 };
    expect(buildDocParagraphFormatPrompt(b)).toMatch(/约 270 字/);
    expect(buildKbDocWritingConstraintPrompt(b)).toMatch(/约 270 字/);
  });
});

describe("assembleDocParagraphPrompt + setAllPrompt", () => {
  test("setAllPrompt 写入结构化字段且措辞为「约N字」", () => {
    const body = Doc.getContentFromMsg(DOC_OUTLINE_MARKDOWN_INIT);
    const chapters = Doc.getChaptersFromContent(body);
    Doc.setAllPrompt(chapters, "抖音男装选品要点", "");
    const p = chapters[0].paragraphs[0];
    expect(paragraphHasStructuredPrompt(p)).toBe(true);
    expect(p.promptManual).toBe(false);
    expect(p.prompt).toMatch(/撰写约\d+字的具体内容/);
    expect(p.prompt).not.toMatch(/大约.*左右/);
    expect(p.wordBudget!.min).toBe(p.wordBudget!.max);
  });

  test("promptManual 时 assemble 不覆盖整串", () => {
    const p = new Paragraph(1, "测试段");
    p.promptManual = true;
    p.prompt = "用户手改的整串";
    const out = assembleDocParagraphPrompt(p, {
      docTitle: "题",
      chapterTitle: "章",
    });
    expect(out).toBe("用户手改的整串");
  });

  test("docTitle 空时拼「未命名文档」", () => {
    const p = new Paragraph(1, "段");
    p.heading = true;
    const out = assembleDocParagraphPrompt(p, {
      docTitle: "",
      chapterTitle: "章",
    });
    expect(out).toMatch(/文章标题是<未命名文档>/);
  });

  test("fold 进 pointGuide 后预算仍跟要点数", () => {
    const md = `# 题
## 大盘机会与品类位次
### polo衫位次与增速
#### 销量排名第6
#### 同比增250%+
#### 增速显著高于同价带
`;
    const body = Doc.getContentFromMsg(md);
    const chapters = Doc.getChaptersFromContent(body);
    Doc.setAllPrompt(chapters, "抖音商务衬衫polo选品分析", "");
    const p = chapters[0].paragraphs[0];
    expect(p.points.length).toBe(0);
    expect(paragraphPointLabels(p).length).toBe(3);
    expect(p.wordBudget).toEqual({ min: 330, max: 330 });
    expect(p.prompt).toMatch(/约330字/);
  });

  test("保存要点同步进 pointGuide", () => {
    const p = new Paragraph(1, "段");
    applyDocPromptSavePatch(p, {
      prompt: "x",
      points: [{ label: "新1" }, { label: "新2" }],
    });
    expect(p.points).toEqual([]);
    expect(p.pointGuide).toBe("【本段要点】新1、新2");
  });
});

describe("十七·3 docTitle 空兜底", () => {
  test("无 # 时不用首章名冒充文题", () => {
    const md = `## 大盘机会与品类位次
### a
### b
## 价格带证据对照
### c
### d
## 属性与热销款对照
### e
### f
`;
    const s = markdownToOutlineStructure(md);
    expect(s).not.toBeNull();
    expect(s!.title).toBe("未命名文档");
    expect(s!.title).not.toBe("大盘机会与品类位次");
  });

  test("无 # 时优先 fallbackTitle", () => {
    const md = `## 大盘机会与品类位次
### a
### b
## 价格带证据对照
### c
### d
## 属性与热销款对照
### e
### f
`;
    const s = markdownToOutlineStructure(md, "抖音商务衬衫polo选品分析");
    expect(s!.title).toBe("抖音商务衬衫polo选品分析");
  });
});
