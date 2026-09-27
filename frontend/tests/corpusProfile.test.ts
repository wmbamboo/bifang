/**
 * 语料画像：换域后词面闸应跟着配置走，而不是死在 apparel 硬编码里。
 */
import {
  CATEGORY_TITLE_RE,
  ENTITY_SHIRT,
  ENTITY_POLO,
  ATTR_AXIS_LEXICON,
  setActiveCorpusProfile,
  resetCorpusProfile,
  DIGITAL3C_STUB_PROFILE_JSON,
  APPAREL_PROFILE_JSON,
  FOOD_PROFILE_JSON,
  tipClaimsBareDapan,
  isAttrAxisPageTitle,
  buildCoverageItemsFromProfile,
  getActiveCorpusProfile,
} from "@/components/DocUtil/corpusProfile";
import {validateTipsAgainstEvidence} from "@/components/DocUtil/outlineEvidenceValidate";
import {buildCoverageChecklist} from "@/components/DocUtil/outlineCoverage";
import {judgeThemeAlignRule} from "@/components/DocUtil/outlineThemeJudge";

afterEach(() => {
  resetCorpusProfile();
});

describe("corpusProfile apparel default", () => {
  it("loads shirt/polo entity words from apparel.json", () => {
    expect(getActiveCorpusProfile().raw.id).toBe("apparel");
    expect(ENTITY_SHIRT).toContain("衬衫");
    expect(ENTITY_POLO.some((w) => /polo/i.test(w))).toBe(true);
    expect(CATEGORY_TITLE_RE.test("男士衬衫销量")).toBe(true);
    expect(ATTR_AXIS_LEXICON.some((a) => a.axis === "袖型")).toBe(true);
  });

  it("coverage checklist still fires for apparel topics", () => {
    const items = buildCoverageChecklist("抖音衬衫 polo 选品 价格带 大盘");
    expect(items.map((x) => x.id)).toEqual(
      expect.arrayContaining(["macro", "price_band", "attr", "shirt_kpi", "polo_kpi"]),
    );
  });
});

describe("corpusProfile digital3c stub — 词面闸换域", () => {
  beforeEach(() => {
    setActiveCorpusProfile(DIGITAL3C_STUB_PROFILE_JSON);
  });

  it("CATEGORY_TITLE_RE 不再认衬衫/polo，而认手机/耳机", () => {
    expect(CATEGORY_TITLE_RE.test("衬衫销量")).toBe(false);
    expect(CATEGORY_TITLE_RE.test("智能手机销量")).toBe(true);
    expect(ENTITY_SHIRT.length).toBe(0);
    expect(ATTR_AXIS_LEXICON.some((a) => a.axis === "续航")).toBe(true);
    expect(ATTR_AXIS_LEXICON.some((a) => a.axis === "袖型")).toBe(false);
  });

  it("服装属性页价带规则在 3C 画像下不对「续航」误套袖型词", () => {
    expect(isAttrAxisPageTitle("续航与降噪属性")).toBe(true);
    expect(isAttrAxisPageTitle("面料占比")).toBe(false);
  });

  it("合法 3C tip 不被服装实体对齐误杀（误杀率脚手架）", () => {
    // 单实体证据：换域后应按 phone 组对齐，而非退回衬衫/polo 硬编码
    const evidence =
      "⟦chunk:1|src:demo.pdf⟧ 智能手机销量 1200万台，同比增长 18%";
    const err = validateTipsAgainstEvidence(
      "智能手机销量概况",
      ["metric: 智能手机销量 1200万"],
      evidence,
    );
    expect(err).toBeNull();
  });

  it("服装词面在 3C 画像下不再要求衬衫口径（漏杀侧：规则哑掉）", () => {
    const evidence =
      "⟦chunk:1|src:demo.pdf⟧ 某品牌手机均价 ¥3999，销量占比 12.5%";
    // 标题/ tip 仍写服装词——3C 画像无衬衫组，不应再走衬衫实体硬拒
    const err = validateTipsAgainstEvidence(
      "面料属性分布",
      ["metric: 棉 45.2%"],
      evidence,
    );
    // 属性页+无画像轴标签时可能仍因数字不在证据拒；关键断言：不得出现「衬衫」串用文案
    if (err) {
      expect(err).not.toMatch(/衬衫|polo/i);
    }
  });

  it("apparel 专属覆盖清单在 3C 主题下不触发", () => {
    expect(
      buildCoverageItemsFromProfile("智能手机 耳机 3C 数码选品"),
    ).toEqual([]);
  });
});

describe("corpusProfile food 第二域 — 误杀率脚手架", () => {
  beforeEach(() => {
    setActiveCorpusProfile(FOOD_PROFILE_JSON);
  });

  it("合法食品 tip 不被服装词面误杀", () => {
    const evidence =
      "⟦chunk:1|src:food.pdf⟧ 坚果礼盒销量 860万件，原味占比 41.2%";
    const err = validateTipsAgainstEvidence(
      "坚果礼盒销量概况",
      ["metric: 坚果礼盒销量 860万"],
      evidence,
    );
    expect(err).toBeNull();
  });

  it("食品属性页拒价格带串窗（画像轴）", () => {
    const bad = judgeThemeAlignRule("口味属性占比", [
      "metric: ¥50-100 销量占比 18.8%",
    ]);
    expect(bad.ok).toBe(false);
  });
});

describe("corpusProfile tipClaimsBareDapan", () => {
  it("apparel：占大盘不计入裸大盘", () => {
    expect(tipClaimsBareDapan("3.3亿 占大盘5.6%")).toBe(false);
    expect(tipClaimsBareDapan("大盘总销量 58亿")).toBe(true);
  });

  it("reload apparel json 与默认一致", () => {
    setActiveCorpusProfile(APPAREL_PROFILE_JSON);
    expect(getActiveCorpusProfile().raw.id).toBe("apparel");
  });
});
