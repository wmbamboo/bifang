import {
  checkColumnAxisEvidence,
  findUnsupportedActionSlideTitles,
} from "@/components/DocUtil/outlineCoverage";
import {
  findMetaDiagnosticTips,
  validateFilledSlideInChapter,
  validateOutlineStructure,
} from "@/components/DocUtil/outlineJson";
import {isOrphanNumberFragment} from "@/components/DocUtil/PptProductGate";

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
          title: "赛道与货盘",
          subtitle: "x",
          slides: [{title: "价格带"}, {title: "货盘结构"}],
        },
        {
          title: "筛选与打法",
          subtitle: "x",
          slides: [{title: "款式与卖点筛选动作"}, {title: "店铺跟进"}],
        },
      ],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.msg).toMatch(/材料轴|属性/);
  });

  it("allows attr-facing action titles", () => {
    const ok = validateOutlineStructure({
      title: "测",
      chapters: [
        {
          title: "大盘与类目机会",
          subtitle: "x",
          slides: [{title: "大盘规模"}, {title: "衬衫销量"}],
        },
        {
          title: "赛道与货盘",
          subtitle: "x",
          slides: [{title: "价格带"}, {title: "货盘结构"}],
        },
        {
          title: "筛选与打法",
          subtitle: "x",
          slides: [{title: "衬衫与polo属性筛选"}, {title: "价格带跟进动作"}],
        },
      ],
    });
    expect(ok.ok).toBe(true);
  });

  it("finds meta diagnostic tips", () => {
    expect(
      findMetaDiagnosticTips([
        "col: 衬衫款式",
        "材料未覆盖",
        "col: polo卖点",
        "仅见一项指标",
      ]),
    ).toMatch(/材料未覆盖/);
  });

  it("flags column axes missing from evidence", () => {
    const r = checkColumnAxisEvidence(
      ["col: 衬衫款式", "棉占比居首", "col: polo卖点", "纯色高潜"],
      "男士polo衫销量403.7万 男装大盘总销量7280.1万",
    );
    expect(r.ok).toBe(false);
    expect(r.bareAxes.join(",")).toMatch(/款式|卖点/);
  });

  it("rejects filled columns with meta tips", () => {
    const msg = validateFilledSlideInChapter(
      [
        {
          title: "款式页",
          layout: "columns",
          tips: [
            "col: 衬衫款式",
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
