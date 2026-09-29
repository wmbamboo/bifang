/**
 * 九·2 / 九·5 / 九·7 纯函数金标（不拉 antd / kb 服务）
 */
import {
  buildFigureAssetAppendix,
  figureAssetsFromKbDocs,
  formatKbAssetRef,
} from "@/components/DocUtil/docFigureAssets";
import {
  filterTableBlockByEvidence,
  resolveAssetBytes,
} from "@/components/DocUtil/DocBlockInjector";
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
  });
});
