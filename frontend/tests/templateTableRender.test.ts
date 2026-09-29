/**
 * 端到端灌模校验（模板缺口治理）：
 * 用真实 PptTemplate 读改后的 pptTemplate-simple.pptx，
 * 按数据行列灌 6×5 / 8×5 表格页，断言「模板槽 ↔ 填格变量」完全对齐、无残留 {slot}。
 */
import path from "path";

jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PptTemplate = require("@/components/DocUtil/PptTemplate").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildTableFillVars } = require("@/components/DocUtil/ViewItem4Ppt");

const TPL = path.resolve(__dirname, "../public/pptTemplate-simple.pptx");

/** 灌模产出把中文写成数字字符引用（&#x5e97;），断言前先解码 */
function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function pipeSub(header: string, rows: string[]): string {
  return [header, ...rows].join("\n");
}

async function fill(page: number, sub: string) {
  const t = new PptTemplate("localFile", TPL, path.resolve(__dirname, "./_tmp_out.pptx"));
  // 注意：PptTemplate 构造函数里 templateBuffer=Buffer.alloc(0)（空 Buffer 为真值），
  // `if(!this.templateBuffer) init()` 不会触发，必须像页面一样显式 init。
  await t.init();
  const { vars, rows, cols, page: resolved } = buildTableFillVars(sub, {});
  await t.genNewSlideFileDict_Random("table", vars, page, rows, cols);
  const dicts = (t as { newSlideFileDicts: Array<{ fileContent: string }> })
    .newSlideFileDicts;
  return {
    t,
    rows,
    cols,
    resolved,
    content: dicts[dicts.length - 1].fileContent,
  };
}

describe("灌模：新表格规格端到端", () => {
  test("6 行 5 列榜单 → 取页 47，槽位全填、无残留", async () => {
    const rows = Array.from(
      { length: 5 },
      (_, i) => `${i + 1}|店铺${i + 1}|${i + 1}.2万件|${1200 + i * 100}万|+${10 + i * 2}%`,
    );
    const { t, rows: R, cols: C, content } = await fill(
      28,
      pipeSub("排名|店铺|销量|销售额|同比", rows),
    );
    expect([R, C]).toEqual([6, 5]);
    expect((t as { usedSlidePages: number[] }).usedSlidePages).toContain(47);
    // 无任何残留占位符（含未提供的 slideTitle）
    expect(content).not.toMatch(/\{[A-Za-z_][\w.]*(?:\[[\w.]+\])?\}/);
    expect(content).not.toMatch(/\{[{}]/);
    // 单元格内容落位（解码实体后断言）
    const text = decodeXml(content);
    expect(text).toContain("店铺1");
    expect(text).toContain("+18%");
    expect(text).toContain("排名");
    expect(text).not.toContain("cell_r");
  });

  test("8 行 5 列长榜单 → 取页 48", async () => {
    const rows = Array.from(
      { length: 7 },
      (_, i) => `${i + 1}|店铺${i + 1}|${i + 1}.2万件|${1200 + i * 100}万|+${10 + i * 2}%`,
    );
    const { t, rows: R, cols: C, content } = await fill(
      28,
      pipeSub("排名|店铺|销量|销售额|同比", rows),
    );
    expect([R, C]).toEqual([8, 5]);
    expect((t as { usedSlidePages: number[] }).usedSlidePages).toContain(48);
    expect(content).not.toMatch(/\{[A-Za-z_][\w.]*(?:\[[\w.]+\])?\}/);
    expect(decodeXml(content)).toContain("店铺7");
  });

  test("6 行 4 列 → 取页 46，且不误用 5 列页", async () => {
    const rows = Array.from(
      { length: 5 },
      (_, i) => `￥${i}0-${i}9|${i}00.5万(1${i}.3%)|+${i}.2%|3.${i}亿(1${i}.0%)`,
    );
    const { t, rows: R, cols: C, content } = await fill(
      28,
      pipeSub("价格带|本期销量(占比)|销量同比|本期销售额(占比)", rows),
    );
    expect([R, C]).toEqual([6, 4]);
    expect((t as { usedSlidePages: number[] }).usedSlidePages).toContain(46);
    expect(content).not.toMatch(/\{[A-Za-z_][\w.]*(?:\[[\w.]+\])?\}/);
    // 4 列页不应出现第 5 列槽
    expect(content).not.toContain("cell_r0c4");
  });

  test("5 行 4 列 → 页 45（回归）", async () => {
    const rows = Array.from(
      { length: 4 },
      (_, i) => `￥${i}0-${i}9|${i}00.5万(1${i}.3%)|+${i}.2%|3.${i}亿(1${i}.0%)`,
    );
    const { t, rows: R, cols: C } = await fill(
      28,
      pipeSub("价格带|本期销量(占比)|销量同比|本期销售额(占比)", rows),
    );
    expect([R, C]).toEqual([5, 4]);
    expect((t as { usedSlidePages: number[] }).usedSlidePages).toContain(45);
  });
});
