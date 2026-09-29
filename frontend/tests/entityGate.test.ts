/**
 * 任务 2 验收：实体-数值同现（B2）
 */
import {
  applyEntityGate,
  detectSentenceSubjectEntity,
  docsToEvidence,
  judgeEntitySentence,
} from "@/components/DocUtil/entityGate";
import {resetCorpusProfile} from "@/components/DocUtil/corpusProfile";

beforeEach(() => {
  resetCorpusProfile();
});

const EVIDENCE =
  "⟦chunk:macro|page:1|src:大盘.pdf⟧ 男装大盘总销量7,280.1万，环比+46.8%。总销售额58.12亿。" +
  "⟦chunk:polo|page:2|src:polo.pdf⟧ 男士polo衫销量403.7万，环比+12.1%。";

describe("entityGate B2", () => {
  test("BAD：polo 主语配大盘数字 → 拦截（改写或删除）", () => {
    const BAD = "男士polo衫当期总销量7,280.1万，环比增长46.8%。";
    expect(detectSentenceSubjectEntity(BAD)).toBe("polo");
    const j = judgeEntitySentence(BAD, EVIDENCE);
    expect(j.action).not.toBe("pass");
    if (j.action === "rewrite") {
      expect(j.result).toMatch(/大盘|总销量/);
      expect(j.result).not.toMatch(/polo/i);
    }
  });

  test("GOOD：大盘主语配大盘数字 → 通过", () => {
    const GOOD = "男装大盘总销量7,280.1万，环比+46.8%。";
    expect(detectSentenceSubjectEntity(GOOD)).toBe("dapan");
    const j = judgeEntitySentence(GOOD, EVIDENCE);
    expect(j.action).toBe("pass");
  });

  test("applyEntityGate 清洗整段并出报告", () => {
    const text =
      "男士polo衫当期总销量7,280.1万，环比增长46.8%。男装大盘总销量7,280.1万，环比+46.8%。";
    const {text: out, report} = applyEntityGate(text, EVIDENCE);
    expect(report.blocked_count).toBeGreaterThanOrEqual(1);
    expect(out).toMatch(/男装大盘总销量/);
    // 错误 polo 句不得原样残留
    expect(out).not.toMatch(/男士polo衫当期总销量7,?280\.1万/);
  });

  test("docsToEvidence 从 chat docs 拼标记", () => {
    const ev = docsToEvidence([
      {chunk_id: 0, page: 1, source: "a.pdf", content: "男装大盘总销量7280.1万"},
    ]);
    expect(ev).toMatch(/⟦chunk:0\|page:1\|src:a\.pdf⟧/);
    expect(ev).toMatch(/7280\.1万/);
  });
});
