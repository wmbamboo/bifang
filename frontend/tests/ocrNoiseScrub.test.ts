/**
 * 任务 6 验收（十·6）：OCR 噪声词表 + 模板无「文档修改记录」
 */
import {readFileSync} from "fs";
import {join} from "path";
import PizZip from "pizzip";
import {
  resetCorpusProfile,
  setActiveCorpusProfile,
  DIGITAL3C_STUB_PROFILE_JSON,
} from "@/components/DocUtil/corpusProfile";
import {applyOcrNoiseScrub} from "@/components/DocUtil/ocrNoiseScrub";

afterEach(() => {
  resetCorpusProfile();
});

describe("ocrNoiseScrub B6", () => {
  test("激情增高 → 热情提升（apparel 画像）", () => {
    const src = "消费者激情增高，复购意愿上升。";
    const {text, report} = applyOcrNoiseScrub(src);
    expect(text).toBe("消费者热情提升，复购意愿上升。");
    expect(report.replaced_count).toBe(1);
    expect(text).not.toContain("激情增高");
  });

  test("无噪声词不变", () => {
    const src = "常规袖以79.76%位居首位。";
    const {text, report} = applyOcrNoiseScrub(src);
    expect(text).toBe(src);
    expect(report.replaced_count).toBe(0);
  });

  test("无词表画像不替换", () => {
    setActiveCorpusProfile({
      ...DIGITAL3C_STUB_PROFILE_JSON,
      ocrNoiseReplacements: [],
    });
    const src = "消费者激情增高。";
    const {text, report} = applyOcrNoiseScrub(src);
    expect(text).toBe(src);
    expect(report.replaced_count).toBe(0);
  });
});

describe("docTemplate-simple 无文档修改记录空表", () => {
  test("模板正文不含「文档修改记录」标题表", () => {
    const tplPath = join(__dirname, "../public/docTemplate-simple.docx");
    const zip = new PizZip(readFileSync(tplPath));
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).not.toContain("文档修改记录");
    expect(xml).toContain("DOCBLOCK");
    // docxtemplater 循环可能被拆进多个 <w:t>
    expect(xml).toContain("{#");
    expect(xml).toContain("chapter");
  });
});
