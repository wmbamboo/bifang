/**
 * 三十：来源标注开关 + 二十九·P0 资料来源聚合
 */
import {
  buildKbDocWritingConstraintPrompt,
  stripCitationsDeep,
  stripHallucinatedDocCitations,
} from "../src/components/DocUtil/parseChatCompletion";
import {
  accumulateRefDocs,
  appendDocBibliography,
  bibliographyFromBag,
} from "../src/components/DocUtil/docBibliography";
import PizZip from "pizzip";

describe("三十 allowCitations", () => {
  test("allowCitations:false 禁止 [文档N]", () => {
    const s = buildKbDocWritingConstraintPrompt(
      {min: 150, max: 150},
      {hasRetrieval: true, allowCitations: false},
    );
    expect(s).toMatch(/禁止输出任何 \[文档/);
    expect(s).not.toMatch(/可在句末用 \[文档1\]/);
  });

  test("缺省 allowCitations 仍可标注", () => {
    const s = buildKbDocWritingConstraintPrompt(
      {min: 150, max: 150},
      {hasRetrieval: true},
    );
    expect(s).toMatch(/可在句末用 \[文档1\]/);
  });
});

describe("三十 stripCitationsDeep", () => {
  test("深拷贝不改入参 + 剥离计数 + 保留原型方法", () => {
    const {Chapter, Paragraph} = require("../src/components/DocUtil/ViewItem4Doc");
    const ch = new Chapter(1, "章");
    const p = new Paragraph(1, "段");
    p.content = "销量 403.7万[文档1]，同比升[文档2]。";
    ch.paragraphs = [p];
    const chapters = [ch];
    const before = p.content;
    const {chapters: out, stripped} = stripCitationsDeep(chapters);
    expect(stripped).toBe(2);
    expect(p.content).toBe(before);
    expect(out[0].paragraphs[0].content).not.toMatch(/\[文档/);
    expect(out[0].paragraphs[0].content).toMatch(/403\.7万/);
    expect(out).not.toBe(chapters);
    // 导出链路会调 isContainer；JSON 克隆会丢方法导致下载崩溃
    expect(typeof out[0].paragraphs[0].isContainer).toBe("function");
    expect(out[0].paragraphs[0].isContainer()).toBe(false);
  });
});

describe("二十九 资料来源聚合", () => {
  test("accumulate + bibliography 去重页码", () => {
    const bag = new Map<string, Set<number>>();
    accumulateRefDocs(bag, [
      {source: "a.pdf", page: 4},
      {source: "a.pdf", page: 7},
      {source: "b.pdf", page: 2},
      {source: "a.pdf", page: 4},
    ]);
    const bib = bibliographyFromBag(bag);
    expect(bib).toEqual([
      {source: "a.pdf", pages: [4, 7]},
      {source: "b.pdf", pages: [2]},
    ]);
  });

  test("appendDocBibliography 不进 heading 样式", () => {
    const zip = new PizZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:pPr><w:pStyle w:val="1"/></w:pPr><w:r><w:t>1 章</w:t></w:r></w:p>` +
        `<w:sectPr/></w:body></w:document>`,
    );
    expect(
      appendDocBibliography(zip, [{source: "demo.pdf", pages: [1, 3]}]),
    ).toBe(true);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toMatch(/资料来源/);
    expect(xml).toMatch(/demo\.pdf/);
    expect(xml).toMatch(/第 1、3 页/);
    expect(xml.indexOf("资料来源")).toBeLessThan(xml.indexOf("<w:sectPr"));
    // 未新增 styleId=1 标题段
    expect([...xml.matchAll(/w:pStyle w:val="1"/g)].length).toBe(1);
  });
});

describe("stripHallucinatedDocCitations 烟雾", () => {
  test("剥离", () => {
    expect(
      stripHallucinatedDocCitations("a[文档1]。").stripped,
    ).toBe(1);
  });
});
