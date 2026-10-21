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
  simplePptSlidePrompt,
  slideHasStructuredPrompt,
  applyPptPromptSavePatch,
  buildDualLayerPptSavePatch,
  countOutlineTips,
  countPromptOutlineTipLines,
  pptLayoutLabelZh,
} from "@/components/DocUtil/ViewItem4Ppt";
import type {SlideLayout} from "@/components/DocUtil/ViewItem4Ppt";
import {layoutLabel} from "@/components/DocUtil/outlineSerialize";
import {LAYOUTS} from "@/components/DocUtil/outlineJson";
import {
  coerceLayoutBySlideTitle,
  tipsSuggestMetricLayout,
  tipsSuggestTableLayout,
} from "@/components/DocUtil/outlineJson";
import {
  assertImageGridSameSource,
} from "@/components/DocUtil/kbImageAssetsCore";
import {aspectDeviation, coverSrcRect} from "@/components/DocUtil/imageBufferMeta";
import {shopMetricMismatchInEvidence} from "@/components/DocUtil/outlineEvidenceValidate";
import { shortenPptItemDesc } from "@/components/DocUtil/pptItemShorten";
import axios from "axios";
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
    // 仅 2 条：不触发 tipsSuggestTableLayout（需 ≥3），仍够 tipMetricCue
    const tips = [
      "质押 6.7亿股 占流通盘 12%",
      "另有 22.1亿股 待解禁",
    ];
    expect(tipsSuggestTableLayout(tips)).toBe(false);
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

describe("四十六 PPT 超长治理 / table 双源", () => {
  it("反验：纯数字短语 tips 不抬 table，仍判 metric", () => {
    const tips = ["586亿", "42.3%", "1.2万"];
    expect(tipsSuggestTableLayout(tips)).toBe(false);
    expect(tipsSuggestMetricLayout(tips)).toBe(true);
    expect(
      coerceLayoutBySlideTitle("质押与解禁安排一览", "list", tips),
    ).toBe("metric");
  });

  it("标签+数值 ≥3 条 ⇒ 判 table", () => {
    const tips = ["欧莱雅 586亿", "雅诗兰黛 42.3%", "宝洁 1.2万"];
    expect(tipsSuggestTableLayout(tips)).toBe(true);
    // 标题避开「对照/路径」等会先抬 columns/progress 的词
    expect(
      coerceLayoutBySlideTitle("品牌规模一览", "list", tips),
    ).toBe("table");
  });

  it("含 [文档13] 的超长描述经 shorten 后 ≤70 且无 [文档", async () => {
    const long =
      "截至华润信托股份有限公司、深圳市钜盛华股份有限公司通过多层持股路径合计控制宝能相关主体股权比例约百分之十二点三并另有待解禁股份规模较大需持续跟踪质押与表决权安排细节说明补充一二三四五六七八九十[文档13]";
    expect(pptItemLength(long)).toBeGreaterThan(PPT_ITEM_DESC_MAX);
    expect(long).toContain("[文档13]");

    const compressed =
      "华润信托与钜盛华经多层路径持股约12.3%，另有待解禁股份需跟踪[文档13]";
    const post = jest.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [{ message: { content: compressed } }],
      },
    } as any);

    const out = await shortenPptItemDesc({
      item: { title: "持股路径概览", content: long },
      dMax: PPT_ITEM_DESC_MAX,
      url: "http://localhost/mock-chat",
      requireKbHits: false,
    });
    post.mockRestore();

    expect(out).toBeTruthy();
    expect(out || "").not.toContain("[文档");
    expect(pptItemLength(out || "")).toBeLessThanOrEqual(PPT_ITEM_DESC_MAX);
  });

  it("format prompt 含简称与 3 个以上数字约束", () => {
    const prompt = buildPptItemFormatPrompt(5, "list");
    expect(prompt).toContain("简称");
    expect(prompt).toContain("3 个以上数字");
  });
});

describe("四十七 PPT 写作大纲简单层", () => {
  it("simplePptSlidePrompt 含标题/版式/编号要点，不含契约词", () => {
    const slide = new Slide(1, "宝能系统持股路径", "list: 华润信托持股\nmetric: 12.3%");
    slide.layout = "list";
    slide.prompt =
      "【本页标题】\n宝能系统持股路径\n【大纲要点】\n（请优先采信）\n1) [要点] 华润信托持股\n【写作任务】\n禁止编造";
    const simple = simplePptSlidePrompt(slide);
    expect(simple).toContain("宝能系统持股路径");
    expect(simple).toContain(pptLayoutLabelZh("list"));
    expect(simple).toMatch(/1\)/);
    expect(simple).toContain("华润信托持股");
    expect(simple).not.toContain("请优先采信");
    expect(simple).not.toContain("禁止");
    expect(simple).not.toContain("【输出格式】");
    expect(simple).not.toContain("【本页标题】");
  });

  it("subTitle 为空 ⇒ 退化文案，不抛错、不回退整串 prompt", () => {
    const slide = new Slide(2, "空要点页", "");
    slide.layout = "metric";
    slide.prompt = "【本页标题】\n空要点页\n【写作任务】请优先采信材料禁止编造【输出格式】";
    const simple = simplePptSlidePrompt(slide);
    expect(simple).toContain("未解析到要点");
    expect(simple).toContain("完整提示词见编辑态");
    expect(simple).not.toContain("请优先采信");
    expect(simple).not.toContain("【输出格式】");
    expect(simple).not.toBe(slide.prompt);
  });

  it("一致性：改要点后 subTitle 条数与 prompt 要点段行数相等", () => {
    const slide = new Slide(3, "要点同步页", "list: 原要点甲\nlist: 原要点乙");
    slide.layout = "list";
    slide.prompt = [
      "【本页标题】",
      "要点同步页",
      "",
      "【大纲要点】",
      "（请优先采信其中的事实与数据，据此展开，勿编造冲突数字）",
      "1) [要点] 原要点甲",
      "2) [要点] 原要点乙",
      "",
      "【写作任务】",
      "写列表",
    ].join("\n");
    applyPptPromptSavePatch(slide, {
      subTitle: "list: 新要点一\nlist: 新要点二\nlist: 新要点三",
      prompt: slide.prompt,
    });
    expect(countOutlineTips(slide.subTitle)).toBe(3);
    expect(countPromptOutlineTipLines(slide.prompt)).toBe(3);
    expect(countOutlineTips(slide.subTitle)).toBe(
      countPromptOutlineTipLines(slide.prompt),
    );
  });

  it("slideHasStructuredPrompt 为 false 时编辑态走整串 TextArea 分支", () => {
    const slide = new Slide(4, "存量整串页", "");
    slide.prompt = "【本页标题】\n存量整串页\n【写作任务】随便写";
    expect(slideHasStructuredPrompt(slide)).toBe(false);
    // 无 jsdom：静态断言编辑态双分支 + 整串保存路径不抛
    const src = readFileSync(
      path.join(
        __dirname,
        "../src/components/DocUtil/EditablePromptCollapse4Ppt.tsx",
      ),
      "utf-8",
    );
    expect(src).toContain("slideHasStructuredPrompt");
    expect(src).toMatch(/const useDual = slideHasStructuredPrompt/);
    expect(src).toContain("提示词·简单层");
    expect(() => {
      applyPptPromptSavePatch(slide, "仅整串编辑后的新 prompt");
    }).not.toThrow();
    expect(slide.prompt).toBe("仅整串编辑后的新 prompt");
    expect(slide.subTitle).toBe("");
  });
});

describe("四十八 版式名统一 / 高级手改不覆盖", () => {
  it("只改高级 prompt 要点段、不动简单层 ⇒ 手改保留", () => {
    const slide = new Slide(5, "高级手改页", "list: 原要点甲\nlist: 原要点乙");
    slide.layout = "list";
    const origPrompt = [
      "【本页标题】",
      "高级手改页",
      "",
      "【大纲要点】",
      "（请优先采信其中的事实与数据，据此展开，勿编造冲突数字）",
      "1) [要点] 原要点甲",
      "2) [要点] 原要点乙",
      "",
      "【写作任务】",
      "写列表",
    ].join("\n");
    slide.prompt = origPrompt;
    const handEdited = origPrompt.replace("原要点甲", "高级手改后的要点甲");
    const {patch, infoMsg} = buildDualLayerPptSavePatch(
      slide,
      {
        layout: "list",
        tips: [
          {role: "list", text: "原要点甲"},
          {role: "list", text: "原要点乙"},
        ],
        prompt: handEdited,
      },
      false, // 简单层未 dirty
    );
    expect(patch.subTitle).toBeUndefined();
    expect(patch.syncTipsIntoPrompt).toBe(false);
    expect(infoMsg || "").toMatch(/高级/);
    applyPptPromptSavePatch(slide, patch);
    expect(slide.prompt).toContain("高级手改后的要点甲");
    expect(slide.prompt).not.toContain("1) [要点] 原要点甲");
  });

  it("只改简单层要点 ⇒ 保存后 prompt 要点段同步", () => {
    const slide = new Slide(6, "简单层改要点", "list: 旧甲\nlist: 旧乙");
    slide.layout = "list";
    slide.prompt = [
      "【本页标题】",
      "简单层改要点",
      "",
      "【大纲要点】",
      "（请优先采信其中的事实与数据，据此展开，勿编造冲突数字）",
      "1) [要点] 旧甲",
      "2) [要点] 旧乙",
      "",
      "【写作任务】",
      "写列表",
    ].join("\n");
    const {patch} = buildDualLayerPptSavePatch(
      slide,
      {
        layout: "list",
        tips: [
          {role: "list", text: "新甲"},
          {role: "list", text: "新乙"},
          {role: "list", text: "新丙"},
        ],
        prompt: slide.prompt, // 高级未改
      },
      true,
    );
    expect(patch.subTitle).toBeTruthy();
    expect(patch.syncTipsIntoPrompt).toBe(true);
    applyPptPromptSavePatch(slide, patch);
    expect(countOutlineTips(slide.subTitle)).toBe(3);
    expect(countPromptOutlineTipLines(slide.prompt)).toBe(3);
    expect(slide.prompt).toContain("新甲");
    expect(slide.prompt).toContain("新丙");
    expect(slide.prompt).not.toContain("旧甲");
  });

  it("pptLayoutLabelZh 与 layoutLabel 对全部 layout 全等", () => {
    const all = [...LAYOUTS] as SlideLayout[];
    expect(all.length).toBe(8);
    for (const lay of all) {
      expect(pptLayoutLabelZh(lay)).toBe(layoutLabel(lay));
    }
    expect(pptLayoutLabelZh("progress")).toBe("进度");
    expect(layoutLabel("progress")).toBe("进度");
  });
});
