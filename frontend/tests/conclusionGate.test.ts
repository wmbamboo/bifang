/**
 * 十一·9.4 段题互斥 + 任务 8 结论闸
 */
import {Chapter, Doc, findOverlappingParagraphTitles} from "@/components/DocUtil/ViewItem4Doc";
import {
  applyConclusionGate,
  collectBodyMetrics,
  scrubConclusionChapters,
} from "@/components/DocUtil/conclusionGate";

function mkChapters(
  titles: string[][],
  lastTitle = "结论与建议",
): Chapter[] {
  const body = titles
    .map((paras, i) => {
      const ch =
        i === titles.length - 1 ? lastTitle : `章${i + 1}`;
      return `## ${ch}\n\n${paras.map((p) => `### ${p}`).join("\n\n")}`;
    })
    .join("\n\n");
  return Doc.getChaptersFromContent(`# T\n\n${body}`);
}

describe("9.4 段题互斥", () => {
  test("近重复段题 → checkChapter Warn", () => {
    const chapters = mkChapters([
      ["衬衫销量与销售额口径", "大盘走势"],
      ["男士衬衫销量与销售额口径", "客群分层"],
      ["优先动作", "近两周动作"],
    ]);
    const pairs = findOverlappingParagraphTitles(chapters);
    expect(pairs.length).toBeGreaterThan(0);
    const t = Doc.checkChapter(chapters);
    expect(t.code).toBe(1);
    expect(t.msg).toMatch(/段题过近|互不重复/);
  });

  test("差异段题不误报", () => {
    const chapters = mkChapters([
      ["规模与增速", "机会赛道概览"],
      ["热销结构", "价格带与客群"],
      ["优先跟进方向", "近两周动作"],
    ]);
    expect(findOverlappingParagraphTitles(chapters)).toEqual([]);
    expect(Doc.checkChapter(chapters).code).toBe(0);
  });
});

describe("任务8 conclusionGate", () => {
  test("结论含前文没有的数值 → 删句", () => {
    const allowed = new Set(["79.76%", "79.76"]);
    const {text, report} = applyConclusionGate(
      "常规袖以79.76%居首。建议跟进落肩新品至99.9%。优先铺货（推演）。",
      allowed,
    );
    expect(text).toMatch(/79\.76/);
    expect(text).not.toMatch(/99\.9/);
    expect(report.dropped_sentences).toBeGreaterThanOrEqual(1);
  });

  test("建议句补（推演）", () => {
    const {text, report} = applyConclusionGate(
      "建议优先跟进常规袖结构。",
      new Set(),
    );
    expect(text).toMatch(/（推演）/);
    expect(report.tagged_count).toBe(1);
  });

  test("scrubConclusionChapters 用前文指标", () => {
    const chapters = mkChapters([
      ["规模"],
      ["结构"],
      ["动作"],
    ]);
    chapters[0].paragraphs[0].setContent("大盘销量 7280.1万件。");
    chapters[1].paragraphs[0].setContent("常规袖占比 79.76%。");
    chapters[2].paragraphs[0].setContent(
      "建议跟进常规袖。另可冲刺 999亿 虚高目标。",
    );
    const allowed = collectBodyMetrics(chapters);
    expect([...allowed].some((t) => t.includes("79.76"))).toBe(true);
    const {report} = scrubConclusionChapters(chapters);
    expect(chapters[2].paragraphs[0].content).toMatch(/（推演）/);
    expect(chapters[2].paragraphs[0].content).not.toMatch(/999/);
    expect(report.dropped_sentences + report.tagged_count).toBeGreaterThan(0);
  });
});
