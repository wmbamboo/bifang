/**
 * 模板单元运行时克隆（第六章 A/B/C 档）。
 *
 * 必踩坑（见交接六·3）：
 * 1) 占位符重编号会串：item1→item2 与 item2→item3 连锁污染，且 item1 是 item10 前缀。
 *    做法：先改成 __SLOT_K__ 中间名再落最终名。
 * 2) <p:grpSp> 内 <a:off> 是子坐标系；A 档只克隆整个顶层 grpSp，只改顶层 off 即可。
 *    C 档组内克隆时子节点 off 已是父 ch 坐标，只改子节点自身 xfrm，勿二次换算。
 * 3) <a:spAutoFit/>：克隆后 off/ext 须与内容量匹配，否则 PPT 打开会重排。
 * 4) 缩组框只改 a:ext、保留 chOff/chExt，否则 child×(ext/chExt) 不变 →「框窄心宽」。
 */

import {
  getTemplateManifest,
  type ManifestPage,
  type ManifestUnit,
} from "@/components/DocUtil/templateManifest";

const EMU_PER_IN = 914400;

export type CloneAxis = "x" | "y" | "grid";

export type ClonePlan = {
  page: number;
  nativeN: number;
  targetN: number;
  needClone: boolean;
  unit?: ManifestUnit;
  unitKind?: string;
  layout: string;
};

/** 网格列数：4→2×2、6→3×2、8→4×2、9→3×3 */
export function gridFor(n: number): { cols: number; rows: number } {
  const N = Math.max(1, Math.round(n));
  if (N <= 1) return { cols: 1, rows: 1 };
  if (N === 2) return { cols: 2, rows: 1 };
  if (N === 3) return { cols: 3, rows: 1 };
  if (N === 4) return { cols: 2, rows: 2 };
  if (N <= 6) return { cols: 3, rows: 2 };
  if (N <= 8) return { cols: 4, rows: 2 };
  return { cols: 3, rows: 3 };
}

function inchesToEmu(v: number): number {
  return Math.round(v * EMU_PER_IN);
}

function emuToIn(v: number): number {
  return v / EMU_PER_IN;
}

/**
 * 精确命中 (layout, skin, N)；否则取同 skin 最大 N 页作母版。
 * progress 需克隆时优先 skin1（顶层卡，无路径装饰缠绕）；skin0 路径型仅精确命中。
 * N>8 时仍返回最大母版，由调用方决定降级。
 */
export function resolvePageForClone(
  layout: string,
  targetN: number,
  skin = 0,
): ClonePlan {
  const pages = (getTemplateManifest().pages || []).filter(
    (p) => p.layout === layout,
  );
  const N = Math.max(1, Math.round(targetN || 1));

  const buildFromPool = (pool: ManifestPage[], sk: number): ClonePlan | null => {
    if (!pool.length) return null;
    const countOf = (p: ManifestPage) => p.cards || p.cols || p.lists || 0;
    const exact = pool.find((p) => countOf(p) === N);
    if (exact) {
      return {
        page: exact.page,
        nativeN: countOf(exact),
        targetN: N,
        needClone: false,
        unit: exact.unit,
        unitKind: exact.unitKind,
        layout,
      };
    }
    const master = pool.slice().sort((a, b) => countOf(b) - countOf(a))[0];
    if (!master) return null;
    return {
      page: master.page,
      nativeN: countOf(master),
      targetN: N,
      needClone: N !== countOf(master) && N >= 1,
      unit: master.unit,
      unitKind: master.unitKind,
      layout,
    };
  };

  // progress：精确命中任意 skin；需克隆时改用 skin1（p9–11 顶层卡）
  if (layout === "progress") {
    const allExact = pages.find(
      (p) => (p.cards || p.cols || p.lists || 0) === N,
    );
    if (allExact && (allExact.skin || 0) === skin) {
      const hit = buildFromPool(
        pages.filter((p) => (p.skin || 0) === skin),
        skin,
      );
      if (hit && !hit.needClone) return hit;
    }
    if (allExact && skin === 0) {
      // 默认 skin0：精确命中优先（p6/7/8）
      const s0 = buildFromPool(
        pages.filter((p) => (p.skin || 0) === 0),
        0,
      );
      if (s0 && !s0.needClone) return s0;
    }
    // 需克隆或指定 skin：优先 skin1
    const cloneSkin = N > 5 || skin === 1 ? 1 : skin;
    const pool = pages.filter((p) => (p.skin || 0) === cloneSkin);
    const plan =
      buildFromPool(pool, cloneSkin) ||
      buildFromPool(
        pages.filter((p) => (p.skin || 0) === 1),
        1,
      ) ||
      buildFromPool(pages, 0);
    if (plan) return plan;
  }

  const skinPages = pages.filter((p) => (p.skin || 0) === skin);
  const pool = skinPages.length ? skinPages : pages;
  const plan = buildFromPool(pool, skin);
  if (plan) return plan;
  return {
    page: 0,
    nativeN: 0,
    targetN: N,
    needClone: false,
    layout,
  };
}

type TopNode = {
  start: number;
  end: number;
  tag: string;
  xml: string;
};

/** 解析 spTree 下顶层 sp/pic/grpSp/cxnSp */
export function parseTopLevelNodes(slideXml: string): TopNode[] {
  const treeMatch = slideXml.match(/<p:spTree\b[^>]*>([\s\S]*)<\/p:spTree>/);
  if (!treeMatch || treeMatch.index == null) return [];
  const inner = treeMatch[1];
  const innerStart = treeMatch.index + treeMatch[0].indexOf(inner);
  const nodes: TopNode[] = [];
  let i = 0;
  while (i < inner.length) {
    const m = inner.slice(i).match(/<p:(grpSp|sp|pic|cxnSp)\b/);
    if (!m || m.index == null) break;
    const abs = i + m.index;
    const tag = m[1];
    let j = abs;
    let depth = 0;
    let end: number | null = null;
    while (j < inner.length) {
      const m2 = inner.slice(j).match(/<\/?p:(grpSp|sp|pic|cxnSp)\b[^>]*\/?>/);
      if (!m2 || m2.index == null) break;
      const tok = m2[0];
      const at = j + m2.index;
      if (tok.startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          end = at + tok.length;
          break;
        }
      } else if (tok.endsWith("/>")) {
        if (depth === 0) {
          end = at + tok.length;
          break;
        }
      } else {
        depth += 1;
      }
      j = at + tok.length;
    }
    if (end == null) break;
    nodes.push({
      start: innerStart + abs,
      end: innerStart + end,
      tag,
      xml: inner.slice(abs, end),
    });
    i = end;
  }
  return nodes;
}

function nodeText(xml: string): string {
  return (xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("");
}

function readGrpXfrm(grpXml: string): {
  x: number;
  y: number;
  cx: number;
  cy: number;
  chOffX: number;
  chOffY: number;
  chExtCx: number;
  chExtCy: number;
} | null {
  const m = grpXml.match(/<p:grpSpPr>[\s\S]*?<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
  if (!m) return null;
  const frag = m[1];
  const off = frag.match(/<a:off\b[^>]*\bx="(\d+)"[^>]*\by="(\d+)"/);
  const ext = frag.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  const chOff = frag.match(/<a:chOff\b[^>]*\bx="(\d+)"[^>]*\by="(\d+)"/);
  const chExt = frag.match(/<a:chExt\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  if (!off || !ext || !chOff || !chExt) return null;
  return {
    x: +off[1],
    y: +off[2],
    cx: +ext[1],
    cy: +ext[2],
    chOffX: +chOff[1],
    chOffY: +chOff[2],
    chExtCx: +chExt[1],
    chExtCy: +chExt[2],
  };
}

/** 只改 grpSpPr 内 xfrm（勿碰子形状 a:off，否则会把标题框当初组框） */
function setGrpXfrm(
  grpXml: string,
  opts: {
    x: number;
    y: number;
    cx: number;
    cy: number;
    chExtCx: number;
    chExtCy: number;
  },
): string {
  return grpXml.replace(
    /(<p:grpSpPr>[\s\S]*?<a:xfrm>)([\s\S]*?)(<\/a:xfrm>)/,
    (_m, pre: string, _body: string, post: string) => {
      const xfrm = readGrpXfrm(
        `<p:grpSpPr><a:xfrm>${_body}</a:xfrm></p:grpSpPr>`,
      );
      const chOffX = xfrm?.chOffX ?? opts.x;
      const chOffY = xfrm?.chOffY ?? opts.y;
      return (
        `${pre}` +
        `<a:off x="${opts.x}" y="${opts.y}"/>` +
        `<a:ext cx="${opts.cx}" cy="${opts.cy}"/>` +
        `<a:chOff x="${chOffX}" y="${chOffY}"/>` +
        `<a:chExt cx="${opts.chExtCx}" cy="${opts.chExtCy}"/>` +
        `${post}`
      );
    },
  );
}

function setTopOff(xml: string, xEmu: number, yEmu: number): string {
  // pic/sp：只改第一个 a:off（顶层 xfrm）
  return xml.replace(
    /<a:off\b([^>]*)\bx="\d+"([^>]*)\by="\d+"([^>]*)\/>/,
    `<a:off$1x="${xEmu}"$2y="${yEmu}"$3/>`,
  );
}

function setTopExt(xml: string, cxEmu: number, cyEmu: number): string {
  return xml.replace(
    /<a:ext\b([^>]*)\bcx="\d+"([^>]*)\bcy="\d+"([^>]*)\/>/,
    `<a:ext$1cx="${cxEmu}"$2cy="${cyEmu}"$3/>`,
  );
}

function readTopOffExt(xml: string): {
  x: number;
  y: number;
  cx: number;
  cy: number;
} | null {
  const off = xml.match(/<a:off\b[^>]*\bx="(\d+)"[^>]*\by="(\d+)"/);
  const ext = xml.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  if (!off || !ext) return null;
  return {
    x: +off[1],
    y: +off[2],
    cx: +ext[1],
    cy: +ext[2],
  };
}

/**
 * 抬升 cNvPr id，并剥掉 p:custDataLst（含 p:tags）。
 * 克隆若保留原型的 tags r:id，多形状会共享同一 tags 部件，Office 直接拒开。
 */
function uniquifyIds(xml: string, nextId: { v: number }): string {
  const withoutTags = xml.replace(
    /<p:custDataLst>[\s\S]*?<\/p:custDataLst>/g,
    "",
  );
  return withoutTags.replace(/<p:cNvPr\b([^>]*)\bid="(\d+)"/g, (_m, pre) => {
    const id = nextId.v++;
    return `<p:cNvPr${pre}id="${id}"`;
  });
}

/**
 * 占位符安全重编号：col1* → colK* 或 vItem.item1 → itemK、cap1→capK。
 * 先写入中间名再落最终名，避免前缀/连锁污染。
 */
export function renumberPlaceholders(
  xml: string,
  kind: "col" | "vItem" | "cap" | "vItem2",
  fromIndex: number,
  toIndex: number,
): string {
  if (fromIndex === toIndex) return xml;
  const mid = `__CLONE_${kind}_${toIndex}__`;
  let out = xml;
  if (kind === "col") {
    // col1Title / col1Sub / col1.itemM / {col1.itemM_Desc?}
    const re = new RegExp(
      `\\{col${fromIndex}(Title|Sub|\\.item\\d+(?:_Desc)?)\\}`,
      "g",
    );
    out = out.replace(re, (_m, rest: string) => `{${mid}${rest}}`);
    out = out.replace(new RegExp(`\\{${mid}`, "g"), `{col${toIndex}`);
  } else if (kind === "cap") {
    out = out.replace(
      new RegExp(`\\{cap${fromIndex}\\}`, "g"),
      `{${mid}}`,
    );
    out = out.replace(new RegExp(`\\{${mid}\\}`, "g"), `{cap${toIndex}}`);
  } else if (kind === "vItem" || kind === "vItem2") {
    const prefix = kind === "vItem" ? "vItem.item" : "vItem2.item";
    out = out.replace(
      new RegExp(`\\{${prefix}${fromIndex}(_Desc)?\\}`, "g"),
      (_m, desc: string | undefined) => `{${mid}${desc || ""}}`,
    );
    out = out.replace(
      new RegExp(`\\{${mid}(_Desc)?\\}`, "g"),
      (_m, desc: string | undefined) =>
        `{${prefix}${toIndex}${desc || ""}}`,
    );
  }
  return out;
}

function maxCnvPrId(slideXml: string): number {
  const ids = [...slideXml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(
    (m) => +m[1],
  );
  return ids.length ? Math.max(...ids) : 1;
}

function fontLadderOffset(unit: ManifestUnit | undefined, n: number): number {
  const ladder = unit?.fontLadder || {};
  const keys = Object.keys(ladder)
    .map(Number)
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b);
  let off = 0;
  for (const k of keys) {
    if (n >= k) off = ladder[String(k)] ?? 0;
  }
  return off;
}

function applyFontLadder(xml: string, deltaPt: number): string {
  if (!deltaPt) return xml;
  const deltaHundredths = Math.round(deltaPt * 100);
  const bump = (sz: string) => {
    const v = parseInt(sz, 10);
    if (!Number.isFinite(v)) return sz;
    return String(Math.max(800, v + deltaHundredths)); // ≥8pt
  };
  return xml
    .replace(/(<(?:a:rPr|a:defRPr|a:endParaRPr)\b[^>]*\bsz=")(\d+)(")/g, (_m, a, sz, b) => {
      return `${a}${bump(sz)}${b}`;
    });
}

export type CloneResult = {
  xml: string;
  unitCount: number;
  /** image_grid 克隆后新增的占位图 rId（调用方写入 rels） */
  extraImageRIds?: string[];
};

function assertNoOverlap(
  boxes: Array<{ x: number; y: number; w: number; h: number }>,
  tolEmu = inchesToEmu(0.02),
): void {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > tolEmu && oy > tolEmu) {
        throw new Error(
          `templateClone overlap units ${i + 1} & ${j + 1} ox=${ox} oy=${oy}`,
        );
      }
    }
  }
}

/** A 档：columns — 每列一个顶层 grpSp */
export function cloneColumnsTopLevel(
  slideXml: string,
  targetN: number,
  unit?: ManifestUnit,
): CloneResult {
  const nodes = parseTopLevelNodes(slideXml);
  const colNodes: Array<{ k: number; node: TopNode; xfrm: NonNullable<ReturnType<typeof readGrpXfrm>> }> = [];
  for (const node of nodes) {
    if (node.tag !== "grpSp") continue;
    const m = nodeText(node.xml).match(/\{col(\d+)Title\}/);
    if (!m) continue;
    const xfrm = readGrpXfrm(node.xml);
    if (!xfrm) continue;
    colNodes.push({ k: +m[1], node, xfrm });
  }
  colNodes.sort((a, b) => a.k - b.k);
  if (!colNodes.length) {
    throw new Error("cloneColumnsTopLevel: no column grpSp found");
  }
  const proto = colNodes[0];
  const nativeN = colNodes.length;
  if (targetN === nativeN) {
    return { xml: slideXml, unitCount: nativeN };
  }
  if (targetN < 2 || targetN > 9) {
    throw new Error(`cloneColumnsTopLevel: N=${targetN} out of 2..9`);
  }

  // 内容带必须用「整列 grpSp」包络；manifest.unit.band 若只量到标题框会窄到 ~2in，导致叠罗汉
  const envX = Math.min(...colNodes.map((c) => c.xfrm.x));
  const envY = Math.min(...colNodes.map((c) => c.xfrm.y));
  const envRight = Math.max(...colNodes.map((c) => c.xfrm.x + c.xfrm.cx));
  const envBottom = Math.max(...colNodes.map((c) => c.xfrm.y + c.xfrm.cy));
  let bandX = envX;
  let bandY = envY;
  let bandW = envRight - envX;
  let bandH = envBottom - envY;
  if (unit?.band && unit.band.length === 4) {
    const ubW = inchesToEmu(unit.band[2]);
    // 仅当 manifest band 不窄于包络的 80% 才采信（防标题框误当 band）
    if (ubW >= bandW * 0.8) {
      bandX = inchesToEmu(unit.band[0]);
      bandY = inchesToEmu(unit.band[1]);
      bandW = ubW;
      bandH = inchesToEmu(unit.band[3]);
    }
  }

  const pitch = Math.floor(bandW / targetN);
  // 缝只留阴影呼吸位；列宽尽量吃满 pitch，便于多装字
  // （ext-only 缩放已修好「框窄心宽」，不必再靠大缝防叠）
  const minGap = inchesToEmu(0.12);
  const gap = Math.max(minGap, Math.floor(pitch * 0.06));
  const unitW = Math.min(proto.xfrm.cx, Math.max(inchesToEmu(1.2), pitch - gap));
  const unitH = proto.xfrm.cy;
  // 关键：只缩 a:ext，保持 chOff/chExt 不变。
  // 若 ext 与 chExt 同比例缩放，子形状 slide 宽度 = child×(ext/chExt) 不变，会「框窄心宽」叠在一起。
  const unitChExtCx = proto.xfrm.chExtCx;
  const unitChExtCy = proto.xfrm.chExtCy;
  const fontDelta = fontLadderOffset(unit, targetN);
  const nextId = { v: maxCnvPrId(slideXml) + 1 };

  const clones: string[] = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let k = 1; k <= targetN; k++) {
    let xml = proto.node.xml;
    xml = renumberPlaceholders(xml, "col", proto.k, k);
    xml = uniquifyIds(xml, nextId);
    xml = applyFontLadder(xml, fontDelta);
    const x = bandX + (k - 1) * pitch + Math.floor((pitch - unitW) / 2);
    const y = bandY;
    xml = setGrpXfrm(xml, {
      x,
      y,
      cx: unitW,
      cy: unitH,
      chExtCx: unitChExtCx,
      chExtCy: unitChExtCy,
    });
    clones.push(xml);
    boxes.push({ x, y, w: unitW, h: unitH });
  }
  assertNoOverlap(boxes);

  let out = slideXml;
  const remove = colNodes
    .map((c) => c.node)
    .sort((a, b) => b.start - a.start);
  const insertAt = colNodes[0].node.start;
  for (const n of remove) {
    out = out.slice(0, n.start) + out.slice(n.end);
  }
  out = out.slice(0, insertAt) + clones.join("") + out.slice(insertAt);

  for (let k = 1; k <= targetN; k++) {
    if (!out.includes(`{col${k}Title}`)) {
      throw new Error(`cloneColumnsTopLevel: missing col${k}Title after clone`);
    }
  }
  if (out.includes("{col" + (targetN + 1) + "Title}")) {
    throw new Error("cloneColumnsTopLevel: leftover higher col index");
  }
  return { xml: out, unitCount: targetN };
}

/** A 档：image_grid — pic + cap 成对顶层节点 */
export function cloneImageGridPairs(
  slideXml: string,
  targetN: number,
  unit?: ManifestUnit,
): CloneResult {
  const nodes = parseTopLevelNodes(slideXml);
  const caps: Array<{ k: number; node: TopNode }> = [];
  const pics: TopNode[] = [];
  for (const node of nodes) {
    if (node.tag === "sp") {
      const m = nodeText(node.xml).match(/\{cap(\d+)\}/);
      if (m) caps.push({ k: +m[1], node });
    } else if (node.tag === "pic") {
      pics.push(node);
    }
  }
  caps.sort((a, b) => a.k - b.k);
  // pic 按位置排序（先 y 后 x），与 cap 序号对齐
  const picsSorted = pics
    .map((node) => ({ node, box: readTopOffExt(node.xml)! }))
    .filter((p) => p.box)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .map((p) => p.node);

  if (caps.length < 1 || picsSorted.length < 1) {
    throw new Error("cloneImageGridPairs: need pic+cap");
  }
  const nativeN = Math.min(caps.length, picsSorted.length);
  if (targetN === nativeN) {
    return { xml: slideXml, unitCount: nativeN };
  }
  if (targetN < 2 || targetN > 9) {
    throw new Error(`cloneImageGridPairs: N=${targetN} out of 2..9`);
  }

  const protoPic = picsSorted[0];
  const protoCap = caps[0];
  const picBox = readTopOffExt(protoPic.xml)!;
  const capBox = readTopOffExt(protoCap.node.xml)!;
  const gap = capBox.y - (picBox.y + picBox.cy); // 通常 ~0.04in

  const { cols, rows } = gridFor(targetN);
  // 内容带：必须含 pic 顶边；manifest 若从 cap 起算会把上半截掉 → 图被压成扁条
  const allPic = picsSorted.map((n) => readTopOffExt(n.xml)!);
  const allCap = caps.map((c) => readTopOffExt(c.node.xml)!);
  let bandX = Math.min(...allPic.map((b) => b.x));
  let bandY = Math.min(...allPic.map((b) => b.y));
  let bandW =
    Math.max(
      ...allPic.map((b) => b.x + b.cx),
      ...allCap.map((b) => b.x + b.cx),
    ) - bandX;
  let bandH = Math.max(...allCap.map((b) => b.y + b.cy)) - bandY;

  if (unit?.band && unit.band.length === 4) {
    const ubY = inchesToEmu(unit.band[1]);
    const ubH = inchesToEmu(unit.band[3]);
    // 采信条件：起点不低于 pic 顶，且高度不矮于包络的 85%
    if (ubY <= bandY + inchesToEmu(0.15) && ubH >= bandH * 0.85) {
      bandX = inchesToEmu(unit.band[0]);
      bandY = ubY;
      bandW = inchesToEmu(unit.band[2]);
      bandH = ubH;
    }
  }

  // 行数增多时向下扩展内容带（标题下 ~1.2in 到版心底 ~6.9in）
  const slideContentBottom = inchesToEmu(6.9);
  const needH = Math.max(bandH, Math.round(rows * (picBox.cy + Math.max(0, gap) + capBox.cy + inchesToEmu(0.12))));
  if (bandY + needH > bandY + bandH) {
    bandH = Math.min(needH, slideContentBottom - bandY);
  }

  const cellW = Math.floor(bandW / cols);
  const cellH = Math.floor(bandH / rows);
  const padX = inchesToEmu(0.06);
  const padY = inchesToEmu(0.05);
  const usableW = Math.max(inchesToEmu(0.8), cellW - padX * 2);
  const usableH = Math.max(inchesToEmu(1.2), cellH - padY * 2);

  const gapEmu = Math.max(0, Math.min(gap, inchesToEmu(0.08)));
  const capH = Math.min(capBox.cy, Math.floor(usableH * 0.18));
  // 优先保持原生图宽高比（约 5.6×2.0），再在 cell 内居中
  const nativeAspect = picBox.cx / Math.max(1, picBox.cy);
  let picH = Math.min(picBox.cy, usableH - gapEmu - capH);
  let picW = Math.min(usableW, Math.round(picH * nativeAspect));
  if (picW > usableW) {
    picW = usableW;
    picH = Math.round(picW / nativeAspect);
  }
  // 高度仍偏矮则尽量吃满 usableH
  const maxPicH = usableH - gapEmu - capH;
  if (picH < maxPicH * 0.85) {
    picH = maxPicH;
    picW = Math.min(usableW, Math.round(picH * nativeAspect));
  }
  const fontDelta = fontLadderOffset(unit, targetN);
  const nextId = { v: maxCnvPrId(slideXml) + 1 };

  const extraImageRIds: string[] = [];

  const pieces: string[] = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let k = 1; k <= targetN; k++) {
    const idx = k - 1;
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const originX = bandX + c * cellW + Math.floor((cellW - picW) / 2);
    const originY = bandY + r * cellH + padY;

    let picXml = protoPic.xml;
    picXml = uniquifyIds(picXml, nextId);
    picXml = setTopOff(picXml, originX, originY);
    picXml = setTopExt(picXml, picW, picH);
    if (k > 1) {
      const newId = `rIdImgClone${k}`;
      picXml = picXml.replace(/r:embed="rId\d+"/g, `r:embed="${newId}"`);
      extraImageRIds.push(newId);
    }

    let capXml = protoCap.node.xml;
    capXml = renumberPlaceholders(capXml, "cap", protoCap.k, k);
    capXml = uniquifyIds(capXml, nextId);
    capXml = applyFontLadder(capXml, fontDelta);
    capXml = setTopOff(capXml, originX, originY + picH + gapEmu);
    capXml = setTopExt(capXml, picW, capH);

    pieces.push(picXml, capXml);
    boxes.push({
      x: originX,
      y: originY,
      w: picW,
      h: picH + gapEmu + capH,
    });
  }
  assertNoOverlap(boxes);

  // 删除旧 pic+cap
  const toRemove = [...picsSorted, ...caps.map((c) => c.node)].sort(
    (a, b) => b.start - a.start,
  );
  const insertAt = Math.min(
    ...picsSorted.map((n) => n.start),
    ...caps.map((c) => c.node.start),
  );
  let out = slideXml;
  for (const n of toRemove) {
    out = out.slice(0, n.start) + out.slice(n.end);
  }
  out = out.slice(0, insertAt) + pieces.join("") + out.slice(insertAt);

  for (let k = 1; k <= targetN; k++) {
    if (!out.includes(`{cap${k}}`)) {
      throw new Error(`cloneImageGridPairs: missing cap${k}`);
    }
  }
  return { xml: out, unitCount: targetN, extraImageRIds };
}

type MetricUnitParts = {
  k: number;
  /** 该卡全部顶层节点（deco + item + desc），按 XML 出现序 */
  nodes: TopNode[];
  originX: number;
  originY: number;
  width: number;
};

function shiftSpXfrm(
  spXml: string,
  originX: number,
  originY: number,
  newOriginX: number,
  newOriginY: number,
  scaleX: number,
): string {
  const box = readTopOffExt(spXml);
  if (!box) return spXml;
  const dx = box.x - originX;
  const dy = box.y - originY;
  const x = Math.round(newOriginX + dx * scaleX);
  const y = Math.round(newOriginY + dy);
  const cx = Math.max(1, Math.round(box.cx * scaleX));
  let out = setTopOff(spXml, x, y);
  out = setTopExt(out, cx, box.cy);
  return out;
}

/** 解析 grpSp 的直接子节点（绝对偏移相对 slideXml） */
function parseGrpDirectChildren(
  grpXml: string,
  grpAbsStart: number,
): TopNode[] {
  const body = grpXml
    .replace(/^<p:grpSp\b[^>]*>[\s\S]*?<\/p:grpSpPr>/, "")
    .replace(/<\/p:grpSp>\s*$/, "");
  const bodyAt = grpXml.indexOf(body);
  if (bodyAt < 0) return [];
  const nodes: TopNode[] = [];
  let i = 0;
  while (i < body.length) {
    const m = body.slice(i).match(/<p:(grpSp|sp|pic|cxnSp)\b/);
    if (!m || m.index == null) break;
    const abs = i + m.index;
    const tag = m[1];
    let j = abs;
    let depth = 0;
    let end: number | null = null;
    while (j < body.length) {
      const m2 = body.slice(j).match(/<\/?p:(grpSp|sp|pic|cxnSp)\b[^>]*\/?>/);
      if (!m2 || m2.index == null) break;
      const tok = m2[0];
      const at = j + m2.index;
      if (tok.startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          end = at + tok.length;
          break;
        }
      } else if (tok.endsWith("/>")) {
        if (depth === 0) {
          end = at + tok.length;
          break;
        }
      } else {
        depth += 1;
      }
      j = at + tok.length;
    }
    if (end == null) break;
    nodes.push({
      start: grpAbsStart + bodyAt + abs,
      end: grpAbsStart + bodyAt + end,
      tag,
      xml: body.slice(abs, end),
    });
    i = end;
  }
  return nodes;
}

function vItemKeysIn(
  xml: string,
  kind: "vItem" | "vItem2" = "vItem",
): number[] {
  const re =
    kind === "vItem2"
      ? /\{vItem2\.item(\d+)\}/g
      : /\{vItem\.item(\d+)\}/g;
  return [
    ...new Set([...xml.matchAll(re)].map((m) => +m[1])),
  ].sort((a, b) => a - b);
}

/**
 * 模板缺陷：部分 vItem2.itemN 被拆成三个 a:t（「{」「vItem2.itemN」「}」）。
 * 克隆/灌模前合并为完整占位符，否则找不到单元、填不进槽。
 */
export function repairSplitVItem2Placeholders(xml: string): string {
  return xml.replace(
    /<a:t>\{\s*<\/a:t>([\s\S]*?)<a:t>(vItem2\.item\d+)<\/a:t>([\s\S]*?)<a:t>\}\s*<\/a:t>/g,
    (_m, before: string, name: string, after: string) =>
      `<a:t></a:t>${before}<a:t>{${name}}</a:t>${after}<a:t></a:t>`,
  );
}

type ListUnitHit = {
  k: number;
  node: TopNode;
  box: NonNullable<ReturnType<typeof readTopOffExt>>;
  isGrp: boolean;
  grpXfrm?: NonNullable<ReturnType<typeof readGrpXfrm>>;
};

/**
 * 找 list/progress/vItem2 的「每项一单元」兄弟集合：
 * 顶层或某层 grpSp 的直接子节点中，≥2 个节点各含唯一 itemK。
 */
export function findListUnitCluster(
  slideXml: string,
  slotKind: "vItem" | "vItem2" = "vItem",
): {
  units: ListUnitHit[];
  axis: "x" | "y";
  depth: number;
} | null {
  type Q = { xml: string; abs: number; depth: number };
  const q: Q[] = [];
  const tops = parseTopLevelNodes(slideXml);
  const tryCluster = (
    children: TopNode[],
    depth: number,
  ): ReturnType<typeof findListUnitCluster> => {
    const units: ListUnitHit[] = [];
    for (const node of children) {
      const ks = vItemKeysIn(node.xml, slotKind);
      if (ks.length !== 1) continue;
      if (node.tag === "grpSp") {
        const xfrm = readGrpXfrm(node.xml);
        if (!xfrm) continue;
        units.push({
          k: ks[0],
          node,
          box: { x: xfrm.x, y: xfrm.y, cx: xfrm.cx, cy: xfrm.cy },
          isGrp: true,
          grpXfrm: xfrm,
        });
      } else {
        const box = readTopOffExt(node.xml);
        if (!box) continue;
        units.push({ k: ks[0], node, box, isGrp: false });
      }
    }
    if (units.length < 2) return null;
    units.sort((a, b) => a.k - b.k);
    const ys = units.map((u) => u.box.y);
    const xs = units.map((u) => u.box.x);
    const ySpan = Math.max(...ys) - Math.min(...ys);
    const xSpan = Math.max(...xs) - Math.min(...xs);
    return {
      units,
      axis: ySpan >= xSpan ? "y" : "x",
      depth,
    };
  };

  const topHit = tryCluster(tops, 0);
  if (topHit) return topHit;

  for (const n of tops) {
    if (n.tag === "grpSp" && vItemKeysIn(n.xml, slotKind).length >= 2) {
      q.push({ xml: n.xml, abs: n.start, depth: 1 });
    }
  }
  while (q.length) {
    const cur = q.shift()!;
    const children = parseGrpDirectChildren(cur.xml, cur.abs);
    const hit = tryCluster(children, cur.depth);
    if (hit) return hit;
    for (const c of children) {
      if (c.tag === "grpSp" && vItemKeysIn(c.xml, slotKind).length >= 2) {
        q.push({ xml: c.xml, abs: c.start, depth: cur.depth + 1 });
      }
    }
  }
  return null;
}

/**
 * 单元内序号标签：模板写死的「01」「02」不会随占位符重编号，须单独改。
 * 只改整段恰好等于 from 序号的 <a:t>（避免误伤正文数字）。
 */
export function renumberUnitOrdinalLabel(
  xml: string,
  fromIndex: number,
  toIndex: number,
): string {
  if (fromIndex === toIndex) return xml;
  const fromPad = String(fromIndex).padStart(2, "0");
  const toPad = String(toIndex).padStart(2, "0");
  const fromPlain = String(fromIndex);
  const toPlain = String(toIndex);
  return xml.replace(/<a:t>([^<]*)<\/a:t>/g, (full, raw: string) => {
    const t = raw.trim();
    if (t === fromPad) return `<a:t>${toPad}</a:t>`;
    if (t === fromPlain) return `<a:t>${toPlain}</a:t>`;
    return full;
  });
}

/**
 * C 档（兼 A 档 list/progress）：按 findListUnitCluster 定位行/卡单元，沿主轴 stretch 克隆。
 * 组内坐标不换算——子节点 off 已是父 ch 坐标系，只改子节点自身 xfrm。
 *
 * scaleMode:
 * - main-ext：只缩主轴 a:ext（list 行高）；chExt 不动
 * - uniform：主轴目标宽下等比缩 cx+cy（progress 卡），保持 scaleX=scaleY，圆标不变椭圆
 */
export function cloneListUnitCluster(
  slideXml: string,
  targetN: number,
  unit?: ManifestUnit,
  opts?: {
    scaleMode?: "main-ext" | "uniform";
    slotKind?: "vItem" | "vItem2";
  },
): CloneResult {
  const slotKind = opts?.slotKind || "vItem";
  const cluster = findListUnitCluster(slideXml, slotKind);
  if (!cluster) {
    throw new Error(
      `cloneListUnitCluster: no per-item ${slotKind} unit siblings found`,
    );
  }
  const { units, axis } = cluster;
  const scaleMode =
    opts?.scaleMode || (axis === "x" ? "uniform" : "main-ext");
  const nativeN = units.length;
  if (targetN === nativeN) {
    return { xml: slideXml, unitCount: nativeN };
  }
  if (targetN < 2 || targetN > 9) {
    throw new Error(`cloneListUnitCluster: N=${targetN} out of 2..9`);
  }

  const proto = units[0];
  const envMin =
    axis === "y"
      ? Math.min(...units.map((u) => u.box.y))
      : Math.min(...units.map((u) => u.box.x));
  const envMax =
    axis === "y"
      ? Math.max(...units.map((u) => u.box.y + u.box.cy))
      : Math.max(...units.map((u) => u.box.x + u.box.cx));
  let band0 = envMin;
  let bandLen = envMax - envMin;
  if (unit?.band && unit.band.length === 4) {
    const ub0 = inchesToEmu(axis === "y" ? unit.band[1] : unit.band[0]);
    const ubLen = inchesToEmu(axis === "y" ? unit.band[3] : unit.band[2]);
    if (ubLen >= bandLen * 0.8) {
      band0 = ub0;
      bandLen = ubLen;
    }
  }

  const pitch = Math.floor(bandLen / targetN);
  const minGap = inchesToEmu(axis === "y" ? 0.06 : 0.1);
  const gap = Math.max(minGap, Math.floor(pitch * 0.06));
  const protoMain = axis === "y" ? proto.box.cy : proto.box.cx;
  const unitMain = Math.min(
    protoMain,
    Math.max(inchesToEmu(axis === "y" ? 0.35 : 1.0), pitch - gap),
  );
  const scale = unitMain / Math.max(1, protoMain);
  const fontDelta = fontLadderOffset(unit, targetN);
  const nextId = { v: maxCnvPrId(slideXml) + 1 };

  const clones: string[] = [];
  const hitBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let k = 1; k <= targetN; k++) {
    const origin = band0 + (k - 1) * pitch + Math.floor((pitch - unitMain) / 2);
    let xml = proto.node.xml;
    xml = renumberPlaceholders(xml, slotKind, proto.k, k);
    xml = renumberUnitOrdinalLabel(xml, proto.k, k);
    xml = uniquifyIds(xml, nextId);
    xml = applyFontLadder(xml, fontDelta);
    if (proto.isGrp && proto.grpXfrm) {
      let cx = proto.grpXfrm.cx;
      let cy = proto.grpXfrm.cy;
      let x = proto.grpXfrm.x;
      let y = proto.grpXfrm.y;
      if (scaleMode === "uniform") {
        // 两轴同比例缩 ext，chExt 不变 → scaleX=scaleY，圆形保持圆形
        cx = axis === "x" ? unitMain : Math.max(1, Math.round(proto.grpXfrm.cx * scale));
        cy = axis === "y" ? unitMain : Math.max(1, Math.round(proto.grpXfrm.cy * scale));
        x = axis === "x" ? origin : proto.grpXfrm.x + Math.floor((proto.grpXfrm.cx - cx) / 2);
        y = axis === "y" ? origin : proto.grpXfrm.y + Math.floor((proto.grpXfrm.cy - cy) / 2);
      } else if (axis === "x") {
        cx = unitMain;
        x = origin;
      } else {
        cy = unitMain;
        y = origin;
      }
      xml = setGrpXfrm(xml, {
        x,
        y,
        cx,
        cy,
        chExtCx: proto.grpXfrm.chExtCx,
        chExtCy: proto.grpXfrm.chExtCy,
      });
      hitBoxes.push({ x, y, w: cx, h: cy });
    } else {
      const x = axis === "x" ? origin : proto.box.x;
      const y = axis === "y" ? origin : proto.box.y;
      let cx = proto.box.cx;
      let cy = proto.box.cy;
      if (scaleMode === "uniform") {
        cx = axis === "x" ? unitMain : Math.max(1, Math.round(proto.box.cx * scale));
        cy = axis === "y" ? unitMain : Math.max(1, Math.round(proto.box.cy * scale));
      } else if (axis === "x") {
        cx = unitMain;
      } else {
        cy = unitMain;
      }
      xml = setTopOff(xml, x, y);
      xml = setTopExt(xml, cx, cy);
      hitBoxes.push({ x, y, w: cx, h: cy });
    }
    clones.push(xml);
  }
  assertNoOverlap(hitBoxes);

  let out = slideXml;
  const remove = units
    .map((u) => u.node)
    .sort((a, b) => b.start - a.start);
  const insertAt = Math.min(...units.map((u) => u.node.start));
  for (const n of remove) {
    out = out.slice(0, n.start) + out.slice(n.end);
  }
  out = out.slice(0, insertAt) + clones.join("") + out.slice(insertAt);

  const phPrefix = slotKind === "vItem2" ? "vItem2.item" : "vItem.item";
  for (let k = 1; k <= targetN; k++) {
    if (!out.includes(`{${phPrefix}${k}}`)) {
      throw new Error(`cloneListUnitCluster: missing {${phPrefix}${k}}`);
    }
  }
  return { xml: out, unitCount: targetN };
}

/**
 * B 档：metric — 每卡 = 多个顶层 sp（圆角底 + 顶条 + item + _Desc）
 * 按 itemK 聚类后整体平移/缩宽。
 */
export function cloneMetricMultiSp(
  slideXml: string,
  targetN: number,
  unit?: ManifestUnit,
): CloneResult {
  const nodes = parseTopLevelNodes(slideXml);
  const itemNodes: Array<{ k: number; node: TopNode; box: NonNullable<ReturnType<typeof readTopOffExt>> }> = [];
  const descNodes: Array<{ k: number; node: TopNode }> = [];
  const otherSp: Array<{ node: TopNode; box: NonNullable<ReturnType<typeof readTopOffExt>>; text: string }> = [];

  for (const node of nodes) {
    if (node.tag !== "sp") continue;
    const text = nodeText(node.xml);
    const box = readTopOffExt(node.xml);
    if (!box) continue;
    const im = text.match(/\{vItem\.item(\d+)\}/);
    const dm = text.match(/\{vItem\.item(\d+)_Desc\}/);
    if (dm) {
      descNodes.push({ k: +dm[1], node });
    } else if (im) {
      itemNodes.push({ k: +im[1], node, box });
    } else if (!/\{slideTitle\}/.test(text)) {
      otherSp.push({ node, box, text });
    }
  }
  itemNodes.sort((a, b) => a.k - b.k);
  if (!itemNodes.length) {
    throw new Error("cloneMetricMultiSp: no vItem.item found");
  }
  const nativeN = itemNodes.length;
  if (targetN === nativeN) {
    return { xml: slideXml, unitCount: nativeN };
  }
  if (targetN < 2 || targetN > 9) {
    throw new Error(`cloneMetricMultiSp: N=${targetN} out of 2..9`);
  }

  const units: MetricUnitParts[] = [];
  for (const it of itemNodes) {
    const desc = descNodes.find((d) => d.k === it.k);
    // deco：与 item 横坐标接近、无占位符的顶层 sp
    const deco = otherSp.filter(
      (o) => Math.abs(o.box.x - it.box.x) < inchesToEmu(0.35),
    );
    const parts = [
      ...deco.map((d) => d.node),
      it.node,
      ...(desc ? [desc.node] : []),
    ];
    // 去重（按 start）
    const uniq = [...new Map(parts.map((n) => [n.start, n])).values()].sort(
      (a, b) => a.start - b.start,
    );
    const boxes = uniq
      .map((n) => readTopOffExt(n.xml))
      .filter((b): b is NonNullable<typeof b> => !!b);
    const originX = Math.min(...boxes.map((b) => b.x));
    const originY = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.cx));
    units.push({
      k: it.k,
      nodes: uniq,
      originX,
      originY,
      width: right - originX,
    });
  }

  const proto = units[0];
  const envX = Math.min(...units.map((u) => u.originX));
  const envY = Math.min(...units.map((u) => u.originY));
  const envRight = Math.max(
    ...units.map((u) => {
      const boxes = u.nodes
        .map((n) => readTopOffExt(n.xml)!)
        .filter(Boolean);
      return Math.max(...boxes.map((b) => b.x + b.cx));
    }),
  );
  let bandX = envX;
  let bandW = envRight - envX;
  if (unit?.band && unit.band.length === 4) {
    const ubW = inchesToEmu(unit.band[2]);
    if (ubW >= bandW * 0.8) {
      bandX = inchesToEmu(unit.band[0]);
      bandW = ubW;
    }
  }

  const pitch = Math.floor(bandW / targetN);
  const minGap = inchesToEmu(0.12);
  const gap = Math.max(minGap, Math.floor(pitch * 0.06));
  const unitW = Math.min(proto.width, Math.max(inchesToEmu(1.2), pitch - gap));
  const scaleX = unitW / proto.width;
  const fontDelta = fontLadderOffset(unit, targetN);
  const nextId = { v: maxCnvPrId(slideXml) + 1 };

  const clones: string[] = [];
  const hitBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let k = 1; k <= targetN; k++) {
    const newOx = bandX + (k - 1) * pitch + Math.floor((pitch - unitW) / 2);
    const newOy = envY;
    const pieceXmls: string[] = [];
    for (const n of proto.nodes) {
      let xml = n.xml;
      xml = renumberPlaceholders(xml, "vItem", proto.k, k);
      xml = uniquifyIds(xml, nextId);
      xml = applyFontLadder(xml, fontDelta);
      xml = shiftSpXfrm(xml, proto.originX, proto.originY, newOx, newOy, scaleX);
      pieceXmls.push(xml);
    }
    clones.push(...pieceXmls);
    hitBoxes.push({ x: newOx, y: newOy, w: unitW, h: inchesToEmu(2.0) });
  }
  assertNoOverlap(hitBoxes);

  const toRemove = units
    .flatMap((u) => u.nodes)
    .sort((a, b) => b.start - a.start);
  const insertAt = Math.min(...units.flatMap((u) => u.nodes.map((n) => n.start)));
  let out = slideXml;
  // 同一节点可能被两个 unit 引用？已 uniq per unit；跨 unit 不应重复
  const removed = new Set<number>();
  for (const n of toRemove) {
    if (removed.has(n.start)) continue;
    removed.add(n.start);
    out = out.slice(0, n.start) + out.slice(n.end);
  }
  out = out.slice(0, insertAt) + clones.join("") + out.slice(insertAt);

  for (let k = 1; k <= targetN; k++) {
    if (!out.includes(`{vItem.item${k}}`)) {
      throw new Error(`cloneMetricMultiSp: missing vItem.item${k}`);
    }
  }
  return { xml: out, unitCount: targetN };
}

export type DualClonePlan = {
  page: number;
  layout: "metric_columns" | "metric_list";
  metricN: number;
  secondaryN: number;
  nativeMetricN: number;
  nativeSecondaryN: number;
  needMetricClone: boolean;
  needSecondaryClone: boolean;
  unit?: ManifestUnit;
};

/** 双区母版：精确命中 → 同 secondary 最大卡数 → 全局最大卡数页 */
export function resolveDualPageForClone(
  layout: "metric_columns" | "metric_list",
  metricN: number,
  secondaryN: number,
): DualClonePlan {
  const pages = (getTemplateManifest().pages || []).filter(
    (p) => p.layout === layout,
  );
  const mN = Math.max(2, Math.min(9, Math.round(metricN || 2)));
  const sN = Math.max(2, Math.min(9, Math.round(secondaryN || 2)));
  const secOf = (p: ManifestPage) =>
    layout === "metric_columns" ? p.cols || 2 : p.lists || 2;
  const cardOf = (p: ManifestPage) => p.cards || 0;

  const exact = pages.find((p) => cardOf(p) === mN && secOf(p) === sN);
  if (exact) {
    return {
      page: exact.page,
      layout,
      metricN: mN,
      secondaryN: sN,
      nativeMetricN: cardOf(exact),
      nativeSecondaryN: secOf(exact),
      needMetricClone: false,
      needSecondaryClone: false,
      unit: exact.unit,
    };
  }

  let pool = pages.filter((p) => secOf(p) === sN);
  if (!pool.length) {
    pool = pages.filter((p) => secOf(p) >= Math.min(sN, 3));
  }
  if (!pool.length) pool = pages.slice();
  const master = pool
    .slice()
    .sort(
      (a, b) =>
        cardOf(b) - cardOf(a) || secOf(b) - secOf(a) || a.page - b.page,
    )[0];
  if (!master) {
    return {
      page: 0,
      layout,
      metricN: mN,
      secondaryN: sN,
      nativeMetricN: 0,
      nativeSecondaryN: 0,
      needMetricClone: false,
      needSecondaryClone: false,
    };
  }
  return {
    page: master.page,
    layout,
    metricN: mN,
    secondaryN: sN,
    nativeMetricN: cardOf(master),
    nativeSecondaryN: secOf(master),
    needMetricClone: mN !== cardOf(master),
    needSecondaryClone: sN !== secOf(master),
    unit: master.unit,
  };
}

/**
 * B 档双区：上排 metric 卡 + 下排 columns / vItem2 行，两区各自独立克隆。
 * plan.unit 只描述上排 metric（manifest unitKind=card）；下区带宽/字号阶梯
 * 由 cluster 实测 envelope 推导，勿把 metric unit 传给下区（轴/band 全错）。
 */
export function cloneDualZone(
  slideXml: string,
  plan: DualClonePlan,
): CloneResult {
  let xml = repairSplitVItem2Placeholders(slideXml);
  let unitCount = plan.nativeMetricN;
  if (plan.needMetricClone) {
    const m = cloneMetricMultiSp(xml, plan.metricN, plan.unit);
    xml = m.xml;
    unitCount = m.unitCount;
  }
  if (plan.needSecondaryClone) {
    if (plan.layout === "metric_columns") {
      const c = cloneColumnsTopLevel(xml, plan.secondaryN, undefined);
      xml = c.xml;
    } else {
      const r = cloneListUnitCluster(xml, plan.secondaryN, undefined, {
        scaleMode: "main-ext",
        slotKind: "vItem2",
      });
      xml = r.xml;
    }
  }
  return {
    xml,
    unitCount,
  };
}

/** 按 layout 分派 A/B/C 档克隆；无需克隆时原样返回 */
export function applyATierClone(
  slideXml: string,
  plan: ClonePlan,
): CloneResult {
  if (!plan.needClone) {
    return { xml: slideXml, unitCount: plan.nativeN };
  }
  if (plan.layout === "columns") {
    return cloneColumnsTopLevel(slideXml, plan.targetN, plan.unit);
  }
  if (plan.layout === "image_grid") {
    return cloneImageGridPairs(slideXml, plan.targetN, plan.unit);
  }
  if (plan.layout === "metric") {
    return cloneMetricMultiSp(slideXml, plan.targetN, plan.unit);
  }
  if (plan.layout === "list") {
    return cloneListUnitCluster(slideXml, plan.targetN, plan.unit, {
      scaleMode: "main-ext",
    });
  }
  if (plan.layout === "progress") {
    // 横排卡含圆标：须等比缩，否则只压宽会把圆拉成椭圆
    return cloneListUnitCluster(slideXml, plan.targetN, plan.unit, {
      scaleMode: "uniform",
    });
  }
  throw new Error(`applyATierClone: layout ${plan.layout} not clonable yet`);
}

export function countVItemSlots(slideXml: string): number {
  const ks = [
    ...slideXml.matchAll(/\{vItem\.item(\d+)\}/g),
  ].map((m) => +m[1]);
  return ks.length ? Math.max(...ks) : 0;
}

export function countVItem2Slots(slideXml: string): number {
  const repaired = repairSplitVItem2Placeholders(slideXml);
  const ks = [
    ...repaired.matchAll(/\{vItem2\.item(\d+)\}/g),
  ].map((m) => +m[1]);
  return ks.length ? Math.max(...ks) : 0;
}

/** 收集 slide 内全部 cNvPr id，断言唯一 */
export function assertUniqueShapeIds(slideXml: string): void {
  const ids = [...slideXml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(
    (m) => m[1],
  );
  if (new Set(ids).size !== ids.length) {
    throw new Error("templateClone: duplicate cNvPr id");
  }
}

export function countCapSlots(slideXml: string): number {
  const ks = [
    ...slideXml.matchAll(/\{cap(\d+)\}/g),
  ].map((m) => +m[1]);
  return ks.length ? Math.max(...ks) : 0;
}

export function countColTitleSlots(slideXml: string): number {
  const ks = [
    ...slideXml.matchAll(/\{col(\d+)Title\}/g),
  ].map((m) => +m[1]);
  return ks.length ? Math.max(...ks) : 0;
}

// silence unused in case tree-shaken analysis
void emuToIn;
