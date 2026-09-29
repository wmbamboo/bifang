/**
 * manifest 与 pptx 一致性 + progress 取页（第六章 P0）
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  getTemplateManifest,
  resolveTemplatePage,
} from "@/components/DocUtil/templateManifest";

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "rebuild_template_manifest.py");
const PUBLIC_MANIFEST = path.join(ROOT, "public", "template-manifest.json");
const SRC_MANIFEST = path.join(
  ROOT,
  "src",
  "components",
  "DocUtil",
  "template-manifest.json",
);

describe("template manifest ↔ pptx", () => {
  test("两份 manifest 逐字节一致", () => {
    const a = fs.readFileSync(PUBLIC_MANIFEST);
    const b = fs.readFileSync(SRC_MANIFEST);
    expect(a.equals(b)).toBe(true);
  });

  test("重建脚本幂等（重跑后 manifest 不变）", () => {
    const before = fs.readFileSync(PUBLIC_MANIFEST);
    execFileSync("python3", [SCRIPT], { cwd: ROOT, stdio: "pipe" });
    const afterPublic = fs.readFileSync(PUBLIC_MANIFEST);
    const afterSrc = fs.readFileSync(SRC_MANIFEST);
    expect(afterPublic.equals(before)).toBe(true);
    expect(afterSrc.equals(before)).toBe(true);
  });

  test("50 页映射：progress/list/table/image_grid/tail", () => {
    const m = getTemplateManifest();
    expect(m.slideMax).toBe(50);
    expect(m.pages).toHaveLength(50);
    expect(resolveTemplatePage("progress", 3).page).toBe(6);
    expect(resolveTemplatePage("progress", 5).page).toBe(8);
    expect(resolveTemplatePage("list", 3).page).toBe(15);
    expect(resolveTemplatePage("list", 5).page).toBe(17);
    expect(resolveTemplatePage("metric", 2).page).toBe(27);
    expect(resolveTemplatePage("columns", 2).page).toBe(31);
    expect(resolveTemplatePage("table", 5, 4).page).toBe(45);
    expect(resolveTemplatePage("image_grid").page).toBe(49);
    expect(resolveTemplatePage("tail").page).toBe(50);
    const progress = m.pages.filter((p) => p.layout === "progress");
    expect(progress).toHaveLength(9);
    expect(progress.every((p) => p.unit || p.unitKind)).toBe(true);
  });
});
