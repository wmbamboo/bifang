/**
 * 十九·5：结论章材料账本
 */
import {
  buildFactLedger,
  formatFactLedgerAppendix,
} from "../src/components/DocUtil/docFactLedger";
import {buildDocParagraphFormatPrompt} from "../src/components/DocUtil/ViewItem4Doc";

describe("十九·5 材料账本", () => {
  test("从前文章抽出指标与摘要，结论章不入账", () => {
    const chapters = [
      {
        title: "大盘",
        paragraphs: [
          {
            title: "销量",
            content: "男士衬衫销量达 403.7万，同比 18%。",
          },
        ],
      },
      {
        title: "主推与试单分层",
        paragraphs: [
          {
            title: "动作",
            content: "建议优先铺货（推演）。",
          },
        ],
      },
    ];
    const ledger = buildFactLedger(chapters);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].chapterTitle).toBe("大盘");
    expect(ledger[0].metrics.some((m) => /403/.test(m))).toBe(true);
    const appendix = formatFactLedgerAppendix(ledger);
    expect(appendix).toMatch(/前文事实账本/);
    expect(appendix).toMatch(/403/);
    expect(appendix).not.toMatch(/优先铺货/);
  });

  test("空账本 → 空串", () => {
    expect(formatFactLedgerAppendix([])).toBe("");
  });
});

describe("二十·3 开头句式", () => {
  test("format 契约含正向切入与视角介词禁令", () => {
    const s = buildDocParagraphFormatPrompt({min: 150, max: 150});
    expect(s).toMatch(/从……来看/);
    expect(s).toMatch(/首句必须直接切入/);
    expect(s).toMatch(/实体名、数据或判断/);
  });
});
