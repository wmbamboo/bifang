/**
 * 七·8.6 人工目检样本生成器（本地跑，产出一份可目检的 docx）。
 *
 * 为什么单独放一个文件：七·8.6 要求「用 Word 打开看」，此前被当成「必须依赖产品 UI」——
 * 其实不必。直接构造 chapters + blocks → render → injectDocBlocks，
 * 就能产出一份覆盖全部注入分支的 docx。**这样第七章的目检不阻塞第八章的 UI 修复。**
 *
 * 跑法（在 frontend/ 下）：
 *   node node_modules/jest/bin/jest.js --config jest.config.js tests/DocBlockPreview --runInBand
 * 产出：<repo>/.workbuddy/out/docblock-preview.docx
 *
 * 覆盖分支（每条都写进了正文/题注，打开即可对照）：
 *   ① 长表 8 行×4 列 → 跨页时表头是否重复、列宽是否均分、题注「表 1」
 *   ② 竖图 396×879  → 高受限分支（按版心高 80% 缩，宽度明显窄于版心）
 *   ③ 横图 635×300  → 宽受限分支（吃满版心宽 95%）
 *   ④ 小图 398×400  → 不放大分支（约 10.5cm，不应被拉到版心宽）
 *   ⑤ 单图 >1.5MB  → 降级为红字「［图片缺失：…（>1572864B）］」
 *   ⑥ ref 取不到  → 降级为红字「［图片缺失］」
 * 另需在 Word 里 Ctrl+A → F9，确认目录页码与「表 1 / 图 1…图 4」编号正确。
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "fs";
import {join} from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {Chapter, Paragraph} from "@/components/DocUtil/ViewItem4Doc";
import {
  injectDocBlocks,
  prepareChaptersBlocks,
  resolveBlocksToPayloads,
  type ResolveUploadBytes,
} from "@/components/DocUtil/DocBlockInjector";

/**
 * 本地 UNC 路径下必须先 mock 掉 kb 服务：DocBlockInjector 顶层 import 它，
 * 而它拉起的 pino/thread-stream 在 worker 里解析 UNC file URL 会抛
 * `ERR_INVALID_FILE_URL_PATH` 并杀掉进程（详见 DocTemplate.test.ts 同处注释）。
 * 本套件只用 `upload:` 分支喂自备字节，不碰 KB 接口。
 */
jest.mock("@/services/chatchat/kb", () => ({
  fetchAssetBytes: async () => {
    throw new Error("DocBlockPreview 不应调用 fetchAssetBytes");
  },
}));

/** 真实知识库图资产（本地存在则用真图，CI 上回退小图，保证用例不红） */
const KB_ASSETS = join(__dirname, "../../backend/data/knowledge_base/服装/assets");
const IMG_PORTRAIT =
  "抖音单品爆款分析-商务男士衬衫polo衫/elements/抖音单品爆款分析-商务男士衬衫polo衫_p10_img4.png";
const IMG_LANDSCAPE = "2024抖音服饰行业趋势报告/2024抖音服饰行业趋势报告_p61_3.png";
const IMG_SMALL =
  "抖音单品爆款分析-商务男士衬衫polo衫/elements/抖音单品爆款分析-商务男士衬衫polo衫_p3_img3.png";
const IMG_OVERSIZE =
  "抖音单品爆款分析-商务男士衬衫polo衫/抖音单品爆款分析-商务男士衬衫polo衫_p4_0.png";

/** 1×1 PNG 兜底 */
const PNG_1x1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function loadImg(rel: string): {bytes: Uint8Array; real: boolean} {
  const p = join(KB_ASSETS, rel);
  if (!existsSync(p)) return {bytes: PNG_1x1, real: false};
  return {bytes: new Uint8Array(readFileSync(p)), real: true};
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

describe("DocBlock 目检样本生成", () => {
  it("产出 docblock-preview.docx", async () => {
    const map: Record<string, string> = {
      portrait: IMG_PORTRAIT,
      landscape: IMG_LANDSCAPE,
      small: IMG_SMALL,
      oversize: IMG_OVERSIZE,
    };
    const resolveUpload: ResolveUploadBytes = async (key) => {
      if (key === "oversize") {
        // 1.6MB 合成字节：稳定触发 >MAX_IMG_BYTES 分支。
        // 该分支先判大小、后读尺寸（DocBlockInjector L339-347），所以不必是合法图像，
        // 这样 CI 上没有真实 KB 图时也能验到降级分支。
        return {bytes: new ArrayBuffer(1_600_000), mime: "image/png"};
      }
      const rel = map[key];
      if (!rel) return null;
      const {bytes} = loadImg(rel);
      return {bytes: toArrayBuffer(bytes), mime: "image/png"};
    };

    const ch1 = new Chapter(1, "第一章 表格与跨页");
    const p1 = new Paragraph(1, "1.1 各价格带销量对比（长表 8 行）");
    p1.setContent(
      "目检要点：表格是否为 8 行 × 4 列、首行灰底加粗、列宽均分；" +
        "若表格跨页，第二页表头应自动重复；表上方应有居中题注「表 1 …」。" +
        "四列文字密度不同（「¥1000以上」最长、「占比」最短），用于确认列宽均分是否够用。",
    );
    p1.blocks = [
      {
        kind: "table",
        caption: "各价格带销量与 GMV 对比（目检：跨页表头是否重复）",
        rows: [
          ["价格带", "销量(万件)", "GMV(万元)", "占比"],
          ["¥0-50", "12.4", "486.2", "4.1%"],
          ["¥50-100", "38.7", "2918.5", "12.8%"],
          ["¥100-200", "56.9", "8214.0", "18.8%"],
          ["¥200-300", "41.2", "9876.3", "13.6%"],
          ["¥300-500", "22.8", "7455.1", "7.5%"],
          ["¥500-1000", "9.6", "6120.4", "3.2%"],
          ["¥1000以上", "2.1", "3880.9", "0.7%"],
        ],
      },
    ];
    ch1.paragraphs = [p1];

    const ch2 = new Chapter(2, "第二章 插图四种分支");
    const p2 = new Paragraph(1, "2.1 竖图（高受限）");
    p2.setContent(
      "目检要点：源图 396×879，瘦高。应**按版心高 80% 为上限缩放**，" +
        "因此图片高度约 18.9cm、宽度只有约 8.5cm（明显窄于版心），且不拉伸变形。",
    );
    p2.blocks = [
      {kind: "figure", assetRef: "upload:portrait", caption: "竖图 396×879（高受限分支）"},
    ];

    const p3 = new Paragraph(2, "2.2 横图（宽受限）");
    p3.setContent(
      "目检要点：源图 635×300，扁宽。应**吃满版心宽 95%**（约 14.1cm），高度约 6.7cm；" +
        "图与上一张竖图之间应有间距，两图各自居中。",
    );
    p3.blocks = [
      {kind: "figure", assetRef: "upload:landscape", caption: "横图 635×300（宽受限分支）"},
    ];

    const p4 = new Paragraph(3, "2.3 小图（不放大）");
    p4.setContent(
      "目检要点：源图 398×400，接近正方形且像素小。**不应被放大到版心宽**——" +
        "按 96dpi 原尺寸约 10.5cm × 10.6cm，两侧留白应明显。这条是「不放大小图」的回归。",
    );
    p4.blocks = [
      {kind: "figure", assetRef: "upload:small", caption: "小图 398×400（不放大分支）"},
    ];

    const p5 = new Paragraph(4, "2.4 两种降级（缺失占位）");
    p5.setContent(
      "目检要点：本段下方应出现**两处红字占位**，且题注保留、正文继续——" +
        "绝不能因为取图失败而整篇放弃或抛错。",
    );
    p5.blocks = [
      {
        kind: "figure",
        assetRef: "upload:oversize",
        caption: "超大图 1.95MB（应降级：>1572864B）",
      },
      {kind: "figure", assetRef: "kb:不存在的文档/none.png", caption: "ref 取不到（应降级：图片缺失）"},
    ];

    const p6 = new Paragraph(5, "2.5 无块段落（对照组）");
    p6.setContent(
      "本段不带任何块。目检要点：这一段下方**不应出现空表格、空行或残留锚点符号**——" +
        "即锚点段被干净删除，不留痕迹。",
    );
    ch2.paragraphs = [p2, p3, p4, p5, p6];

    const chapters = [ch1, ch2];

    const blockLists = prepareChaptersBlocks(chapters);
    expect(blockLists.length).toBe(6);

    const payloads = await resolveBlocksToPayloads(blockLists, {resolveUpload});
    expect(payloads.length).toBe(6);
    expect(payloads[0]?.[0].kind).toBe("table");
    expect(payloads[1]?.[0].kind).toBe("figure");
    expect(payloads[4]?.[0].kind).toBe("figure-missing");
    expect(payloads[4]?.[1].kind).toBe("figure-missing");
    expect(payloads[5]).toBeNull();

    const tplPath = join(__dirname, "../public/docTemplate-simple.docx");
    const zip = new PizZip(readFileSync(tplPath));
    const doc = new Docxtemplater(zip, {paragraphLoop: true, linebreaks: true});
    doc.render({
      company: "毕方",
      department: "AI 智能工作室",
      author: "目检样本",
      curDate: "2026-9-28",
      title: "Word 表图注入 · 目检样本",
      chapters,
    });

    const inj = injectDocBlocks(doc.getZip(), payloads);
    expect(inj.ok).toBe(true);

    const outDir = join(__dirname, "../../.workbuddy/out");
    mkdirSync(outDir, {recursive: true});
    const outPath = join(outDir, "docblock-preview.docx");
    writeFileSync(outPath, doc.getZip().generate({type: "nodebuffer", compression: "DEFLATE"}));

    const xml = doc.getZip().file("word/document.xml")!.asText();
    expect(xml).not.toContain("⟦DOCBLOCK⟧");
    expect((xml.match(/<w:drawing>/g) || []).length).toBe(3);

    // eslint-disable-next-line no-console
    console.log(
      `\n[目检样本] ${outPath}\n` +
        `  段落 ${blockLists.length} 段 · 表 1 个 · 图 3 张 · 缺失占位 2 处\n` +
        `  下一步：用 Word 打开 → Ctrl+A → F9 更新域 → 对照各段正文的「目检要点」\n`,
    );
  });
});
