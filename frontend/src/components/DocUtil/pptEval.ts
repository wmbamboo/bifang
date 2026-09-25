/**
 * PPT 质量 eval 钩子（P2）：对照金标四指标，供脚本/手工回归调用。
 * 金标页码级清单：req/生成PPT质量评审与技术改进指导.md
 *
 * 忠实度金标见 runFidelityGoldCases —— 改 outlineEvidenceValidate / tipsMismatch 时先跑。
 *
 * 表头/数据分家若再误杀 ≥2 次：停止加窗口启发式，转 JSON 双轨（单元格归属入库）。
 */

import {validateTipsAgainstEvidence} from "@/components/DocUtil/outlineEvidenceValidate";
import {tipsMismatchSlideTitle} from "@/components/DocUtil/outlineJson";

export type EvalCounts = {
  numericAccuracy?: number;
  coverageRate?: number;
  badFillRate?: number;
  hallucinationRate?: number;
};

export type EvalReport = {
  sampleId: string;
  at: string;
  counts: EvalCounts;
  notes?: string[];
};

export function emptyEvalReport(sampleId: string): EvalReport {
  return {
    sampleId,
    at: new Date().toISOString(),
    counts: {},
    notes: ["eval 流水线未接自动抽数；请用金标文档人工勾选后回填"],
  };
}

/**
 * 分块证据：
 * - shirt-gmv / polo：同块远距实体
 * - mixed：就近类防洗白
 * - eq：衬衫/polo 等距
 * - hdr/data：表头与数据分家（靠邻块拼接）
 */
const GOLD_EVIDENCE =
  "⟦chunk:macro⟧ 男装大盘总销量7280.1万，总销售额58.12亿。采样时间区间：2024-03-19至2024-04-17。" +
  "⟦chunk:shirt⟧ 男士衬衫销量296.2万，商务男装衬衫为主。占大盘4.1%。" +
  "⟦chunk:shirt-gmv⟧ 品类销售额表……中间隔开若干单元格……销售额 3.3亿……页脚衬衫品类口径。" +
  "⟦chunk:polo⟧ 品类排行表（采样窗内）……中间隔开若干单元格……销量 403.7万 销售额3.9亿……页眉男士polo衫口径。" +
  "⟦chunk:polo-share⟧ 男装大盘总销量7280.1万。男士polo衫销量 TOP6 403.7万 占比 5.5% 同比+26.9%（同表含总销售额表头）。" +
  "⟦chunk:mixed⟧ 衬衫 销量 296.2万。随后是无关属性。" +
  "（中间隔开很多表格单元格与无关属性文案，模拟合刊 OCR 拍平）".repeat(3) +
  " polo 价格带分布与机会段。" +
  "⟦chunk:eq⟧ 衬衫 9.9亿 polo" +
  "⟦chunk:tbl-hdr⟧ 衬衫品类销售额口径（表头）" +
  "⟦chunk:tbl-data⟧ 单元格数值 3.31亿 无品类词" +
  "⟦chunk:polo-rate⟧ 男士polo衫 同比+30.6% 环比+46.8% 增速可核对。" +
  "⟦chunk:band⟧ 衬衫价格带 ￥50-100 销量80.2万 为机会段。" +
  "⟦chunk:polo-band⟧ 男士polo衫价格带 ¥50以下 126.5万 占比31.34% 同比+35.94%。";

export type FidelityGoldCase = {
  id: string;
  title: string;
  intent?: string;
  tips: string[];
  expectOk: boolean;
  note: string;
  mode?: "evidence" | "mismatch";
};

export const FIDELITY_GOLD_CASES: FidelityGoldCase[] = [
  {
    id: "polo-kpi-far-in-chunk",
    title: "衬衫polo品类排位与增速",
    intent: "category-detail",
    tips: ["metric: 男士polo衫销量 403.7万 同比增速"],
    expectOk: true,
    note: "远距 polo：须过",
  },
  {
    id: "shirt-gmv-far-in-chunk",
    title: "衬衫polo在大盘中的位置",
    intent: "category-position",
    tips: ["衬衫销售额3.3亿", "男士衬衫销量296.2万"],
    expectOk: true,
    note: "远距衬衫 3.3亿：须过",
  },
  {
    id: "position-labeled-contrast",
    title: "衬衫与polo品类位置",
    intent: "category-position",
    tips: [
      "col: 大盘",
      "大盘总销量7280.1万",
      "col: 衬衫",
      "男士衬衫销量296.2万",
    ],
    expectOk: true,
    note: "位置页大盘对照：须过",
  },
  {
    id: "detail-dapan-hijack",
    title: "男士衬衫销量表现",
    intent: "category-detail",
    tips: ["大盘总销量7280.1万", "衬衫增速可观"],
    expectOk: false,
    note: "纯品类页大盘串用：须拦",
  },
  {
    id: "top-sum-rewrite-block",
    title: "衬衫polo品类排位与增速",
    intent: "category-detail",
    tips: ["metric: 男士polo衫销量TOP6合计403.7万 占比5.5%"],
    expectOk: false,
    mode: "mismatch",
    note: "TOP+合计改写：须拦",
  },
  {
    id: "top-native-rank-pass",
    title: "衬衫polo品类排位与增速",
    intent: "category-detail",
    tips: ["metric: 男士polo衫销量TOP6 403.7万 占比5.5%"],
    expectOk: true,
    mode: "mismatch",
    note: "源文原生销量TOP N：须过（方案 B）",
  },
  {
    id: "polo-share-companion-rate",
    title: "衬衫polo在大盘中的位置",
    intent: "category-position",
    tips: ["metric: 403.7万 polo衫销量TOP6 占比5.5%"],
    expectOk: true,
    note: "同 tip 万主量+占比%：表内总销量不得抢 5.5% 就近（须过）",
  },
  {
    id: "shirt-share-of-macro-compound-tip",
    title: "衬衫polo在大盘中的位置",
    intent: "category-position",
    tips: ["metric: 296.2万 男士衬衫TOP7销量，占大盘4.1%"],
    expectOk: true,
    note: "主量点名衬衫+附属占大盘%：296.2 不得被远处「大盘」抢走口径（须过）",
  },
  {
    id: "colsub-sampling-window-not-metric",
    title: "衬衫polo大盘位置对照",
    intent: "category-position",
    tips: [
      "col: 大盘",
      "colSub: 采样窗2024.03.19-04.17",
      "大盘总销量7280.1万",
      "col: 衬衫",
      "男士衬衫销量296.2万",
    ],
    expectOk: true,
    note: "colSub 采样日期不是指标：不得把 2024.03 当大盘数字校验（须过）",
  },
  {
    id: "q1-2024-year-not-metric",
    title: "衬衫与polo品类位置",
    intent: "category-position",
    tips: ["col: 衬衫", "colSub: Q1 2024", "男士衬衫销量296.2万"],
    expectOk: true,
    note: "Q1 不进数字正则、2024 年份豁免：副标非指标（须过）",
  },
  {
    id: "metric-with-date-paren-not-day-fragment",
    title: "衬衫polo在大盘中的位置",
    intent: "category-position",
    tips: [
      "metric: 男装大盘总销量 7,280.1万（2024.03.19-04.17）",
      "metric: 男士衬衫销量296.2万",
    ],
    expectOk: true,
    note: "指标旁注采样日期：不得把 19/04 当日碎片当指标串用（须过）",
  },
  {
    id: "mixed-chunk-wash",
    title: "polo品类销量",
    intent: "category-detail",
    tips: ["男士polo衫销量296.2万"],
    expectOk: false,
    note: "混合 chunk 洗白：须拦",
  },
  {
    id: "equal-dist-shirt-named",
    title: "衬衫销售额对照",
    intent: "category-detail",
    tips: ["衬衫销售额9.9亿"],
    expectOk: true,
    note: "等距歧义点名衬衫：须过",
  },
  {
    id: "equal-dist-polo-named",
    title: "polo销售额对照",
    intent: "category-detail",
    tips: ["男士polo衫销售额9.9亿"],
    expectOk: true,
    note: "等距歧义点名 polo：须过",
  },
  {
    id: "cross-chunk-header-data",
    title: "衬衫品类销售额",
    intent: "category-detail",
    tips: ["衬衫销售额3.31亿"],
    expectOk: true,
    note: "跨 chunk 表头/数据：邻块拼接后须过",
  },
  {
    id: "col-inherit-rate-ok",
    title: "衬衫与polo大盘位置",
    intent: "category-position",
    tips: [
      "col: 衬衫",
      "男士衬衫销量296.2万",
      "col: polo",
      "同比+30.6%、环比+46.8%",
    ],
    expectOk: true,
    note: "分栏继承：col:polo 下裸同比 → 须过",
  },
  {
    id: "bare-rate-no-col",
    title: "衬衫与polo大盘位置",
    intent: "category-position",
    tips: ["同比+30.6%、环比+46.8%", "品类相对大盘更小"],
    expectOk: false,
    note: "无 col:/tip 口径的裸同比：须拦",
  },
  {
    id: "price-band-named-ok",
    title: "衬衫价格带分布",
    intent: "price-band",
    tips: ["￥50-100 销量80.2万"],
    expectOk: true,
    note: "价格带 tip 点名区间：须过",
  },
  {
    id: "price-band-below-pipe-ok",
    title: "polo衫价格带销量分布",
    intent: "price-band",
    tips: ["¥50以下|126.5万|31.34%|+35.94%"],
    expectOk: true,
    note: "table 行 ¥50以下 管道写法：须过",
  },
  {
    id: "price-band-bare-rate",
    title: "衬衫价格带分布",
    intent: "price-band",
    tips: ["同比+30.6%"],
    expectOk: false,
    note: "价格带页裸同比未点名区间：须拦",
  },
];

export type FidelityGoldResult = {
  id: string;
  ok: boolean;
  passed: boolean;
  detail: string;
};

export function runFidelityGoldCases(
  evidence: string = GOLD_EVIDENCE,
): {ok: boolean; results: FidelityGoldResult[]} {
  const results: FidelityGoldResult[] = FIDELITY_GOLD_CASES.map((c) => {
    let err: string | null = null;
    if (c.mode === "mismatch") {
      err = tipsMismatchSlideTitle(c.title, c.tips, c.intent);
    } else {
      err = validateTipsAgainstEvidence(c.title, c.tips, evidence, {
        intent: c.intent,
      });
    }
    const passed = c.expectOk ? !err : !!err;
    return {
      id: c.id,
      ok: passed,
      passed,
      detail: passed
        ? `✓ ${c.note}`
        : `✗ ${c.note}；实际：${err || "（误通过）"}`,
    };
  });
  return {ok: results.every((r) => r.ok), results};
}
