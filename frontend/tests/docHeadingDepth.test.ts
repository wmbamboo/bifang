/**
 * 十五：normalizeDocDepth + 体裁 maxLevel 插值。
 * 十四·3.1：章内已有 ### 时，* 行并入 points，不另起段落。
 */
jest.mock("@/services/chatchat/kb", () => ({
  fetchAssetBytes: async () => {
    throw new Error("docHeadingDepth 不应取图");
  },
  listDocs: async () => [],
}));
jest.mock("@/components/DocUtil/kbSelectorModal", () => ({
  ALL_KB_NAME: "all",
}));

import {Chapter, Doc, Paragraph} from "@/components/DocUtil/ViewItem4Doc";
import {
  countDocGenerationUnits,
  normalizeDocDepth,
} from "@/components/DocUtil/docHeadingDepth";
import {buildDocOutlineSystemPrompt} from "@/components/ChatUtil/OutlinePromptComposer";

function para(title: string, points: string[] = []): Paragraph {
  const p = new Paragraph(1, title);
  p.heading = true;
  p.points = points.map((label) => ({label}));
  return p;
}

describe("normalizeDocDepth", () => {
  test("R1 单子塌陷：原段移除，生成单元数等于章数", () => {
    const ch = new Chapter(1, "只有一段的章");
    ch.paragraphs = [para("唯一段")];
    const {chapters, notes} = normalizeDocDepth([ch], {maxLevel: 3});
    expect(chapters[0].collapsed).toBe(true);
    expect(chapters[0].paragraphs).toHaveLength(0);
    expect(countDocGenerationUnits(chapters)).toBe(chapters.length);
    expect(notes.join("")).not.toMatch(/单子层/);
  });

  test("R2 深度截断：超深 points 折进提示并清空", () => {
    const ch = new Chapter(1, "价格带");
    const rich = para("价格带对照", ["衬衫200元", "polo300元", "客群分层"]);
    ch.paragraphs = [rich, para("另一段")];
    normalizeDocDepth([ch], {maxLevel: 2});
    expect(rich.points).toHaveLength(0);
    expect(rich.pointGuide).toMatch(/【本段要点】/);
    expect(rich.pointGuide).toMatch(/衬衫200元/);
    expect(rich.pointGuide).toMatch(/polo300元/);
    expect(rich.pointGuide).toMatch(/客群分层/);
  });

  test("R3 过宽只 Warn，不拆章", () => {
    const ch = new Chapter(1, "过宽章");
    ch.paragraphs = Array.from({length: 8}, (_, i) => para(`段${i + 1}`));
    const {notes} = normalizeDocDepth([ch], {maxLevel: 3, maxSiblings: 6});
    expect(ch.paragraphs).toHaveLength(8);
    expect(notes.filter((n) => /超过/.test(n))).toHaveLength(1);
  });

  test("R4 空壳段删除", () => {
    const ch = new Chapter(1, "章");
    ch.paragraphs = [para("概述"), para("规模与增速"), para("机会赛道")];
    normalizeDocDepth([ch], {maxLevel: 3});
    expect(ch.paragraphs.map((p) => p.title)).toEqual(["规模与增速", "机会赛道"]);
  });
});

describe("buildDocOutlineSystemPrompt maxLevel", () => {
  test("report 为 2 级，research 为 4 级", () => {
    expect(buildDocOutlineSystemPrompt("report")).toMatch(/最深不超过 2 级/);
    expect(buildDocOutlineSystemPrompt("research")).toMatch(/不超过 4 级/);
    expect(buildDocOutlineSystemPrompt("report")).not.toMatch(/\{maxLevel\}/);
  });
});

describe("十四·3.1 * 归并", () => {
  test("已有 ### 时 * 不新建段落", () => {
    const md = [
      "## 价格带",
      "### 甲",
      "* 子点1",
      "* 子点2",
      "### 乙",
      "* 子点3",
      "* 子点4",
      "### 丙",
      "* 子点5",
      "* 子点6",
      "### 丁",
      "* 子点7",
      "* 子点8",
    ].join("\n");
    const chapters = Doc.getChaptersFromContent(md);
    const paras = chapters[0].paragraphs;
    expect(paras).toHaveLength(4);
    const n = paras.reduce((s, p) => s + p.points.length, 0);
    expect(n).toBe(8);
  });

  test("整章没有 ### 时 * 仍是兼容段落", () => {
    const chapters = Doc.getChaptersFromContent("## 旧章\n* 甲\n* 乙\n");
    expect(chapters[0].paragraphs).toHaveLength(2);
    expect(chapters[0].paragraphs.every((p) => !p.heading)).toBe(true);
  });
});
