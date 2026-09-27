import {
  defaultRetrievalScope,
  retrievalScopeLabel,
} from "@/components/DocUtil/retrievalScope";
import {
  sourcesForMetricInEvidence,
  tipHasSourceAttribution,
  validateTipsAgainstEvidence,
} from "@/components/DocUtil/outlineEvidenceValidate";

describe("retrieval scope defaults", () => {
  it("bound files → bound_only; none → kb_supplement", () => {
    expect(defaultRetrievalScope([])).toBe("kb_supplement");
    expect(defaultRetrievalScope(undefined)).toBe("kb_supplement");
    expect(defaultRetrievalScope(["a.pdf"])).toBe("bound_only");
    expect(retrievalScopeLabel("bound_only")).toMatch(/所选文档/);
  });
});

describe("cross-doc number attribution", () => {
  const evidence =
    "⟦chunk:1|page:1|src:主文档.pdf⟧ polo销量403.7万\n\n" +
    "⟦chunk:2|page:3|src:2024抖音服饰行业趋势报告.jsonl⟧ 618超会买企划 大促增速+12%";

  it("parses src for a metric", () => {
    expect(sourcesForMetricInEvidence(evidence, "403.7万")).toEqual([
      "主文档.pdf",
    ]);
    expect(sourcesForMetricInEvidence(evidence, "12%")).toEqual([
      "2024抖音服饰行业趋势报告.jsonl",
    ]);
  });

  it("rejects supplement-only number without 来源 when bound", () => {
    const err = validateTipsAgainstEvidence(
      "筛选动作",
      ["+12% 大促增速"],
      evidence,
      {
        boundSources: ["主文档.pdf"],
        retrievalScope: "kb_supplement",
      },
    );
    expect(err).toMatch(/来源|补充文档/);
  });

  it("allows supplement number with attribution", () => {
    expect(tipHasSourceAttribution("（来源：趋势报告）+12%")).toBe(true);
    const err = validateTipsAgainstEvidence(
      "筛选动作",
      ["+12% 大促增速（来源：2024抖音服饰行业趋势报告.jsonl）"],
      evidence,
      {
        boundSources: ["主文档.pdf"],
        retrievalScope: "kb_supplement",
      },
    );
    expect(err).toBeNull();
  });

  it("allows bound-doc number without attribution", () => {
    const err = validateTipsAgainstEvidence(
      "polo销量",
      ["403.7万 男士polo销量"],
      evidence,
      {
        boundSources: ["主文档.pdf"],
        retrievalScope: "kb_supplement",
      },
    );
    expect(err).toBeNull();
  });
});
