/**
 * 任务 3 验收（十·3 第 1 步）：排名断言 vs 证据 max 百分数
 */
import {
  applyRankingGate,
  claimedRankLabel,
  extractLabelPctPairs,
  judgeRankingSentence,
  pickTopPair,
} from "@/components/DocUtil/rankingGate";

const EVIDENCE =
  "袖型销量占比：常规袖 79.76%，落肩袖 15.06%，插肩袖 5.18%。";

describe("rankingGate B3", () => {
  test("抽对 + 取 max", () => {
    const pairs = extractLabelPctPairs(EVIDENCE);
    expect(pairs.some((p) => p.label.includes("常规") && p.pct === 79.76)).toBe(
      true,
    );
    expect(pickTopPair(pairs)?.pct).toBe(79.76);
  });

  test("落肩袖位居首位 → 改写为常规居首", () => {
    const BAD = "落肩袖以15.06%位居首位，落肩剪裁已成默认结构。";
    expect(claimedRankLabel(BAD)).toMatch(/落肩/);
    const j = judgeRankingSentence(BAD, EVIDENCE);
    expect(j.action).toBe("rewrite");
    expect(j.result).toMatch(/常规/);
    expect(j.result).toMatch(/79\.76/);
    expect(j.result).not.toMatch(/落肩袖以15/);
  });

  test("常规袖居首 → 通过", () => {
    const GOOD = "常规袖以79.76%位居首位。";
    const j = judgeRankingSentence(GOOD, EVIDENCE);
    expect(j.action).toBe("pass");
  });

  test("applyRankingGate 整段", () => {
    const text =
      "落肩袖以15.06%位居首位。面料以棉为主。";
    const {text: out, report} = applyRankingGate(text, EVIDENCE);
    expect(report.rewritten_count).toBe(1);
    expect(out).toMatch(/常规/);
    expect(out).toMatch(/面料以棉为主/);
  });
});
