import {
  checkCardTitleAxisEvidence,
  checkColumnAxisEvidence,
  findUnsupportedActionSlideTitles,
} from "@/components/DocUtil/outlineCoverage";
import {
  findDemoActionTips,
  findMetaDiagnosticTips,
} from "@/components/DocUtil/outlineMetaDiagnostic";
import {
  findDuplicateTips,
  findTitleTipEcho,
  isChartAxisFragmentTip,
  isTruncatedTip,
  tipLabelCore,
  validateTipsAgainstEvidence,
} from "@/components/DocUtil/outlineEvidenceValidate";
import {
  validateFilledSlideInChapter,
  validateOutlineStructure,
} from "@/components/DocUtil/outlineJson";
import {
  decodeXmlEntities,
  extractTextFromSlideXml,
  findCrossCardDuplicateLine,
  hasTrailingOrphanDigit,
  isOrphanNumberFragment,
  isPriceBandEdgeFragment,
  scanFilledSlides,
  stripDocCiteMarkers,
  stripProgressMarkers,
} from "@/components/DocUtil/PptProductGate";

describe("meta diagnostic + column coverage gates", () => {
  it("rejects action slide titles without material axis at structure stage", () => {
    const bad = validateOutlineStructure({
      title: "测",
      chapters: [
        {
          title: "大盘与类目机会",
          subtitle: "x",
          slides: [{title: "大盘规模"}, {title: "衬衫销量"}],
        },
        {
          title: "风格与卖点",
          subtitle: "x",
          slides: [
            {title: "面料偏好"},
            {title: "款式与卖点筛选动作"},
          ],
        },
        {
          title: "筛选与打法",
          subtitle: "x",
          slides: [{title: "价格带筛选"}, {title: "跟进清单"}],
        },
      ],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.msg).toMatch(/材料轴|筛选动作/);
  });

  it("allows attr-facing action titles", () => {
    expect(
      findUnsupportedActionSlideTitles({
        title: "t",
        chapters: [
          {
            title: "c",
            slides: [{title: "属性筛选动作"}],
          },
        ],
      }),
    ).toBeNull();
  });

  it("finds meta diagnostic tips", () => {
    expect(findMetaDiagnosticTips(["销量 403.7万", "材料未覆盖"])).toMatch(
      /材料未覆盖/,
    );
  });

  it("flags column axes missing from evidence", () => {
    const r = checkColumnAxisEvidence(
      ["col: 高举高打", "预算前置", "col: 精种准打", "圈层种草"],
      "男士polo衫销量 403.7万",
    );
    expect(r.ok).toBe(false);
    expect(r.bareAxes.length).toBeGreaterThan(0);
  });

  it("rejects filled columns with meta tips", () => {
    const msg = validateFilledSlideInChapter(
      [
        {
          title: "polo卖点对照",
          layout: "columns",
          tips: [
            "col: polo卖点",
            "材料未覆盖",
            "col: polo卖点",
            "口径未标注无法定位",
          ],
        },
      ],
      0,
      "polo 403.7万",
    );
    expect(msg).toMatch(/检索诊断|材料未覆盖/);
  });

  it("orphan gate allows catalog ordinals but blocks bare 30", () => {
    expect(isOrphanNumberFragment("10")).toBe(false);
    expect(isOrphanNumberFragment("01")).toBe(false);
    expect(isOrphanNumberFragment("18")).toBe(false);
    expect(isOrphanNumberFragment("30")).toBe(true);
    expect(isOrphanNumberFragment("200")).toBe(true);
  });

  it("product gate allows price-band edge 200 split across runs", () => {
    expect(
      isPriceBandEdgeFragment("200", "¥100-", "75.9万", "polo¥100-20075.9万"),
    ).toBe(true);
    expect(isPriceBandEdgeFragment("200", "销量", "同比", "销量200同比")).toBe(
      false,
    );
    const xml = `
      <a:t>男士polo衫</a:t>
      <a:t>¥100-</a:t>
      <a:t>200</a:t>
      <a:t>75.9万</a:t>`;
    const r = scanFilledSlides([{slideName: "s", fileContent: xml}]);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("stripProgressMarkers eats progress1-3 whole (no leftover -3)", () => {
    for (const raw of [
      "progress1-3",
      "progress2-5",
      "progress1-5",
      "progress2-4",
    ]) {
      const cleaned = stripProgressMarkers(raw);
      expect(cleaned).toBe("");
      expect(isOrphanNumberFragment(cleaned)).toBe(false);
    }
  });

  it("findUnsupportedActionSlideTitles helper", () => {
    expect(
      findUnsupportedActionSlideTitles({
        title: "t",
        chapters: [
          {
            title: "c",
            slides: [{title: "款式与卖点筛选动作"}],
          },
        ],
      }),
    ).toMatch(/材料轴/);
  });
});

/** v2026826 人眼残留 → 金标：防复发 */
describe("v2026826 residual locks", () => {
  it("rejects demo action tips copied from prompt examples", () => {
    expect(
      findDemoActionTips(["回查属性特征页面料占比图", "棉质可核对"]),
    ).toMatch(/回查/);
    expect(findDemoActionTips(["对照爆款图鉴"])).toMatch(/对照/);
    expect(findDemoActionTips(["棉 72.18% 面料首位"])).toBeNull();

    const msg = validateFilledSlideInChapter(
      [
        {
          title: "polo衫面料与图案偏好",
          layout: "columns",
          tips: [
            "col: polo面料",
            "回查属性特征页面料占比图",
            "col: polo图案",
            "回查属性特征页图案占比图",
          ],
        },
      ],
      0,
      "男士polo衫",
    );
    expect(msg).toMatch(/示范动作语|原数字/);
  });

  it("rejects attribute pages with zero metric tips", () => {
    const msg = validateFilledSlideInChapter(
      [
        {
          title: "衬衫厚薄与袖型偏好",
          layout: "columns",
          tips: [
            "col: 衬衫厚薄",
            "厚薄占比独立成图",
            "col: 衬衫袖型",
            "两轴先定再选款",
          ],
        },
      ],
      0,
      "男士衬衫属性",
    );
    expect(msg).toMatch(/原数字|属性/);
  });

  it("rejects long title and title-tip echo", () => {
    const long = validateFilledSlideInChapter(
      [
        {
          title:
            "男士polo衫与男士衬衫各自单列品类大盘，采样时间区间为2024-03-19至2024-04-17",
          layout: "list",
          tips: ["衬衫与polo分开统计", "先筛价格带再进款式", "盯大促备货"],
        },
      ],
      0,
    );
    expect(long).toMatch(/标题过长|短标题/);

    const echo = findTitleTipEcho("本期销量5.3万，为高弹加宽款最高", [
      "本期销量5.3万，为高弹加宽款最高",
      "腰腹加宽承接需求",
    ]);
    expect(echo).toMatch(/同文|短标题/);
  });

  it("findDuplicateTips catches cross-card same sentence", () => {
    expect(
      findDuplicateTips([
        "按占比最高档排产",
        "袖型单列一张图",
        "按占比最高档排产",
      ]),
    ).toMatch(/重复/);
    expect(
      findDuplicateTips([
        "本期销量5.3万，为高弹加宽款最高",
        "腰腹加宽/高弹衬衫销量居首",
        "list: 本期销量5.3万，为高弹加宽款最高",
      ]),
    ).toMatch(/重复|跨卡/);
  });

  it("rejects polo-only price-band table under generic title", () => {
    const msg = validateFilledSlideInChapter(
      [
        {
          title: "主力与机会价格带筛选",
          layout: "table",
          tips: [
            "品类|价格带|本期销量|销量同比",
            "男士polo衫|¥50-100|172.6万|＋17.09%",
            "男士polo衫|¥50以下|126.5万|＋35.94%",
            "男士polo衫|¥100-200|75.9万|＋18.57%",
            "男士polo衫|¥200-300|20.0万|＋130.75%",
          ],
        },
      ],
      0,
      "男士polo衫 ¥50-100 172.6万 男士衬衫 ¥50-100 129.4万",
    );
    expect(msg).toMatch(/衬衫/);
  });

  it("product gate catches trailing orphan 0; cross-card dup is warn only", () => {
    expect(hasTrailingOrphanDigit("年货节、双11超会买、618超会买0")).toBe(
      true,
    );
    expect(hasTrailingOrphanDigit("销量 403.7万")).toBe(false);

    const xmlDup = `
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:t>本期销量5.3万，为高弹加宽款最高</a:t>
        <a:t>腰腹加宽承接</a:t>
        <a:t>本期销量5.3万，为高弹加宽款最高</a:t>
      </p:sld>`;
    const r1 = scanFilledSlides([{slideName: "s", fileContent: xmlDup}]);
    expect(r1.ok).toBe(true);
    expect(r1.warnings[0]?.reason).toMatch(/跨卡重复/);

    const xmlOrphan = `
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:t>盯年货节双11备货</a:t>
        <a:t>年货节/CNY、双11超会买、618超会买0</a:t>
      </p:sld>`;
    const r2 = scanFilledSlides([{slideName: "s", fileContent: xmlOrphan}]);
    expect(r2.ok).toBe(false);
    expect(r2.errors[0]?.reason).toMatch(/句尾孤儿/);
  });

  it("decodes &#x; so short Chinese labels are not false-dup", () => {
    expect(decodeXmlEntities("&#x7537;&#x58eb;Polo")).toBe("男士Polo");
    // 表品类列合法重复：解码后「男士Polo」长度 < 8 → 不报
    const xml = `
      <a:t>&#x7537;&#x58eb;Polo</a:t>
      <a:t>&#x7537;&#x58eb;Polo</a:t>
      <a:t>&#x7537;&#x58eb;Polo</a:t>`;
    const lines = extractTextFromSlideXml(xml).split("\n");
    expect(lines.every((l) => l === "男士Polo")).toBe(true);
    expect(findCrossCardDuplicateLine(lines)).toBeNull();
  });

  it("card title axis rejects 袖型 card filled with 厚薄 labels", () => {
    const bad = checkCardTitleAxisEvidence(
      "袖型属性占比",
      ["常规 73.63%", "薄款 25.90%", "加厚 0.28%", "超薄 0.14%", "厚款 0.02%"],
      "属性特征分析 厚薄 常规 73.63% 薄款 25.90% 袖型 落肩袖 15.06%",
    );
    expect(bad.ok).toBe(false);
    expect(bad.hint).toMatch(/袖型|厚薄/);

    const ok = checkCardTitleAxisEvidence(
      "袖型属性占比",
      ["落肩袖 15.06%", "灯笼袖 1.67%", "常规袖 1.50%", "插肩袖 1.38%"],
      "袖型 落肩袖 15.06% 灯笼袖 1.67% 常规袖 1.50% 插肩袖 1.38%",
    );
    expect(ok.ok).toBe(true);

    const fillBad = validateFilledSlideInChapter(
      [
        {
          title: "袖型属性占比",
          layout: "list",
          tips: [
            "常规 73.63%，薄款 25.90%",
            "加厚 0.28%，超薄 0.14%，厚款 0.02%",
          ],
        },
      ],
      0,
      "厚薄 常规 73.63% 薄款 25.90% 加厚 0.28%",
    );
    expect(fillBad).toMatch(/袖型|厚薄/);
  });

  it("mixed 厚薄与款式 page allows 袖型 tip with 常规% on own line", () => {
    const ok = checkCardTitleAxisEvidence(
      "衬衫厚薄与款式属性",
      [
        "厚薄常规 73.63%：男士衬衫厚薄首位",
        "薄款 25.90%",
        "袖型常规 79.76%：男士衬衫袖型",
        "落肩袖 15.06%",
      ],
      "属性特征 厚薄 常规 73.63% 薄款 25.90% 袖型 常规 79.76% 落肩袖 15.06%",
    );
    expect(ok.ok).toBe(true);

    // 真串窗仍拒：袖型卡头却堆厚薄专属标签
    const bad = checkCardTitleAxisEvidence(
      "袖型占比",
      ["袖型：薄款 25.90% 加厚 0.28% 超薄 0.14% 厚款 0.02%"],
      "厚薄 薄款 25.90% 加厚 0.28% 袖型 落肩袖 15.06%",
    );
    expect(bad.ok).toBe(false);
  });

  it("fabric page rejects price-band tip串窗", () => {
    const bad = checkCardTitleAxisEvidence(
      "polo衫面料材质属性占比",
      ["metric: 18.80% ¥100-200 polo衫销量"],
      "男士polo衫价格带 ¥100-200 75.9万 占比 18.8% 棉 72.18%",
    );
    expect(bad.ok).toBe(false);
    expect(bad.hint).toMatch(/价格带|面料/);

    const fidelity = validateTipsAgainstEvidence(
      "polo衫面料材质属性占比",
      ["metric: 18.80% ¥100-200 polo衫销量"],
      "男士polo衫价格带 ¥100-200 75.9万 占比 18.8% 棉 72.18%",
    );
    expect(fidelity).toMatch(/价格带|面料|属性/);

    // 查表：无 ¥ 串，但证据标了 axis=价格带 → 仍拒（ingest 元数据）
    const byAxis = validateTipsAgainstEvidence(
      "polo衫面料材质属性占比",
      ["metric: 18.80% polo衫销量占比"],
      "⟦chunk:extract-p2|page:2|axes:价格带⟧\n75.9万 polo衫 ¥100-200 18.8% axis=价格带",
    );
    expect(byAxis).toMatch(/axis=价格带|属性|面料/);

    const ok = checkCardTitleAxisEvidence(
      "polo衫面料材质属性占比",
      ["metric: 棉 72.18% polo面料首位", "metric: 聚酯纤维 19.16%"],
      "属性特征 面料材质 棉 72.18% 聚酯纤维 19.16%",
    );
    expect(ok.ok).toBe(true);

    const fillBad = validateFilledSlideInChapter(
      [
        {
          title: "polo衫面料材质属性占比",
          layout: "metric",
          tips: [
            "metric: 18.80% ¥100-200 polo衫销量",
            "metric: 75.9万 polo衫本期销量",
          ],
        },
      ],
      0,
      "¥100-200 75.9万 占比 18.8% 棉 72.18%",
    );
    expect(fillBad).toMatch(/价格带|面料/);
  });

  it("strips and gates [文档N] cite markers", () => {
    expect(stripDocCiteMarkers("棉 72.18%[文档1]纯色 70.07%[文档1][文档7")).toBe(
      "棉 72.18%纯色 70.07%",
    );
    const xml = `
      <a:t>棉 72.18%[文档1]</a:t>
      <a:t>纯色占比[文档1][文档7</a:t>`;
    const r = scanFilledSlides([{slideName: "s", fileContent: xml}]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.reason).toMatch(/文档/);
  });

  it("short label core dup across cards with different prices", () => {
    expect(tipLabelCore("腰腹加宽/高弹衬衫 ¥129")).toContain("腰腹加宽");
    expect(
      findDuplicateTips([
        "腰腹加宽/高弹衬衫 ¥129",
        "腰腹加宽/高弹衬衫 ¥119",
      ]),
    ).toMatch(/短标签|重复/);
    expect(
      findCrossCardDuplicateLine([
        "腰腹加宽/高弹衬衫 ¥129",
        "腰腹加宽/高弹衬衫 ¥119",
      ]),
    ).toBeTruthy();
  });

  it("truncation and chart-axis fragment gates", () => {
    expect(isTruncatedTip("采样窗2024-03-19至2024-04-")).toBe(true);
    expect(isTruncatedTip("主力价格带均为各价格")).toBe(true);
    expect(isTruncatedTip("采样时间2024-03-19至2024-04-17")).toBe(false);
    expect(isChartAxisFragmentTip("¥50 / ¥100 / ¥200 / ¥300")).toBe(true);
    expect(isChartAxisFragmentTip("TOP款口径")).toBe(true);
    expect(isChartAxisFragmentTip("棉 72.18% 面料占比最高")).toBe(false);

    const truncPage = validateFilledSlideInChapter(
      [
        {
          title: "价格带口径",
          layout: "list",
          tips: [
            "采样窗2024-03-19至2024-04-",
            "衬衫 ¥50-100 销量 129.4万",
          ],
        },
      ],
      0,
    );
    expect(truncPage).toMatch(/截断/);

    const chartPage = validateFilledSlideInChapter(
      [
        {
          title: "价格带分布图",
          layout: "list",
          tips: ["¥50 / ¥100 / ¥200", "TOP款口径", "销量席位"],
        },
      ],
      0,
    );
    expect(chartPage).toMatch(/图表|刻度|坐标/);

    const xml = `
      <a:t>¥50 / ¥100 / ¥200 / ¥300</a:t>
      <a:t>TOP款口径</a:t>`;
    const r = scanFilledSlides([{slideName: "s", fileContent: xml}]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.reason).toMatch(/图表|刻度/);
  });
});
