/**
 * 十八·P1-a / 二十二·4–5：applyHeadingLevels + plan 口径对齐
 */
import {readFileSync} from "fs";
import {join} from "path";
import PizZip from "pizzip";
import {
  applyHeadingLevels,
  buildHeadingLevelPlan,
  inferDocMaxHeadingLevel,
  patchTocOutlineLevels,
} from "../src/components/DocUtil/docHeadingLevels";
import {Chapter, Paragraph} from "../src/components/DocUtil/ViewItem4Doc";

function loadTemplateZip(): PizZip {
  const buf = readFileSync(
    join(__dirname, "../public/docTemplate-simple.docx"),
  );
  return new PizZip(buf);
}

function makeChapters(paraCounts: number[]): Chapter[] {
  return paraCounts.map((n, ci) => {
    const ch = new Chapter(ci + 1, `章${ci + 1}`);
    for (let i = 0; i < n; i++) {
      const p = new Paragraph(i + 1, `段${ci + 1}.${i + 1}`);
      p.heading = true;
      p.level = 3;
      ch.paragraphs.push(p);
    }
    return ch;
  });
}

describe("docHeadingLevels 22.4/22.5", () => {
  test("plan 只含段，不含章、不含 points", () => {
    const ch = new Chapter(1, "章");
    const p = new Paragraph(1, "段");
    p.level = 3;
    p.heading = true;
    p.points = [{label: "子1"}, {label: "子2"}];
    ch.paragraphs = [p];
    expect(buildHeadingLevelPlan([ch], 4)).toEqual([{level: 3}]);
    expect(inferDocMaxHeadingLevel([ch])).toBe(3);
  });

  test("4 章 13 段：plan.length === 13（对角线回归）", () => {
    const chapters = makeChapters([3, 3, 4, 3]);
    const plan = buildHeadingLevelPlan(chapters, 3);
    expect(plan).toHaveLength(13);
    expect(plan.every((x) => x.level === 3)).toBe(true);
  });

  test("applyHeadingLevels 等长全改成 3；不等长 ok=false", () => {
    // 模拟渲染后：章 style=1，段 style=2
    const titles = ["1.1", "1.2", "1.3", "2.1", "2.2"];
    const body = titles
      .map((t) => `<w:p><w:pPr><w:pStyle w:val="2"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`)
      .join("");
    const docXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>章一</w:t></w:r></w:p>` +
      body +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new PizZip();
    zip.file("word/document.xml", docXml);
    const plan = titles.map(() => ({level: 3}));
    const r = applyHeadingLevels(zip, plan);
    expect(r.ok).toBe(true);
    expect(r.mismatched).toBe(0);
    const styles = [
      ...zip
        .file("word/document.xml")!
        .asText()
        .matchAll(/w:pStyle w:val="(\d+)"/g),
    ].map((x) => x[1]);
    expect(styles).toEqual(["1", "3", "3", "3", "3", "3"]);

    const bad = applyHeadingLevels(zip, [{level: 3}, {level: 3}]);
    expect(bad.ok).toBe(false);
    expect(bad.mismatched).not.toBe(0);
  });

  test("patchTocOutlineLevels：1-3 → 1-4", () => {
    const zip = loadTemplateZip();
    patchTocOutlineLevels(zip, 4);
    expect(zip.file("word/document.xml")!.asText()).toMatch(/TOC \\o "1-4"/);
  });

  test("模板 styles.xml heading 4 字号 22", () => {
    const zip = loadTemplateZip();
    const s = zip.file("word/styles.xml")!.asText();
    const m = s.match(/w:styleId="4"[^>]*>[\s\S]*?<\/w:style>/);
    expect(m![0]).toMatch(/w:sz w:val="22"/);
  });
});
