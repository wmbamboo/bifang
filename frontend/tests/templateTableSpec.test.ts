/**
 * 表格规格闸：manifest 多规格解析 + 填格变量（缺口治理 2026-09-26）
 * 页 42=5×4 / 44=6×4 / 45=6×5 / 46=8×5
 */
import {
  resolveTableGrid,
  resolveTemplatePage,
  getTemplateManifest,
} from "@/components/DocUtil/templateManifest";

// ViewItem4Ppt → OutlineStore → nanoid(ESM)，node 环境下需桩掉
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildTableFillVars } = require("@/components/DocUtil/ViewItem4Ppt") as typeof import("@/components/DocUtil/ViewItem4Ppt");

describe("template manifest table specs", () => {
  test("manifest 已登记 4 种表格规格、reserved 清空", () => {
    const m = getTemplateManifest();
    const tables = m.pages.filter((p) => p.layout === "table");
    expect(tables.map((p) => `${p.page}:${p.rows}x${p.cols}`)).toEqual([
      "42:5x4",
      "44:6x4",
      "45:6x5",
      "46:8x5",
    ]);
    expect(m.reserved || []).toEqual([]);
  });

  test("精确命中：5×4 / 6×4 / 6×5 / 8×5", () => {
    expect(resolveTableGrid(5, 4)).toMatchObject({ page: 42, rows: 5, cols: 4 });
    expect(resolveTableGrid(6, 4)).toMatchObject({ page: 44, rows: 6, cols: 4 });
    expect(resolveTableGrid(6, 5)).toMatchObject({ page: 45, rows: 6, cols: 5 });
    expect(resolveTableGrid(8, 5)).toMatchObject({ page: 46, rows: 8, cols: 5 });
  });

  test("最小够用：装不满的取最省规格，并回报真实规格", () => {
    // 5 行 5 列 → 6×5（比 8×5 省）
    expect(resolveTableGrid(5, 5)).toMatchObject({ page: 45, rows: 6, cols: 5 });
    // 7 行 4 列 → 只有 8×5 能装
    expect(resolveTableGrid(7, 4)).toMatchObject({ page: 46, rows: 8, cols: 5 });
    // 2 行 2 列 → 5×4
    expect(resolveTableGrid(2, 2)).toMatchObject({ page: 42, rows: 5, cols: 4 });
  });

  test("超限与缺省：夹到 8×5 / 默认 5×4", () => {
    expect(resolveTableGrid(12, 9)).toMatchObject({ page: 46, rows: 8, cols: 5 });
    expect(resolveTableGrid()).toMatchObject({ page: 42, rows: 5, cols: 4 });
    expect(resolveTableGrid(undefined, 3)).toMatchObject({ page: 42, rows: 5, cols: 4 });
  });

  test("resolveTemplatePage 与 resolveTableGrid 页码一致", () => {
    for (const [r, c] of [
      [5, 4],
      [6, 4],
      [6, 5],
      [8, 5],
      [7, 3],
    ]) {
      expect(resolveTemplatePage("table", r, c).page).toBe(
        resolveTableGrid(r, c).page,
      );
    }
  });
});

describe("buildTableFillVars 动态行列", () => {
  const header = "价格带|本期销量(占比)|销量同比|本期销售额(占比)";
  const rec = (i: number) =>
    `￥${i}0-${i}9|${i}00.5万(1${i}.3%)|+${i}.2%|3.${i}亿(1${i}.0%)`;

  test("4 列 5 行 → 页 42，20 格全覆盖", () => {
    const sub = [header, rec(1), rec(2), rec(3), rec(4)].join("\n");
    const { vars, rows, cols, page } = buildTableFillVars(sub, {});
    expect({ rows, cols, page }).toEqual({ rows: 5, cols: 4, page: 42 });
    expect(Object.keys(vars).filter((k) => k.startsWith("cell_"))).toHaveLength(20);
    expect(vars["cell_r0c0"]).toBe("价格带");
    expect(vars["cell_r1c1"]).toBe("100.5万(11.3%)");
    expect(vars["cell_r4c3"]).toBe("3.4亿(14.0%)");
    // 模板多出来的格子不会被留成 {cell_*}
    expect(vars["cell_r5c0"]).toBeUndefined();
  });

  test("5 列 6 行 → 页 45，30 格全覆盖", () => {
    const h5 = "排名|店铺|销量|销售额|同比";
    const r5 = (i: number) => `${i}|店铺${i}|${i}.2万件|${i}00万|+${i}0%`;
    const sub = [h5, r5(1), r5(2), r5(3), r5(4), r5(5)].join("\n");
    const { vars, rows, cols, page } = buildTableFillVars(sub, {});
    expect({ rows, cols, page }).toEqual({ rows: 6, cols: 5, page: 45 });
    expect(Object.keys(vars).filter((k) => k.startsWith("cell_"))).toHaveLength(30);
    expect(vars["cell_r5c4"]).toBe("+50%");
  });

  test("8 行 5 列 → 页 46；全角 ｜ 也认", () => {
    const h5 = "排名｜店铺｜销量｜销售额｜同比";
    const r5 = (i: number) => `${i}｜店铺${i}｜${i}.2万件｜${i}00万｜+${i}0%`;
    const sub = [h5, r5(1), r5(2), r5(3), r5(4), r5(5), r5(6), r5(7)].join("\n");
    const { vars, rows, cols, page } = buildTableFillVars(sub, {});
    expect({ rows, cols, page }).toEqual({ rows: 8, cols: 5, page: 46 });
    expect(Object.keys(vars).filter((k) => k.startsWith("cell_"))).toHaveLength(40);
    expect(vars["cell_r7c1"]).toBe("店铺7");
  });

  test("无竖线时可退回小项填格（默认 5×4）", () => {
    const vItem: Record<string, string> = {};
    for (let i = 1; i <= 8; i++) {
      vItem[`item${i}`] = `单元格${i}`;
    }
    const { vars, rows, cols, page } = buildTableFillVars("", vItem);
    expect({ rows, cols, page }).toEqual({ rows: 5, cols: 4, page: 42 });
    expect(vars["cell_r0c0"]).toBe("单元格1");
    expect(vars["cell_r1c3"]).toBe("单元格8");
  });

  test("表题与单格长度受控", () => {
    const long = "价格带｜" + "超长内容".repeat(10);
    const { vars } = buildTableFillVars(
      `tableTitle: 男装衬衫polo价格带成交对照总表\n${header}\n${long}`,
      {},
    );
    expect(vars["tableTitle"]).toBe("男装衬衫polo价格带成交对照总表");
    expect(String(vars["cell_r1c1"]).length).toBeLessThanOrEqual(30);
  });
});
