/**
 * 十八·P1-a：applyHeadingLevels + TOC 动态化
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

describe("docHeadingLevels", () => {
  test("infer / plan：有 points 时深度到 4", () => {
    const ch = new Chapter(1, "章");
    const p = new Paragraph(1, "段");
    p.level = 3;
    p.heading = true;
    p.points = [{label: "子1"}, {label: "子2"}];
    ch.paragraphs = [p];
    expect(inferDocMaxHeadingLevel([ch])).toBe(4);
    expect(buildHeadingLevelPlan([ch], 4)).toEqual([
      {level: 2},
      {level: 3},
      {level: 4},
      {level: 4},
    ]);
  });

  test("patchTocOutlineLevels：1-3 → 1-4", () => {
    const zip = loadTemplateZip();
    const before = zip.file("word/document.xml")!.asText();
    expect(before).toMatch(/TOC \\o "1-3"/);
    patchTocOutlineLevels(zip, 4);
    const after = zip.file("word/document.xml")!.asText();
    expect(after).toMatch(/TOC \\o "1-4"/);
    expect(after).not.toMatch(/TOC \\o "1-3"/);
  });

  test("applyHeadingLevels：按 plan 改写 pStyle", () => {
    const docXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>封面</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t>目录</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="2"/></w:pPr><w:r><w:t>章</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="3"/></w:pPr><w:r><w:t>段</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:pStyle w:val="3"/></w:pPr><w:r><w:t>子点</w:t></w:r></w:p>` +
      `<w:sectPr/></w:body></w:document>`;
    const zip = new PizZip();
    zip.file("word/document.xml", docXml);
    const r = applyHeadingLevels(zip, [
      {level: 2},
      {level: 3},
      {level: 4},
    ]);
    expect(r.ok).toBe(true);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toMatch(/w:pStyle w:val="1"/); // 封面不动
    expect(xml).toMatch(/w:pStyle w:val="TOC1"/);
    expect(xml).toMatch(/w:pStyle w:val="4"/);
    // 子点已从 3 改为 4
    const styles = [...xml.matchAll(/w:pStyle w:val="(\d+)"/g)].map((x) => x[1]);
    expect(styles).toEqual(["1", "2", "3", "4"]);
  });

  test("模板 styles.xml heading 4 字号 22（十八·P1-b）", () => {
    const zip = loadTemplateZip();
    const s = zip.file("word/styles.xml")!.asText();
    const m = s.match(/w:styleId="4"[^>]*>[\s\S]*?<\/w:style>/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/w:sz w:val="22"/);
  });
});
