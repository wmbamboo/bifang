/**
 * Word 大纲/写作对齐：章数校验、散文契约、layout 元数据过滤（八）
 */
import {
  Doc,
  Chapter,
  Paragraph,
  buildDocParagraphFormatPrompt,
  stripDocOutlineMetaLines,
  DOC_OUTLINE_MARKDOWN_INIT,
  inferDocWritingRole,
} from "@/components/DocUtil/ViewItem4Doc";
import {
  KB_DOC_WRITING_CONSTRAINT_PROMPT,
  KB_WRITING_CONSTRAINT_PROMPT,
} from "@/components/DocUtil/parseChatCompletion";
import {readFileSync} from "fs";
import {join} from "path";

describe("Doc.checkChapter", () => {
  const mk = (nCh: number, nPara: number, heading = true) => {
    const chapters: Chapter[] = [];
    for (let i = 0; i < nCh; i++) {
      const title = i === nCh - 1 ? "结论与建议" : `章${i + 1}`;
      const ch = new Chapter(i, title);
      const paras: Paragraph[] = [];
      for (let j = 0; j < nPara; j++) {
        const p = new Paragraph(j, `段${j + 1}`);
        p.heading = heading;
        paras.push(p);
      }
      ch.paragraphs = paras;
      chapters.push(ch);
    }
    return chapters;
  };

  test("3 章×2 段通过", () => {
    expect(Doc.checkChapter(mk(3, 2)).code).toBe(0);
  });

  test("7 章拒收", () => {
    expect(Doc.checkChapter(mk(7, 2)).code).toBe(-3);
  });

  test("章内 1 段拒收", () => {
    expect(Doc.checkChapter(mk(3, 1)).code).toBe(-2);
  });

  test("全 bullet 无 ### → Warn 可保存", () => {
    const t = Doc.checkChapter(mk(3, 3, false));
    expect(t.code).toBeGreaterThan(0);
  });

  test("末章非结论 → Warn 不拒单", () => {
    const chapters = mk(3, 2);
    chapters[2].title = "渠道节奏";
    const t = Doc.checkChapter(chapters);
    expect(t.code).toBeGreaterThan(0);
    expect(t.msg).toMatch(/结论|建议/);
  });
});

describe("十一·文章质量层", () => {
  test("种子大纲 ### + 结论章且 check 通过", () => {
    const body = Doc.getContentFromMsg(DOC_OUTLINE_MARKDOWN_INIT);
    const chapters = Doc.getChaptersFromContent(body);
    expect(chapters.length).toBe(4);
    expect(chapters.every((c) => c.paragraphs.every((p) => p.heading))).toBe(
      true,
    );
    expect(chapters[3].title).toMatch(/结论|动作/);
    expect(Doc.checkChapter(chapters).code).toBe(0);
  });

  test("setAllPrompt 含岗位/边界/结论归属", () => {
    const body = Doc.getContentFromMsg(DOC_OUTLINE_MARKDOWN_INIT);
    const chapters = Doc.getChaptersFromContent(body);
    Doc.setAllPrompt(chapters, "抖音男装选品要点", "", {
      role: inferDocWritingRole("抖音男装选品要点"),
    });
    const p0 = chapters[0].paragraphs[0].prompt;
    expect(p0).toMatch(/选品师/);
    expect(p0).toMatch(/本章要回答的问题/);
    expect(p0).toMatch(/勿重复/);
    expect(p0).toMatch(/留给末章/);
    const last = chapters[3].paragraphs[0].prompt;
    expect(last).toMatch(/结论\/建议归属章/);
  });

  test("骨架含结论章与 selection 体裁（读源码）", () => {
    const src = readFileSync(
      join(__dirname, "../src/components/ChatUtil/OutlinePromptComposer.tsx"),
      "utf8",
    );
    expect(src).toMatch(/【结论章】/);
    expect(src).toMatch(/selection:\s*\{/);
    expect(src).toMatch(/机会面 → 证据对照/);
    expect(src).toMatch(/只有用户显式选择才 forced|仅当调用方传入\*\*显式\*\*/);
  });
});

describe("doc layout meta strip（八·0 fixture）", () => {
  const BAD = `# 2024年男装流行趋势
## 社媒热度与节奏
* layout: metric
- 近一年男装作品量与互动量
- 下半年热度高于上半年
- 秀经济与上新带来的春季小高峰
## 西服品类的品牌竞争
* layout: list
- 高作品量主力品牌
- 互动增速品牌
- 客单与转化线索
## 面料与质感
- 编织肌理
- 凉感面料
## 渠道节奏
- 内容起量
- 货架承接
`;

  test("layout 行不进 paragraphs，要点仍解析", () => {
    const body = Doc.getContentFromMsg(stripDocOutlineMetaLines(BAD));
    const chapters = Doc.getChaptersFromContent(body);
    expect(chapters.length).toBe(4);
    for (const ch of chapters) {
      expect(ch.paragraphs.some((p) => /layout/i.test(p.title))).toBe(false);
      expect(ch.paragraphs.length).toBeGreaterThanOrEqual(2);
    }
    expect(chapters[0].paragraphs[0].title).toMatch(/作品量|互动/);
    expect(chapters[0].paragraphs.every((p) => !p.heading)).toBe(true);
  });

  test("校验为 Warn 非拒收", () => {
    const body = Doc.getContentFromMsg(stripDocOutlineMetaLines(BAD));
    const t = Doc.checkChapter(Doc.getChaptersFromContent(body));
    expect(t.code).toBeGreaterThan(0);
  });
});

describe("doc writing contracts", () => {
  test("文章 KB 约束禁止 PPT 编号行；PPT 版仍要求编号", () => {
    expect(KB_DOC_WRITING_CONSTRAINT_PROMPT).toMatch(/禁止.*编号清单/);
    expect(KB_WRITING_CONSTRAINT_PROMPT).toMatch(/逐行编号/);
  });

  test("段落 format 含表图判据", () => {
    const fmt = buildDocParagraphFormatPrompt();
    expect(fmt).toMatch(/200～400/);
    expect(fmt).toMatch(/禁止.*编号清单/);
    expect(fmt).toMatch(/≥2 个对象/);
    expect(fmt).toMatch(/不要写 figure|禁止.*figure/);
  });

  test("骨架禁 layout 字段行且含段类型（读源码，避 antd）", () => {
    const src = readFileSync(
      join(__dirname, "../src/components/ChatUtil/OutlinePromptComposer.tsx"),
      "utf8",
    );
    expect(src).toMatch(/禁止出现 layout/);
    expect(src).toMatch(/【段类型】/);
    expect(src).toMatch(/示例·错误/);
    // doc system 不得拼进 PPT layout 选型目录常量正文
    const catalogIdx = src.indexOf("PPT_OUTLINE_LAYOUT_CATALOG");
    const buildIdx = src.indexOf("buildDocOutlineSystemPrompt");
    expect(catalogIdx).toBeGreaterThan(-1);
    expect(buildIdx).toBeGreaterThan(-1);
    const buildBody = src.slice(buildIdx, buildIdx + 280);
    expect(buildBody).not.toMatch(/PPT_OUTLINE_LAYOUT_CATALOG/);
  });
});

describe("落点：调用方用 code < 0", () => {
  test("ChatWithSpeech4Doc / OutlineSelectDrawer", () => {
    const doc = readFileSync(
      join(__dirname, "../src/components/ChatUtil/ChatWithSpeech4Doc.tsx"),
      "utf8",
    );
    const drawer = readFileSync(
      join(__dirname, "../src/components/DocUtil/OutlineSelectDrawer.tsx"),
      "utf8",
    );
    expect(doc).toMatch(/t\.code\s*<\s*0/);
    expect(drawer).toMatch(/chkMsg\.code\s*<\s*0/);
  });
});
