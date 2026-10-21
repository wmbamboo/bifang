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
  Slide,
  validateSlideViewItems,
  scrubPptItemText,
  pptItemLength,
  PPT_ITEM_DESC_MAX,
  buildPptItemFormatPrompt,
} from "@/components/DocUtil/ViewItem4Ppt";
import {
  coerceLayoutBySlideTitle,
  tipsSuggestMetricLayout,
} from "@/components/DocUtil/outlineJson";
import {
  assertImageGridSameSource,
} from "@/components/DocUtil/kbImageAssetsCore";
import {aspectDeviation, coverSrcRect} from "@/components/DocUtil/imageBufferMeta";
import {shopMetricMismatchInEvidence} from "@/components/DocUtil/outlineEvidenceValidate";
import { readFileSync } from "fs";
import * as path from "path";

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

describe("四十二 PPT 小项描述长度 / 引用剥离", () => {
  it("含 [文档13] 的超长描述剥离后 ≤70 ⇒ 校验通过且无 [文档", () => {
    // 裸长 74，去掉 [文档13]（6 字）后 68 ≤70
    const withCite = `${"甲".repeat(68)}[文档13]`;
    expect(withCite.length).toBeGreaterThan(PPT_ITEM_DESC_MAX);
    const scrubbed = scrubPptItemText(withCite);
    expect(scrubbed).not.toContain("[文档");
    expect(pptItemLength(withCite)).toBe(68);
    expect(pptItemLength(withCite)).toBeLessThanOrEqual(PPT_ITEM_DESC_MAX);

    expect(
      validateSlideViewItems([{ title: "增速超大盘", content: withCite }], "list"),
    ).toBeNull();
    const slide = new Slide(1, "增速超大盘", "");
    slide.layout = "list";
    // 结构化写入路径会 scrub；避免正则把超长正文拆坏
    expect(
      slide.setViewItemsStructured([{ title: "增速超大盘", content: withCite }]),
    ).toBe(true);
    expect(slide.viewItems?.[0]?.content || "").not.toContain("[文档");
    expect(pptItemLength(slide.viewItems?.[0]?.content || "")).toBeLessThanOrEqual(
      PPT_ITEM_DESC_MAX,
    );
  });

  it("剥离后仍 >70 ⇒ 报错数字是剥离后长度", () => {
    const long =
      "这是一段远超七十个汉字的具体描述内容用于验证剥离引用标记之后如果仍然超过上限则报错信息里的当前字数必须等于剥离后的长度而不是带标记的原始长度一二三四五六七八九十";
    const withCite = `${long}[文档13]`;
    const scrubbedLen = pptItemLength(withCite);
    expect(scrubbedLen).toBeGreaterThan(PPT_ITEM_DESC_MAX);
    expect(withCite.length).toBeGreaterThan(scrubbedLen);
    const err = validateSlideViewItems(
      [{ title: "测试标题够长", content: withCite }],
      "list",
    );
    expect(err || "").toContain(`当前 ${scrubbedLen} 字`);
    expect(err || "").not.toContain(`当前 ${withCite.length} 字`);
  });

  it("软限：去掉 maxLength 后 108 字不被硬截，超限可 AI 精简", () => {
    const pasted = "甲".repeat(108);
    expect(scrubPptItemText(pasted).length).toBe(108);
    const src = readFileSync(
      path.join(__dirname, "../src/components/DocUtil/SliderDrawer.tsx"),
      "utf-8",
    );
    expect(src).not.toMatch(/maxLength=\{dMax\}/);
    expect(src).not.toMatch(/maxLength=\{tMax\}/);
    expect(src).toContain("AI 精简至");
  });

  it("format prompt 禁止 [文档N]", () => {
    expect(buildPptItemFormatPrompt(3, "list")).toContain("不要用 [文档N]");
  });
});

describe("四十二·42.4 metricCue 扩到要点", () => {
  it("要点含 3 组数字+单位、页标题无关键词 ⇒ 判 metric", () => {
    const tips = [
      "质押 6.7亿股 占流通盘 12%",
      "另有 22.1亿股 待解禁",
      "本季新增 7.28亿股",
    ];
    expect(tipsSuggestMetricLayout(tips)).toBe(true);
    expect(
      coerceLayoutBySlideTitle("质押与解禁安排一览", "list", tips),
    ).toBe("metric");
  });

  it("要点纯叙述 ⇒ 仍判 list", () => {
    const tips = [
      "关注城市户外流行款式与穿搭公式",
      "保持多场景意识，适配商务与休闲",
      "分析 Clean Fit 需求与简约裁剪",
    ];
    expect(tipsSuggestMetricLayout(tips)).toBe(false);
    expect(
      coerceLayoutBySlideTitle("选品技巧与穿搭建议", "list", tips),
    ).toBe("list");
  });
});
