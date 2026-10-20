/**
 * 九·2 / 九·5 / 九·7 纯函数金标（不拉 antd / kb 服务）
 */
import {
  buildFigureAssetAppendix,
  collectParagraphAllowedFigureRefLists,
  countBlockedFigures,
  countUnresolvedFigures,
  figureAssetsFromAssignedKeys,
  figureAssetsFromKbDocs,
  formatKbAssetRef,
  normalizeKbAssetRef,
} from "@/components/DocUtil/docFigureAssets";
import {
  filterTableBlockByEvidence,
  resolveAssetBytes,
  resolveBlocksToPayloads,
} from "@/components/DocUtil/DocBlockInjector";
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
