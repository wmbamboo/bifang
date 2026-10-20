/**
 * 九·2 / 九·5 / 九·7 纯函数金标（不拉 antd / kb 服务）
 */
import {
  applyManualFigureRef,
  buildFigureAssetAppendix,
  collectParagraphAllowedFigureRefLists,
  countBlockedFigures,
  countUnresolvedFigures,
  figureAssetsFromAssignedKeys,
  figureAssetsFromKbDocs,
  formatKbAssetRef,
  formatUploadAssetRef,
  isUploadAssetRef,
  normalizeKbAssetRef,
  parseKbAssetRef,
  previewFigureStatus,
  removeManualFigure,
} from "@/components/DocUtil/docFigureAssets";
import {
  filterTableBlockByEvidence,
  injectDocBlocks,
  MAX_IMG_BYTES,
  UPLOAD_GONE_REF,
  resolveAssetBytes,
  resolveBlocksToPayloads,
} from "@/components/DocUtil/DocBlockInjector";
import {
  saveUploadAsset,
  setUploadStorageForTest,
  type UploadStorage,
} from "@/components/DocUtil/docUploadAssets";
import PizZip from "pizzip";
import {
  Paragraph,
  absorbBlocksFromParagraphContent,
} from "@/components/DocUtil/ViewItem4Doc";
import {readFileSync} from "fs";
import {join} from "path";

describe("docFigureAssets", () => {
  it("空清单禁 figure", () => {
    const s = buildFigureAssetAppendix([]);
    expect(s).toMatch(/不要写/);
    expect(s).toMatch(/figure/);
  });

  it("有资产时拼 kb:file/asset 且 assetId 可含 /", () => {
    const s = buildFigureAssetAppendix([
      {
        fileName: "抖音单品.docx",
        assetId: "elements/p12_i1.png",
        caption: "编织肌理",
      },
    ]);
    expect(s).toContain("kb:抖音单品.docx/elements/p12_i1.png");
    expect(s).toMatch(/原样复制/);
  });

  it("从 docs 抽资产", () => {
    const assets = figureAssetsFromKbDocs([
      {
        source: "a.docx",
        asset_ids: ["elements/x.png", "elements/y.png"],
        snippet: "图注A",
      },
    ]);
    expect(assets).toHaveLength(2);
    expect(formatKbAssetRef(assets[0].fileName, assets[0].assetId)).toBe(
      "kb:a.docx/elements/x.png",
    );
  });

  it("7a′ 按 assigned keys 段级筛资产，不取未分配键", () => {
    const keyAssets = {
      "服装|a.pdf|1": {
        source: "a.pdf",
        asset_ids: ["elements/p1.png", "elements/p1b.png"],
        page: 1,
      },
      "服装|b.pdf|2": {
        source: "b.pdf",
        asset_ids: ["elements/p2.png"],
        page: 2,
      },
    };
    const got = figureAssetsFromAssignedKeys(
      ["服装|a.pdf|1"],
      keyAssets,
      6,
    );
    expect(got.map((x) => x.assetId)).toEqual([
      "elements/p1.png",
      "elements/p1b.png",
    ]);
    expect(got.every((x) => x.fileName === "a.pdf")).toBe(true);
    expect(figureAssetsFromAssignedKeys([], keyAssets)).toEqual([]);
    expect(
      buildFigureAssetAppendix(got),
    ).toContain("kb:a.pdf/elements/p1.png");
  });

  it("7c′ countUnresolvedFigures", () => {
    expect(
      countUnresolvedFigures([
        [{kind: "figure"}, {kind: "figure-missing"}],
        null,
        [{kind: "table"}],
      ]),
    ).toBe(1);
  });
});

describe("resolveAssetBytes 切分", () => {
  it("assetId 含 /", async () => {
    const got = await resolveAssetBytes("kb:doc.docx/elements/p1/i2.png", {
      kbName: "服装",
      fetchKbAsset: async ({file_name, asset_id}) => {
        expect(file_name).toBe("doc.docx");
        expect(asset_id).toBe("elements/p1/i2.png");
        return new ArrayBuffer(8);
      },
    });
    expect(got?.bytes.byteLength).toBe(8);
  });
});

describe("九·5 表数字闸门", () => {
  it("编造数字 → 丢表；证据内数字 → 保留", () => {
    const fake = filterTableBlockByEvidence(
      {
        kind: "table",
        caption: "假",
        rows: [
          ["品类", "销量"],
          ["衬衫", "999.9万"],
        ],
      },
      "证据里只有 3.3亿 与 polo 销量 403.7万",
    );
    expect(fake).toBeNull();

    const ok = filterTableBlockByEvidence(
      {
        kind: "table",
        caption: "真",
        rows: [
          ["品类", "GMV"],
          ["衬衫", "3.3亿"],
        ],
      },
      "衬衫 GMV 达 3.3亿",
    );
    expect(ok?.caption).toBe("真");
  });
});

describe("九·3 kbName 回归", () => {
  it("AiOutlineGenDoc 不得再传空 opts", () => {
    const src = readFileSync(
      join(__dirname, "../src/pages/AiOutlineGenDoc.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/resolveBlocksToPayloads\(\s*blockLists\s*,\s*\{\s*\}\s*\)/);
    expect(src).toMatch(/fetchKbAsset/);
    expect(src).toMatch(/kbName/);
    expect(src).toMatch(/allowedFigureRefsByList/);
  });
});

describe("二十三·13 ref 白名单", () => {
  it("collectParagraphAllowedFigureRefLists 同序", () => {
    const lists = collectParagraphAllowedFigureRefLists([
      {
        paragraphs: [
          {allowedFigureRefs: ["kb:a.pdf/x.png"], allowFigure: true},
          {allowFigure: false},
          {allowFigure: true},
        ],
      },
    ]);
    expect(lists).toEqual([["kb:a.pdf/x.png"], [], undefined]);
  });

  it("脏 ref → figure-blocked 且保留 caption；白名单命中才取图", async () => {
    const okRef = "kb:demo.pdf/elements/p1.png";
    const dirtyRef = "kb:demo.pdf/elements/p1_chart.png";
    let fetched = 0;
    const payloads = await resolveBlocksToPayloads(
      [
        [
          {kind: "figure", assetRef: dirtyRef, caption: "概览题"},
          {kind: "figure", assetRef: okRef, caption: "真图"},
        ],
      ],
      {
        kbName: "服装",
        allowedFigureRefs: [okRef],
        fetchKbAsset: async () => {
          fetched += 1;
          return new ArrayBuffer(16);
        },
      },
    );
    expect(payloads[0]).toHaveLength(2);
    expect(payloads[0]![0]).toMatchObject({
      kind: "figure-blocked",
      caption: "概览题",
    });
    expect(String((payloads[0]![0] as any).ref)).toMatch(/不在可用清单/);
    expect(payloads[0]![1]).toMatchObject({kind: "figure", caption: "真图"});
    expect(fetched).toBe(1);
    expect(countBlockedFigures(payloads)).toBe(1);
    expect(countUnresolvedFigures(payloads)).toBe(0);
  });

  it("空白名单禁全部 figure → blocked", async () => {
    const payloads = await resolveBlocksToPayloads(
      [[{kind: "figure", assetRef: "kb:a.pdf/x.png", caption: "c"}]],
      {
        kbName: "服装",
        allowedFigureRefsByList: [[]],
        fetchKbAsset: async () => new ArrayBuffer(8),
      },
    );
    expect(payloads[0]![0].kind).toBe("figure-blocked");
  });

  it("二十四·C：kb: 后空格归一后命中白名单", async () => {
    expect(normalizeKbAssetRef("kb: a.pdf/1 ")).toBe("kb:a.pdf/1");
    expect(normalizeKbAssetRef("`kb:a.pdf/1`")).toBe("kb:a.pdf/1");
    const p = new Paragraph(1, "段");
    p.setContent(
      "文\n```figure\nref: kb: a.pdf/1 \ncaption: 图\n```\n",
    );
    expect(p.blocks).toHaveLength(1);
    if (p.blocks[0].kind === "figure") {
      expect(p.blocks[0].assetRef).toBe("kb:a.pdf/1");
    }
    let fetched = 0;
    const payloads = await resolveBlocksToPayloads(
      [[{kind: "figure", assetRef: "kb: a.pdf/1 ", caption: "图"}]],
      {
        kbName: "服装",
        allowedFigureRefs: ["kb:a.pdf/1"],
        fetchKbAsset: async () => {
          fetched += 1;
          return new ArrayBuffer(8);
        },
      },
    );
    expect(payloads[0]![0].kind).toBe("figure");
    expect(fetched).toBe(1);
  });

  it("二十四·D：missing / blocked 分别计数", () => {
    expect(
      countUnresolvedFigures([
        [{kind: "figure-missing"}, {kind: "figure-blocked"}],
      ]),
    ).toBe(1);
    expect(
      countBlockedFigures([
        [{kind: "figure-missing"}, {kind: "figure-blocked"}],
      ]),
    ).toBe(1);
  });
});

describe("二十五 体积降采样 / 题注 SEQ / 占位文案", () => {
  it("超闸经 resizeImage hook 落地为 figure", async () => {
    const big = new ArrayBuffer(MAX_IMG_BYTES + 100);
    const small = new Uint8Array(64);
    const payloads = await resolveBlocksToPayloads(
      [[{kind: "figure", assetRef: "kb:a.pdf/big.png", caption: "大图"}]],
      {
        kbName: "服装",
        allowedFigureRefs: ["kb:a.pdf/big.png"],
        fetchKbAsset: async () => big,
        resizeImage: async () => ({
          bytes: small,
          mime: "image/jpeg",
          w: 900,
          h: 600,
        }),
      },
    );
    expect(payloads[0]![0]).toMatchObject({
      kind: "figure",
      mime: "image/jpeg",
      pxW: 900,
      pxH: 600,
    });
  });

  it("resize 失败 → figure-missing，ref 不带体积后缀", async () => {
    const big = new ArrayBuffer(MAX_IMG_BYTES + 50);
    const payloads = await resolveBlocksToPayloads(
      [[{kind: "figure", assetRef: "kb:a.pdf/big.png", caption: "大图"}]],
      {
        kbName: "服装",
        allowedFigureRefs: ["kb:a.pdf/big.png"],
        fetchKbAsset: async () => big,
        resizeImage: async () => null,
      },
    );
    expect(payloads[0]![0]).toMatchObject({
      kind: "figure-missing",
      caption: "大图",
      ref: "kb:a.pdf/big.png",
    });
    expect(String((payloads[0]![0] as any).ref)).not.toMatch(/>\d/);
  });

  it("题注 SEQ 缓存递增且 begin 带 dirty；占位无 kb:", () => {
    const zip = new PizZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t>⟦DOCBLOCK⟧</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>⟦DOCBLOCK⟧</w:t></w:r></w:p>` +
        `<w:sectPr/></w:body></w:document>`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    );
    const tiny = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    injectDocBlocks(zip, [
      [
        {
          kind: "figure",
          caption: "第一张",
          bytes: tiny,
          mime: "image/png",
          pxW: 100,
          pxH: 80,
        },
      ],
      [
        {
          kind: "figure-missing",
          caption: "缺图题",
          ref: "kb:secret.pdf/x.png（>1572864B）",
        },
        {kind: "table", caption: "对照表", rows: [["a", "b"], ["1", "2"]]},
      ],
    ]);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toMatch(/w:fldCharType="begin" w:dirty="true"/);
    const seqTs = [...xml.matchAll(/SEQ 图[\s\S]*?<w:t>(\d+)<\/w:t>/g)].map(
      (m) => m[1],
    );
    expect(seqTs).toEqual(["1", "2"]);
    const tblTs = [...xml.matchAll(/SEQ 表[\s\S]*?<w:t>(\d+)<\/w:t>/g)].map(
      (m) => m[1],
    );
    expect(tblTs).toEqual(["1"]);
    expect(xml).toMatch(/［图片缺失］/);
    expect(xml).not.toMatch(/kb:secret/);
    expect(xml).not.toMatch(/1572864/);
  });

  it("二十八·1：blocked 保留 caption 字段、注入无题注、诊断可测", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const payloads = await resolveBlocksToPayloads(
      [
        [
          {
            kind: "figure",
            assetRef: "kb:a.pdf/x.png",
            caption: "商务休闲风渗透",
          },
        ],
      ],
      {
        kbName: "服装",
        allowedFigureRefs: [],
        fetchKbAsset: async () => new ArrayBuffer(8),
      },
    );
    expect(payloads[0]![0]).toMatchObject({
      kind: "figure-blocked",
      caption: "商务休闲风渗透",
    });
    expect(warn).toHaveBeenCalledWith(
      "[DocBlock] figure-blocked",
      expect.objectContaining({allowed: 0, ref: "kb:a.pdf/x.png"}),
    );
    warn.mockRestore();

    const zip = new PizZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t>⟦DOCBLOCK⟧</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    );
    injectDocBlocks(zip, [
      [
        {
          kind: "figure-blocked",
          caption: "商务休闲风渗透",
          ref: "kb:a.pdf/x.png（不在可用清单）",
        },
      ],
    ]);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toMatch(/［图片不可用］/);
    expect(xml).not.toMatch(/SEQ 图/);
    expect(xml).not.toMatch(/商务休闲风渗透/);
  });
});

describe("三十三 parseKbAssetRef / 手选白名单 / 预判", () => {
  it("parseKbAssetRef：elements/ 形态", () => {
    expect(parseKbAssetRef("kb:抖音.pdf/elements/xxx_p4_img1.png")).toEqual({
      fileName: "抖音.pdf",
      assetId: "elements/xxx_p4_img1.png",
    });
  });

  it("parseKbAssetRef：whole/ 形态", () => {
    expect(parseKbAssetRef("kb:a.pdf/whole/page_4.png")).toEqual({
      fileName: "a.pdf",
      assetId: "whole/page_4.png",
    });
  });

  it("parseKbAssetRef：带空格 kb: 归一", () => {
    expect(parseKbAssetRef("kb: a.pdf/1")).toEqual({
      fileName: "a.pdf",
      assetId: "1",
    });
  });

  it("applyManualFigureRef 追加白名单且不重复", () => {
    const p = {
      blocks: [
        {kind: "figure" as const, assetRef: "kb:a.pdf/old.png", caption: "c"},
      ],
      allowedFigureRefs: ["kb:a.pdf/old.png"],
    };
    const next = applyManualFigureRef(p, 0, "kb:a.pdf/new.png");
    expect(next.blocks[0]).toMatchObject({assetRef: "kb:a.pdf/new.png"});
    expect(next.allowedFigureRefs).toEqual([
      "kb:a.pdf/old.png",
      "kb:a.pdf/new.png",
    ]);
    const again = applyManualFigureRef(
      {...p, ...next},
      0,
      "kb:a.pdf/new.png",
    );
    expect(again.allowedFigureRefs).toHaveLength(2);
  });

  it("previewFigureStatus：空清单 / 不在候选 / ok", () => {
    expect(
      previewFigureStatus({
        blocks: [{kind: "figure", assetRef: "kb:a.pdf/x.png"}],
        allowedFigureRefs: [],
      })[0],
    ).toMatchObject({ok: false, reason: "本段无可用插图资产"});
    expect(
      previewFigureStatus({
        blocks: [{kind: "figure", assetRef: "kb:a.pdf/x.png"}],
        allowedFigureRefs: ["kb:a.pdf/y.png"],
      })[0],
    ).toMatchObject({ok: false, reason: "ref 不在本段候选内"});
    expect(
      previewFigureStatus({
        blocks: [{kind: "figure", assetRef: "kb: a.pdf/x.png"}],
        allowedFigureRefs: ["kb:a.pdf/x.png"],
      })[0],
    ).toMatchObject({ok: true});
  });

  it("removeManualFigure 保留白名单", () => {
    const next = removeManualFigure(
      {
        blocks: [
          {kind: "figure", assetRef: "kb:a.pdf/x.png"},
          {kind: "table", caption: "t"},
        ],
        allowedFigureRefs: ["kb:a.pdf/x.png"],
      },
      0,
    );
    expect(next.blocks).toHaveLength(1);
    expect(next.allowedFigureRefs).toEqual(["kb:a.pdf/x.png"]);
  });
});

describe("三十五 本地上传 ref / 存储 / 降级", () => {
  const mem = (): UploadStorage => {
    const m = new Map<string, any>();
    return {
      async get(k) {
        return m.get(k);
      },
      async set(k, v) {
        m.set(k, v);
      },
      async delete(k) {
        m.delete(k);
      },
      async keys() {
        return [...m.keys()];
      },
    };
  };

  afterEach(() => {
    setUploadStorageForTest(null);
  });

  it("formatUploadAssetRef / isUploadAssetRef", () => {
    expect(formatUploadAssetRef("u_abc")).toBe("upload:u_abc");
    expect(isUploadAssetRef("upload:u_abc")).toBe(true);
    expect(isUploadAssetRef("kb:a.pdf/1")).toBe(false);
  });

  it("mime 拒绝 webp", async () => {
    setUploadStorageForTest(mem());
    const got = await saveUploadAsset(null, {
      mime: "image/webp",
      name: "a.webp",
      bytes: new ArrayBuffer(64),
    });
    expect(got).toBeNull();
  });

  it("超体积经 resizeImage hook 压缩后 key 格式 u_", async () => {
    setUploadStorageForTest(mem());
    const big = new ArrayBuffer(MAX_IMG_BYTES + 200);
    const small = new Uint8Array(32);
    const got = await saveUploadAsset(null, {
      mime: "image/png",
      name: "big.png",
      bytes: big,
      resizeImage: async () => ({
        bytes: small,
        mime: "image/jpeg",
        w: 800,
        h: 600,
      }),
    });
    expect(got).not.toBeNull();
    expect(got!.key).toMatch(/^u_/);
    expect(got!.bytes).toBe(32);
  });

  it("手选 upload ref 写入白名单", () => {
    const ref = formatUploadAssetRef("u_test1");
    const next = applyManualFigureRef(
      {
        blocks: [{kind: "figure", assetRef: "kb:a.pdf/x.png"}],
        allowedFigureRefs: ["kb:a.pdf/x.png"],
      },
      0,
      ref,
    );
    expect(next.allowedFigureRefs).toContain(ref);
    expect(next.blocks[0]).toMatchObject({assetRef: ref});
  });

  it("读不到 upload → 本地上传失效文案（非图片不可用）", async () => {
    const payloads = await resolveBlocksToPayloads(
      [
        [
          {
            kind: "figure",
            assetRef: "upload:u_missing",
            caption: "本地图",
          },
        ],
      ],
      {
        allowedFigureRefs: ["upload:u_missing"],
        resolveUpload: async () => null,
      },
    );
    expect(payloads[0]![0]).toMatchObject({
      kind: "figure-missing",
      ref: UPLOAD_GONE_REF,
    });
    const zip = new PizZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t>⟦DOCBLOCK⟧</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    );
    injectDocBlocks(zip, [
      [
        {
          kind: "figure-missing",
          caption: "本地图",
          ref: UPLOAD_GONE_REF,
        },
      ],
    ]);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toMatch(/本地上传图已失效，请重新上传/);
    expect(xml).not.toMatch(/图片不可用/);
  });
});
