/**
 * 七·8 Word 表/图注入金标
 */
import {readFileSync} from "fs";
import {join} from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {Doc} from "@/components/DocUtil/ViewItem4Doc";
import {
  computeInlineEmu,
  findDocBlockAnchors,
  injectDocBlocks,
  prepareChaptersBlocks,
  DOCBLOCK_MARK,
  PAGE_W_EMU,
  type DocBlockPayloadItem,
} from "@/components/DocUtil/DocBlockInjector";

/**
 * 本地（Windows + UNC 路径 \\wsl.localhost\...）跑不通的根因，不是本套件的问题：
 *   DocBlockInjector 顶层 `import {fetchAssetBytes} from "@/services/chatchat/kb"`
 *   → pino → thread-stream 在 worker 里 fileURLToPath(UNC) 抛
 *   `ERR_INVALID_FILE_URL_PATH: File URL path must be absolute`，进程直接退出。
 * 本套件只注入现成 bytes、从不取 KB 图，所以把该模块 mock 掉：
 * 本地与 CI 行为一致，都为绿。
 */
jest.mock("@/services/chatchat/kb", () => ({
  fetchAssetBytes: async () => {
    throw new Error("DocTemplate 用例不应调用 fetchAssetBytes");
  },
}));

/** 1×1 PNG */
const PNG_1x1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

/** 2×1 PNG（宽高比 2）便于尺寸断言 */
function png2x1(): Uint8Array {
  // IHDR 2x1
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC";
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

const OUTLINE_WITH_BLOCKS = `# 测试文稿

## 第一章 市场

### 大盘规模

正文略。

\`\`\`table
caption: 各品类销量与GMV对比
| 品类 | 销量 | GMV | 占比 |
| polo衫 | 403.7万 | 3.9亿 | 54.8% |
| 衬衫 | 296.2万 | 3.3亿 | 40.2% |
\`\`\`

\`\`\`figure
ref: kb:demo.docx/elements/p1.png
caption: 编织肌理Polo衫
\`\`\`

### 另一段

只有散文。
`;

describe("DocTemplate · 解析 ```table/figure", () => {
  it("块挂在正确段落，表格行不被当成段落", () => {
    const body = Doc.getContentFromMsg(OUTLINE_WITH_BLOCKS);
    const chapters = Doc.getChaptersFromContent(body);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].paragraphs).toHaveLength(2);
    const p0 = chapters[0].paragraphs[0];
    expect(p0.blocks).toHaveLength(2);
    expect(p0.blocks[0].kind).toBe("table");
    if (p0.blocks[0].kind === "table") {
      expect(p0.blocks[0].caption).toContain("各品类");
      expect(p0.blocks[0].rows.length).toBeGreaterThanOrEqual(2);
      expect(p0.blocks[0].rows[0][0]).toBe("品类");
    }
    expect(p0.blocks[1].kind).toBe("figure");
    if (p0.blocks[1].kind === "figure") {
      expect(p0.blocks[1].assetRef).toContain("kb:");
    }
    // 回归坑：不得把「品类 | 销量」收成假段落
    const titles = chapters[0].paragraphs.map((p) => p.title);
    expect(titles.some((t) => t.includes("品类"))).toBe(false);
    expect(chapters[0].paragraphs[1].blocks).toHaveLength(0);
  });
});

describe("DocTemplate · injectDocBlocks", () => {
  function miniZipWithAnchors(n: number): PizZip {
    const anchors = Array.from({length: n}, () =>
      `<w:p><w:r><w:t>${DOCBLOCK_MARK}</w:t></w:r></w:p>`,
    ).join("");
    const docXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body><w:p><w:r><w:t>hi</w:t></w:r></w:p>${anchors}<w:sectPr/></w:body></w:document>`;
    const rels =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`;
    const ct =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`;
    const zip = new PizZip();
    zip.file("word/document.xml", docXml);
    zip.file("word/_rels/document.xml.rels", rels);
    zip.file("[Content_Types].xml", ct);
    return zip;
  }

  it("2 图 1 表：drawing/tbl/rels/media/无锚点", () => {
    const zip = miniZipWithAnchors(2);
    const seq: Array<DocBlockPayloadItem[] | null> = [
      [
        {
          kind: "table",
          caption: "对比表",
          rows: [
            ["A", "B"],
            ["1", "2"],
          ],
        },
        {
          kind: "figure",
          caption: "图甲",
          bytes: PNG_1x1,
          mime: "image/png",
          pxW: 1,
          pxH: 1,
        },
      ],
      [
        {
          kind: "figure",
          caption: "图乙",
          bytes: png2x1(),
          mime: "image/png",
          pxW: 2,
          pxH: 1,
        },
      ],
    ];
    const r = injectDocBlocks(zip, seq);
    expect(r.ok).toBe(true);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).not.toContain(DOCBLOCK_MARK);
    expect((xml.match(/<w:drawing>/g) || []).length).toBe(2);
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(1);
    // 结构：tc 含 p；tbl 后有 p
    expect(xml).toMatch(/<\/w:tbl>\s*<w:p/);
    const gridCols = (xml.match(/<w:gridCol /g) || []).length;
    const firstTrTcs = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/)!;
    expect(firstTrTcs[0].match(/<w:tc>/g)!.length).toBe(gridCols);
    expect(xml).toMatch(/<w:tc>[\s\S]*?<w:p>/);

    const rels = zip.file("word/_rels/document.xml.rels")!.asText();
    const imgRels = [
      ...rels.matchAll(
        /Type="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships\/image"[^>]*Target="([^"]+)"/g,
      ),
    ];
    expect(imgRels.length).toBe(2);
    for (const m of imgRels) {
      expect(m[1].startsWith("media/")).toBe(true);
    }
    const ct = zip.file("[Content_Types].xml")!.asText();
    expect(ct).toMatch(/Extension="png"/);
    const media = zip.file("word/media/img1.png");
    expect(media).toBeTruthy();
    expect(media!.asUint8Array().length).toBe(PNG_1x1.length);
  });

  it("尺寸：emuW≤版心且宽高比偏差 <1%", () => {
    const {emuW, emuH} = computeInlineEmu(200, 100);
    expect(emuW).toBeLessThanOrEqual(PAGE_W_EMU);
    const ratio = emuW / emuH;
    expect(Math.abs(ratio - 2) / 2).toBeLessThan(0.01);
  });

  it("空 blocks：删锚点且无新增 drawing/tbl", () => {
    const zip = miniZipWithAnchors(3);
    const r = injectDocBlocks(zip, [null, null, null]);
    expect(r.ok).toBe(true);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).not.toContain(DOCBLOCK_MARK);
    expect(xml).not.toContain("<w:drawing>");
    expect(xml).not.toContain("<w:tbl>");
  });
});

describe("DocTemplate · 模板零回归（空块）", () => {
  it("真实模板 render + 空 inject：无 DOCBLOCK、无注入表图", () => {
    const tplPath = join(__dirname, "../public/docTemplate-simple.docx");
    const buf = readFileSync(tplPath);
    const zip = new PizZip(buf);
    // 模板本身应有 1 个锚点定义
    const tplXml = zip.file("word/document.xml")!.asText();
    expect(tplXml).toContain(DOCBLOCK_MARK);
    expect(findDocBlockAnchors(tplXml).length).toBe(1);
    expect(tplXml).toContain("{#points}");

    const chapters = Doc.getChaptersFromContent(
      Doc.getContentFromMsg(
        "# T\n\n## 市场概览\n\n### 大盘规模\n#### 销量 7280 万\n\n### 品类结构\n",
      ),
    );
    expect(chapters[0].label.length).toBeGreaterThan(0);
    expect(chapters[0].paragraphs[0].label.length).toBeGreaterThan(0);
    expect(chapters[0].paragraphs[0].points.map((p) => p.label)).toEqual([
      "销量 7280 万",
    ]);
    for (const ch of chapters) {
      for (const p of ch.paragraphs) {
        p.setContent("一段测试正文。");
      }
    }
    const blockLists = prepareChaptersBlocks(chapters);
    expect(blockLists.every((b) => b.length === 0)).toBe(true);

    const doc = new Docxtemplater(zip, {paragraphLoop: true, linebreaks: true});
    doc.render({
      company: "c",
      department: "d",
      author: "a",
      curDate: "2026-1-1",
      title: "T",
      chapters,
    });
    const nPara = chapters.reduce((s, c) => s + c.paragraphs.length, 0);
    const payloads = Array.from({length: nPara}, () => null);
    const inj = injectDocBlocks(doc.getZip(), payloads);
    expect(inj.ok).toBe(true);
    const out = doc.getZip().file("word/document.xml")!.asText();
    expect(out).not.toContain(DOCBLOCK_MARK);
    // 模板里本就有编制单位等 tbl，只断言无 drawing（空块不插图）
    expect(out).not.toContain("<w:drawing>");
    expect(out).toContain("一段测试正文");
    expect(out).toContain("销量 7280 万");
    // 子点应落在 heading 3
    expect(out).toMatch(/w:pStyle w:val="3"[\s\S]{0,200}销量 7280 万/);
  });
});
