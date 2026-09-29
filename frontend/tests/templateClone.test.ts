/**
 * A/B/C 档单元克隆金标：columns / image_grid / metric / list，N=3..9
 */
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import {
  applyATierClone,
  assertUniqueShapeIds,
  cloneDualZone,
  countCapSlots,
  countColTitleSlots,
  countVItem2Slots,
  countVItemSlots,
  findListUnitCluster,
  gridFor,
  resolveDualPageForClone,
  resolvePageForClone,
} from "@/components/DocUtil/templateClone";

const TPL = path.resolve(__dirname, "../public/pptTemplate-simple.pptx");

async function readSlide(page: number): Promise<string> {
  const buf = fs.readFileSync(TPL);
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file(`ppt/slides/slide${page}.xml`);
  if (!entry) throw new Error(`missing slide${page}`);
  return entry.async("string");
}

describe("gridFor", () => {
  test("参考映射", () => {
    expect(gridFor(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridFor(6)).toEqual({ cols: 3, rows: 2 });
    expect(gridFor(8)).toEqual({ cols: 4, rows: 2 });
    expect(gridFor(9)).toEqual({ cols: 3, rows: 3 });
  });
});

describe("resolvePageForClone", () => {
  test("columns 精确命中 / 母版克隆", () => {
    expect(resolvePageForClone("columns", 3)).toMatchObject({
      page: 32,
      needClone: false,
      nativeN: 3,
    });
    expect(resolvePageForClone("columns", 6)).toMatchObject({
      page: 34,
      needClone: true,
      nativeN: 5,
      targetN: 6,
    });
  });

  test("image_grid 母版 p49", () => {
    expect(resolvePageForClone("image_grid", 4)).toMatchObject({
      page: 49,
      needClone: false,
    });
    expect(resolvePageForClone("image_grid", 6)).toMatchObject({
      page: 49,
      needClone: true,
      nativeN: 4,
      targetN: 6,
    });
  });

  test("list skin0 母版 p17", () => {
    expect(resolvePageForClone("list", 5)).toMatchObject({
      page: 17,
      needClone: false,
      nativeN: 5,
    });
    expect(resolvePageForClone("list", 6)).toMatchObject({
      page: 17,
      needClone: true,
      nativeN: 5,
      targetN: 6,
    });
  });

  test("progress 精确命中 skin0；N>5 改用 skin1 p11 克隆", () => {
    expect(resolvePageForClone("progress", 5)).toMatchObject({
      page: 8,
      needClone: false,
      nativeN: 5,
    });
    expect(resolvePageForClone("progress", 6)).toMatchObject({
      page: 11,
      needClone: true,
      nativeN: 5,
      targetN: 6,
    });
  });
});

describe("clone columns A-tier", () => {
  test.each([3, 4, 5])("N=%i 精确命中无需克隆", async (N) => {
    const plan = resolvePageForClone("columns", N);
    expect(plan.needClone).toBe(false);
    const raw = await readSlide(plan.page);
    const { xml, unitCount } = applyATierClone(raw, plan);
    expect(unitCount).toBe(N);
    expect(countColTitleSlots(xml)).toBe(N);
    assertUniqueShapeIds(xml);
  });

  test.each([6, 7, 8, 9])("N=%i 从最大母版克隆", async (N) => {
    const plan = resolvePageForClone("columns", N);
    expect(plan.needClone).toBe(true);
    expect(plan.page).toBe(34);
    const raw = await readSlide(34);
    const { xml, unitCount } = applyATierClone(raw, plan);
    expect(unitCount).toBe(N);
    expect(countColTitleSlots(xml)).toBe(N);
    for (let k = 1; k <= N; k++) {
      expect(xml).toContain(`{col${k}Title}`);
    }
    expect(xml).not.toContain(`{col${N + 1}Title}`);
    assertUniqueShapeIds(xml);
    expect(xml).not.toMatch(/\{\s*\}/);

    // 平铺回归：顶层列组 x 须拉开（不能叠成 0.37in 罗汉）
    const { parseTopLevelNodes } = require("@/components/DocUtil/templateClone");
    const grps = parseTopLevelNodes(xml).filter((n: { tag: string }) => n.tag === "grpSp");
    const xs: number[] = [];
    const ws: number[] = [];
    for (const g of grps) {
      const xfrm = g.xml.match(/<p:grpSpPr>[\s\S]*?<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
      if (!xfrm) continue;
      const off = xfrm[1].match(/x="(\d+)"/);
      const ext = xfrm[1].match(/cx="(\d+)"/);
      if (off && ext) {
        xs.push(+off[1] / 914400);
        ws.push(+ext[1] / 914400);
      }
    }
    expect(xs.length).toBe(N);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(8);
    expect(Math.min(...ws)).toBeGreaterThan(1.05);

    // 子形状 slide 宽度不得超过组框（防「框窄心宽」）
    if (N === 6) {
      const first = grps[0].xml;
      const xfrm = first.match(/<p:grpSpPr>[\s\S]*?<a:xfrm>([\s\S]*?)<\/a:xfrm>/)!;
      const gExt = +xfrm[1].match(/<a:ext[^>]*cx="(\d+)"/)![1];
      const gCh = +xfrm[1].match(/<a:chExt[^>]*cx="(\d+)"/)![1];
      const childExt = +first.match(/<p:sp\b[\s\S]*?<a:ext[^>]*cx="(\d+)"/)![1];
      const slideChildW = childExt * (gExt / gCh);
      expect(slideChildW).toBeLessThanOrEqual(gExt * 1.02);
    }
  });
});

describe("clone image_grid A-tier", () => {
  test("N=4 无需克隆", async () => {
    const plan = resolvePageForClone("image_grid", 4);
    const raw = await readSlide(49);
    const { xml, unitCount } = applyATierClone(raw, plan);
    expect(unitCount).toBe(4);
    expect(countCapSlots(xml)).toBe(4);
  });

  test.each([6, 8, 9])("N=%i 从 p49 克隆", async (N) => {
    const plan = resolvePageForClone("image_grid", N);
    const raw = await readSlide(49);
    const { xml, unitCount, extraImageRIds } = applyATierClone(raw, plan);
    expect(unitCount).toBe(N);
    expect(countCapSlots(xml)).toBe(N);
    expect(extraImageRIds?.length).toBe(N - 1);
    assertUniqueShapeIds(xml);
    for (let k = 1; k <= N; k++) {
      expect(xml).toContain(`{cap${k}}`);
    }
    // 图高不应被压成扁条（原生 2.0in，克隆后至少 ~1.4in）
    const picHs = [
      ...xml.matchAll(/<p:pic\b[\s\S]*?<a:ext[^>]*\bcy="(\d+)"/g),
    ].map((x) => +x[1] / 914400);
    expect(picHs.length).toBe(N);
    expect(Math.min(...picHs)).toBeGreaterThan(1.35);
  });
});

describe("clone metric B-tier", () => {
  test("N=5 精确命中无需克隆", async () => {
    const plan = resolvePageForClone("metric", 5);
    expect(plan.needClone).toBe(false);
    expect(plan.page).toBe(30);
    const raw = await readSlide(30);
    const { unitCount } = applyATierClone(raw, plan);
    expect(unitCount).toBe(5);
  });

  test.each([6, 7, 8, 9])("N=%i 从 p30 克隆", async (N) => {
    const plan = resolvePageForClone("metric", N);
    expect(plan.needClone).toBe(true);
    expect(plan.page).toBe(30);
    const raw = await readSlide(30);
    const { xml, unitCount } = applyATierClone(raw, plan);
    expect(unitCount).toBe(N);
    expect(countVItemSlots(xml)).toBe(N);
    for (let k = 1; k <= N; k++) {
      expect(xml).toContain(`{vItem.item${k}}`);
    }
    assertUniqueShapeIds(xml);
  });
});

describe("clone list C-tier", () => {
  test("p17 组内可定位 5 行单元", async () => {
    const raw = await readSlide(17);
    const cluster = findListUnitCluster(raw);
    expect(cluster).not.toBeNull();
    expect(cluster!.units.length).toBe(5);
    expect(cluster!.axis).toBe("y");
    expect(cluster!.depth).toBeGreaterThan(0);
  });

  test("N=5 精确命中无需克隆", async () => {
    const plan = resolvePageForClone("list", 5);
    expect(plan.needClone).toBe(false);
    const raw = await readSlide(plan.page);
    const { unitCount } = applyATierClone(raw, plan);
    expect(unitCount).toBe(5);
  });

  test.each([6, 7, 8, 9])("N=%i 从 p17 组内克隆", async (N) => {
    const plan = resolvePageForClone("list", N);
    expect(plan.needClone).toBe(true);
    expect(plan.page).toBe(17);
    const raw = await readSlide(17);
    const { xml, unitCount } = applyATierClone(raw, plan);
    expect(unitCount).toBe(N);
    expect(countVItemSlots(xml)).toBe(N);
    for (let k = 1; k <= N; k++) {
      expect(xml).toContain(`{vItem.item${k}}`);
      expect(xml).toContain(`{vItem.item${k}_Desc}`);
    }
    assertUniqueShapeIds(xml);

    // 行 y 须拉开
    const after = findListUnitCluster(xml);
    expect(after!.units.length).toBe(N);
    const ys = after!.units.map((u) => u.box.y / 914400);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(2.5);
  });
});

describe("clone dual-zone metric_columns / metric_list", () => {
  test("metric_columns N卡=6 从 p39 克隆上区", async () => {
    const plan = resolveDualPageForClone("metric_columns", 6, 3);
    expect(plan.page).toBe(39);
    expect(plan.needMetricClone).toBe(true);
    expect(plan.needSecondaryClone).toBe(false);
    const raw = await readSlide(39);
    const { xml } = cloneDualZone(raw, plan);
    expect(countVItemSlots(xml)).toBe(6);
    expect(countColTitleSlots(xml)).toBe(3);
    assertUniqueShapeIds(xml);
  });

  test("metric_list 下区 lists=4 从 p44 克隆 vItem2", async () => {
    const plan = resolveDualPageForClone("metric_list", 5, 4);
    expect(plan.page).toBe(44);
    expect(plan.needMetricClone).toBe(false);
    expect(plan.needSecondaryClone).toBe(true);
    const raw = await readSlide(44);
    const { xml } = cloneDualZone(raw, plan);
    expect(countVItemSlots(xml)).toBe(5);
    expect(countVItem2Slots(xml)).toBe(4);
    assertUniqueShapeIds(xml);
    for (let k = 1; k <= 4; k++) {
      expect(xml).toContain(`{vItem2.item${k}}`);
    }
    // 克隆不得复制 p:tags，否则多形状共享同一 tags 部件，Office 拒开
    const tagRids = [...xml.matchAll(/<p:tags\b[^>]*\br:id="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(tagRids.length).toBe(new Set(tagRids).size);
    // 下区行 y 应单调递增且落在上排卡下方（勿被 metric unit 的横带带偏）
    const cluster = findListUnitCluster(xml, "vItem2");
    expect(cluster).toBeTruthy();
    const ys = cluster!.units.map((u) => u.box.y);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    }
    expect(Math.min(...ys)).toBeGreaterThan(2.5 * 914400);
  });

  test("metric_list 双区同时克隆 6卡+4行", async () => {
    const plan = resolveDualPageForClone("metric_list", 6, 4);
    expect(plan.needMetricClone).toBe(true);
    expect(plan.needSecondaryClone).toBe(true);
    const raw = await readSlide(plan.page);
    const { xml } = cloneDualZone(raw, plan);
    expect(countVItemSlots(xml)).toBe(6);
    expect(countVItem2Slots(xml)).toBe(4);
    assertUniqueShapeIds(xml);
  });
});

describe("clone progress C-tier (via skin1 A-like)", () => {
  test.each([6, 8, 9])("N=%i 从 p11 顶层卡克隆", async (N) => {
    const plan = resolvePageForClone("progress", N);
    expect(plan.needClone).toBe(true);
    expect(plan.page).toBe(11);
    const raw = await readSlide(11);
    const { xml, unitCount } = applyATierClone(raw, plan);
    expect(unitCount).toBe(N);
    expect(countVItemSlots(xml)).toBe(N);
    assertUniqueShapeIds(xml);
    const after = findListUnitCluster(xml);
    expect(after!.units.length).toBe(N);
    const xs = after!.units.map((u) => u.box.x / 914400);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(6);

    // 序号 01..0N 递增（不能全是 01）
    for (let k = 1; k <= N; k++) {
      const pad = String(k).padStart(2, "0");
      expect(xml).toContain(`<a:t>${pad}</a:t>`);
    }

    // 组变换 scaleX≈scaleY，圆标不被压扁
    const first = after!.units[0];
    const xfrm = first.node.xml.match(
      /<p:grpSpPr>[\s\S]*?<a:xfrm>([\s\S]*?)<\/a:xfrm>/,
    )!;
    const gCx = +xfrm[1].match(/<a:ext[^>]*cx="(\d+)"/)![1];
    const gCy = +xfrm[1].match(/<a:ext[^>]*cy="(\d+)"/)![1];
    const chCx = +xfrm[1].match(/<a:chExt[^>]*cx="(\d+)"/)![1];
    const chCy = +xfrm[1].match(/<a:chExt[^>]*cy="(\d+)"/)![1];
    const scaleX = gCx / chCx;
    const scaleY = gCy / chCy;
    expect(Math.abs(scaleX - scaleY)).toBeLessThan(0.02);
  });
});
