/**
 * 五·4 结构可判金标（域无关契约）。
 */
import {
  checkColumnItemAxisAlign,
  findMissingDominantAttrShare,
} from "@/components/DocUtil/outlineCoverage";
import {
  alignItemsToColumnSlots,
  Ppt,
} from "@/components/DocUtil/ViewItem4Ppt";
import {
  assertImageGridSameSource,
} from "@/components/DocUtil/kbImageAssetsCore";
import {aspectDeviation, coverSrcRect} from "@/components/DocUtil/imageBufferMeta";
import {shopMetricMismatchInEvidence} from "@/components/DocUtil/outlineEvidenceValidate";

describe("五·4 结构断言金标", () => {
  it("列内标签必须与列头同轴（面料列禁图案）", () => {
    const bad = checkColumnItemAxisAlign([
      "col: 面料",
      "棉 72.18%",
      "纯色 70.07%",
      "col: 图案",
      "动物图案 2.01%",
      "动物图案 2.01%",
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.hint).toMatch(/面料|图案|同轴/);

    const good = checkColumnItemAxisAlign([
      "col: 面料",
      "棉 72.18%",
      "锦纶 1.49%",
      "col: 图案",
      "纯色 70.07%",
      "动物图案 2.01%",
    ]);
    expect(good.ok).toBe(true);
  });

  it("模板槽位>数据条数 → 留空而非抢池复制", () => {
    const sub = [
      "col: 面料",
      "棉 72%",
      "锦纶 1.49%",
      "col: 图案",
      "纯色 70%",
      "条纹 10%",
      "动物图案 2%",
    ].join("\n");
    // 生成侧只有图案 3 条进 pool（模拟面料未单独生成）
    const aligned = alignItemsToColumnSlots(sub, [
      {title: "纯色 70%", content: "a"},
      {title: "条纹 10%", content: "b"},
      {title: "动物图案 2%", content: "c"},
    ]);
    const fabric = aligned.filter((a) => a.colTitle === "面料");
    // 无匹配 → 用大纲 want 留空 content，不得把「纯色」抢进面料
    expect(fabric.map((f) => f.title)).toEqual(["棉 72%", "锦纶 1.49%"]);
    expect(fabric.every((f) => f.content === "")).toBe(true);
    const pattern = aligned.filter((a) => a.colTitle === "图案");
    expect(pattern.map((p) => p.title)).toEqual([
      "纯色 70%",
      "条纹 10%",
      "动物图案 2%",
    ]);
  });

  it("list 不因 pad 抬到 3 槽造空卡", () => {
    const v: Record<string, string> = {
      item1: "罗蒙",
      item1_Desc: "5.3万件",
      item2: "第二名",
      item2_Desc: "2.6万件",
    };
    const n = Ppt.padVItemForTemplate(v, 5);
    expect(n).toBe(2);
    expect(v.item3).toBeUndefined();
  });

  it("图片同源 + 宽高比>15% 须裁切", () => {
    expect(
      assertImageGridSameSource([
        {file_name: "polo.pdf"},
        {file_name: "other.pdf"},
      ]),
    ).toMatch(/跨文档/);
    expect(
      assertImageGridSameSource([
        {file_name: "polo.pdf"},
        {file_name: "polo.pdf"},
      ]),
    ).toBeNull();

    const slotW = 5120640;
    const slotH = 1828800;
    const dev = aspectDeviation(692, 1584, slotW, slotH);
    expect(dev).toBeGreaterThan(0.15);
    const rect = coverSrcRect(692, 1584, slotW, slotH);
    expect(rect.t + rect.b).toBeGreaterThan(0);
  });
});

describe("五·3 内容闸金标", () => {
  it("P13：证据最大占比「常规 79.76%」须出现在 tips", () => {
    const ev =
      "袖型分布 常规 79.76% 落肩袖 8.2% 常规袖 1.50% 灯笼袖 1.1%";
    const miss = findMissingDominantAttrShare(
      "polo袖型偏好",
      ["落肩袖 8.2%", "常规袖 1.50%", "灯笼袖 1.1%", "插肩袖 0.8%"],
      ev,
    );
    expect(miss).toMatch(/常规 79\.76/);

    const ok = findMissingDominantAttrShare(
      "polo袖型偏好",
      ["常规 79.76%", "落肩袖 8.2%", "常规袖 1.50%"],
      ev,
    );
    expect(ok).toBeNull();
  });

  it("P9：店铺与万件须证据就近共现", () => {
    const ev =
      "罗蒙店铺 5.3万件\n郗思昙百货店 2.6万件\n啄木鳥旗舰店 1.4万件";
    expect(
      shopMetricMismatchInEvidence("郗思昙百货店 1.4万件", ev),
    ).toMatch(/张冠李戴|就近共现/);
    expect(
      shopMetricMismatchInEvidence("郗思昙百货店 2.6万件", ev),
    ).toBeNull();
    expect(
      shopMetricMismatchInEvidence("罗蒙店铺 5.3万件", ev),
    ).toBeNull();
  });
});
