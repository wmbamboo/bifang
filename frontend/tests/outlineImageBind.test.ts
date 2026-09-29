import {
  mergeImageAssetTips,
  parseEvidenceAssetChunks,
  pickEvidenceAssetsForGrid,
  preferredAssetIdsFromImageTips,
} from "@/components/DocUtil/outlineImageBind";
import {selectImageGridByCaptions} from "@/components/DocUtil/kbImageAssetsCore";
import type {KbAssetLike} from "@/components/DocUtil/kbImageAssetsCore";

describe("outlineImageBind", () => {
  const evidence = [
    "⟦chunk:1|page:5|src:other.pdf|assets:elements/other_p5_img1.png⟧\n衬衫店铺榜 罗蒙",
    "⟦chunk:2|page:16|src:polo.pdf|assets:elements/polo_p16_img1.png,elements/polo_p16_img2.png,elements/polo_p16_img3.png,elements/polo_p16_img4.png⟧\n编织肌理Polo衫 ¥119.9 ¥99 ¥65.8",
  ].join("\n\n");

  it("parses assets from chunk headers", () => {
    const chunks = parseEvidenceAssetChunks(evidence);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].assetIds).toHaveLength(4);
    expect(chunks[1].src).toBe("polo.pdf");
  });

  it("picks page matching caption tokens (p16 not p5)", () => {
    const refs = pickEvidenceAssetsForGrid(
      evidence,
      ["编织肌理Polo衫 ¥119.9", "¥99", "¥65.8", "¥29.9"],
      4,
    );
    expect(refs.map((r) => r.asset_id)).toEqual([
      "elements/polo_p16_img1.png",
      "elements/polo_p16_img2.png",
      "elements/polo_p16_img3.png",
      "elements/polo_p16_img4.png",
    ]);
    expect(refs[0].file_name).toBe("polo.pdf");
  });

  it("merges img tips without dropping captions", () => {
    const tips = mergeImageAssetTips(
      ["编织肌理 ¥119.9", "img: stale.pdf|elements/x.png"],
      [
        {
          file_name: "polo.pdf",
          asset_id: "elements/polo_p16_img1.png",
        },
      ],
    );
    // 已有非空 img 保留
    expect(tips.some((t) => t.includes("stale.pdf"))).toBe(true);
    expect(tips[0]).toContain("编织肌理");
  });

  it("preferredAssetIds drive slot order over cross-doc caption match", () => {
    const assets: KbAssetLike[] = [
      {
        asset_id: "elements/other_p5_img1.png",
        file_name: "other.pdf",
        page: 5,
        kind: "image",
        idx: 1,
        snippet: "罗蒙 ¥129 大肚人群 5.3万",
      },
      {
        asset_id: "elements/polo_p16_img1.png",
        file_name: "polo.pdf",
        page: 16,
        kind: "image",
        idx: 1,
        snippet: "编织肌理 ¥119.9",
      },
      {
        asset_id: "elements/polo_p16_img2.png",
        file_name: "polo.pdf",
        page: 16,
        kind: "image",
        idx: 2,
        snippet: "¥99",
      },
    ];
    const picked = selectImageGridByCaptions(
      assets,
      ["罗蒙爆款", "第二格"],
      {
        preferredAssetIds: [
          "elements/polo_p16_img1.png",
          "elements/polo_p16_img2.png",
        ],
        count: 2,
      },
    );
    expect(picked.map((p) => p.page)).toEqual([16, 16]);
  });

  it("preferredAssetIdsFromImageTips", () => {
    expect(
      preferredAssetIdsFromImageTips(
        "cap\nimg: polo.pdf|elements/polo_p16_img1.png\nimg: |elements/polo_p16_img2.png",
      ),
    ).toEqual([
      "elements/polo_p16_img1.png",
      "elements/polo_p16_img2.png",
    ]);
  });
});
