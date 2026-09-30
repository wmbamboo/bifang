/**
 * 十三·C：模板目录为真 TOC 域（dirty），无手搓 {#chapters} 目录循环。
 */
import {readFileSync} from "fs";
import {join} from "path";
import PizZip from "pizzip";

describe("docTemplate TOC 十三·C", () => {
  const xml = () => {
    const buf = readFileSync(
      join(__dirname, "../public/docTemplate-simple.docx"),
    );
    return new PizZip(buf).file("word/document.xml")!.asText();
  };

  test("真 TOC 域 + dirty，无 PAGEREF 手搓页码", () => {
    const x = xml();
    expect(x).toMatch(/TOC \\o "1-3"/);
    expect(x).toMatch(/w:dirty="true"/);
    expect(x).not.toContain("PAGEREF");
    expect(x).not.toMatch(/w:name="_Toc/);
  });

  test("正文循环与 DOCBLOCK / points 仍在", () => {
    const x = xml();
    expect(x).toContain("DOCBLOCK");
    expect(x).toContain("{#");
    expect(x).toContain("chapter");
    expect(x).toContain("paragraphs");
    expect(x).toContain("points");
    expect(x).toContain("{label}");
    expect(x).toMatch(/w:pStyle w:val="3"/);
  });
});
