/**
 * 目检样例：生成含「6 列 columns」「6/8 格 image_grid」的 pptx，用 PowerPoint 打开看布局。
 * 用法：cd frontend && npx tsx scripts/gen_clone_preview.ts
 */
import fs from "fs";
import path from "path";
import PptTemplate from "../src/components/DocUtil/PptTemplate";

const ROOT = path.resolve(__dirname, "..");
const TPL = path.join(ROOT, "public", "pptTemplate-simple.pptx");
const OUT_DIR = path.join(ROOT, "tmp", "clone-preview");

function colVars(n: number) {
  const vars: Record<string, string> = { slideTitle: `${n}列对照（克隆目检）` };
  for (let k = 1; k <= n; k++) {
    vars[`col${k}Title`] = `轴${k}`;
    vars[`col${k}Sub`] = `副标${k}`;
    for (let i = 1; i <= 3; i++) {
      vars[`col${k}.item${i}`] = `要点${k}.${i}`;
    }
  }
  return vars;
}

function gridVars(n: number) {
  const vars: Record<string, string> = { slideTitle: `${n}格图鉴（克隆目检）` };
  for (let k = 1; k <= n; k++) {
    vars[`cap${k}`] = `图注${k}`;
  }
  return vars;
}

/** 1×1 透明 PNG，仅占位让图鉴槽能灌图 */
function tinyPng(): ArrayBuffer {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const u8 = Uint8Array.from(Buffer.from(b64, "base64"));
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "clone-preview.pptx");
  const t = new PptTemplate("localFile", TPL, outPath);
  await t.init();

  let page = 1;
  await t.genNewSlideFileDict_Random("columns", colVars(6), page++, 6);
  await t.genNewSlideFileDict_Random(
    "image_grid",
    gridVars(6),
    page++,
    6,
    undefined,
    Array.from({ length: 6 }, () => tinyPng()),
  );
  await t.genNewSlideFileDict_Random(
    "image_grid",
    gridVars(8),
    page++,
    8,
    undefined,
    Array.from({ length: 8 }, () => tinyPng()),
  );

  // B 档 metric：6 卡（母版 5 卡克隆）
  const vItem: Record<string, string> = {};
  for (let k = 1; k <= 6; k++) {
    vItem[`item${k}`] = `${k}86万`;
    vItem[`item${k}_Desc`] = `口径${k}`;
  }
  await t.genNewSlideFileDict_Random(
    "metric",
    { slideTitle: "6卡指标（克隆目检）", vItem },
    page++,
    6,
  );

  // C 档 list：6 行（母版 p17 组内克隆）
  const listItem: Record<string, string> = {};
  for (let k = 1; k <= 6; k++) {
    listItem[`item${k}`] = `要点标题${k}`;
    listItem[`item${k}_Desc`] = `说明文字${k}，用于目检行高与间距`;
  }
  await t.genNewSlideFileDict_Random(
    "list",
    { slideTitle: "6行列表（克隆目检）", vItem: listItem },
    page++,
    6,
  );

  // C 档 progress：6 站
  const progItem: Record<string, string> = {};
  for (let k = 1; k <= 6; k++) {
    progItem[`item${k}`] = `阶段${k}`;
    progItem[`item${k}_Desc`] = `先完成动作${k}再承接下一站`;
  }
  await t.genNewSlideFileDict_Random(
    "progress",
    { slideTitle: "6站进度（克隆目检）", vItem: progItem },
    page++,
    6,
  );

  // 双区 metric_columns：6 卡 + 3 栏
  const mcVItem: Record<string, string> = {};
  for (let k = 1; k <= 6; k++) {
    mcVItem[`item${k}`] = `${k}0%`;
    mcVItem[`item${k}_Desc`] = `指标${k}`;
  }
  const mcCols: Record<string, string> = {};
  for (let c = 1; c <= 3; c++) {
    mcCols[`col${c}Title`] = `轴${c}`;
    mcCols[`col${c}Sub`] = `副${c}`;
    for (let i = 1; i <= 3; i++) mcCols[`col${c}.item${i}`] = `点${c}.${i}`;
  }
  await t.genNewSlideFileDict_Random(
    "metric_columns",
    { slideTitle: "6卡+3栏（双区目检）", vItem: mcVItem, ...mcCols },
    page++,
    6,
    3,
  );

  // 双区 metric_list：5 卡 + 4 行要点
  const mlVItem: Record<string, string> = {};
  for (let k = 1; k <= 5; k++) {
    mlVItem[`item${k}`] = `${k}万`;
    mlVItem[`item${k}_Desc`] = `卡${k}`;
  }
  const mlV2: Record<string, string> = {};
  for (let k = 1; k <= 4; k++) {
    mlV2[`item${k}`] = `要点${k}`;
    mlV2[`item${k}_Desc`] = `说明${k}`;
  }
  await t.genNewSlideFileDict_Random(
    "metric_list",
    { slideTitle: "5卡+4行（双区目检）", vItem: mlVItem, vItem2: mlV2 },
    page++,
    5,
    4,
  );

  await t.genNewSlideFile("localFile");
  console.log("wrote", outPath);
  console.log(
    "共 8 页：…⑥ progress  ⑦ metric_columns  ⑧ metric_list",
  );
  if (process.env.WSL_DISTRO_NAME) {
    console.log(
      "WSL 路径对应 Windows：\\\\wsl$\\" +
        process.env.WSL_DISTRO_NAME +
        outPath.replace(/\//g, "\\"),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
