/**
 * 知识库 / 智能大纲构思欢迎样例对齐（读源码，避 antd）
 */
import {readFileSync} from "fs";
import {join} from "path";

const samplesSrc = () =>
  readFileSync(
    join(__dirname, "../src/components/ChatUtil/outlineWelcomeSamples.ts"),
    "utf8",
  );

describe("outline welcome samples 知识库/智能对齐", () => {
  it("共用模块含文章/PPT 样例且 GJB 在主题串内", () => {
    const src = samplesSrc();
    expect(src).toMatch(/DOC_OUTLINE_WELCOME_SAMPLES/);
    expect(src).toMatch(/PPT_OUTLINE_WELCOME_SAMPLES/);
    expect(src).toMatch(/主题是【/);
    // GJB 约束写在 compose* 的主题参数里，而非 content 后缀拼接
    expect(src).toMatch(/研制总结报告（深空探测图谱项目，遵循GJB438B）/);
    expect(src).toMatch(/深空探测图谱项目研制总结报告（遵循GJB438B）/);
    expect(src).not.toMatch(/\+ ['"]（深空/);
    expect(src).not.toMatch(/\+ ['"]要求遵循GJB/);
  });

  it("四页均引用共用样例常量", () => {
    const pages = [
      "KbGenDocOutline.tsx",
      "AiGenDocOutline.tsx",
      "KbGenPptOutline.tsx",
      "AiGenPptOutline.tsx",
    ];
    for (const f of pages) {
      const src = readFileSync(join(__dirname, "../src/pages", f), "utf8");
      expect(src).toMatch(/outlineWelcomeSamples/);
      expect(src).not.toMatch(/composeDocOutlineUserMessage\(/);
      expect(src).not.toMatch(/composePptOutlineUserMessage\(/);
    }
  });

  it("文章/PPT Chat 样例均走定框 signal", () => {
    const doc = readFileSync(
      join(__dirname, "../src/components/ChatUtil/ChatWithSpeech4Doc.tsx"),
      "utf8",
    );
    const ppt = readFileSync(
      join(__dirname, "../src/components/ChatUtil/ChatWithSpeech4Ppt.tsx"),
      "utf8",
    );
    expect(doc).toMatch(/setPreviewSignal/);
    expect(doc).toMatch(/openPreviewSignal=\{previewSignal\}/);
    expect(ppt).toMatch(/setPreviewSignal/);
    expect(ppt).toMatch(/openPreviewSignal=\{previewSignal\}/);
  });
});
