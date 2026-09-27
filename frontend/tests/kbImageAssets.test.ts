import {
  selectImageGridByCaptions,
  selectImageGridCandidates,
  scoreAssetAgainstCaption,
} from "@/components/DocUtil/kbImageAssetsCore";
import type {KbAssetLike} from "@/components/DocUtil/kbImageAssetsCore";

function asset(
  page: number,
  idx: number,
  kind: string = "image",
  snippet = "",
): KbAssetLike {
  return {
    kb_name: "服装",
    doc: "polo",
    file_name: "polo.pdf",
    asset_id: `elements/polo_p${page}_img${idx}.png`,
    page,
    kind,
    idx,
    url: "",
    snippet,
  };
}

describe("kbImageAssets", () => {
  it("picks up to 4 image assets in page order without reuse", () => {
    const all = [
      asset(9, 1),
      asset(9, 2),
      asset(10, 1),
      asset(10, 2),
      asset(10, 3),
    ];
    const used = new Set<string>();
    const a = selectImageGridCandidates(all, 4, used);
    expect(a).toHaveLength(4);
    expect(a.map((x) => x.page)).toEqual([9, 9, 10, 10]);
    const b = selectImageGridCandidates(all, 4, used);
    expect(b).toHaveLength(1);
    expect(b[0].idx).toBe(3);
  });

  it("scores caption tokens against snippet", () => {
    const a = asset(13, 1, "image", "腰腹加宽衬衫 卡帝乐鳄鱼 销量2895");
    expect(scoreAssetAgainstCaption(a, "腰腹加宽衬衫爆款", "趋势")).toBeGreaterThanOrEqual(2);
    expect(scoreAssetAgainstCaption(a, "无关系文字", "")).toBe(0.5); // kind bonus only
  });

  it("aligns by caption then falls back; manual wins slot", () => {
    const all = [
      asset(9, 1, "image", "纯色polo 销量TOP"),
      asset(12, 1, "image", "竖条纹衬衫 ¥399"),
      asset(13, 2, "image", "腰腹加宽 卡帝乐鳄鱼"),
      asset(14, 1, "image", "其他款式"),
    ];
    const used = new Set<string>();
    const picked = selectImageGridByCaptions(
      all,
      ["腰腹加宽衬衫", "竖条纹爆款", "纯色polo", "兜底"],
      {
        title: "爆款图鉴",
        manual: [
          null,
          null,
          { file_name: "polo.pdf", asset_id: "elements/polo_p14_img1.png" },
          null,
        ],
        usedIds: used,
        count: 4,
      },
    );
    expect(picked).toHaveLength(4);
    expect(picked[0].page).toBe(13);
    expect(picked[1].page).toBe(12);
    expect(picked[2].page).toBe(14); // manual
    expect(picked[3].page).toBe(9); // leftover by caption or order
  });

  it("fills empty slots around a mid manual pick", () => {
    const all = [asset(10, 1), asset(11, 1)];
    const picked = selectImageGridByCaptions(all, ["a", "b", "c", "d"], {
      manual: [
        null,
        null,
        { file_name: "polo.pdf", asset_id: "elements/polo_p11_img1.png" },
        null,
      ],
      count: 4,
    });
    // slot2=manual(p11); slot0/1/3 顺序补 p10 → dense [p10, p11]
    expect(picked.map((p) => p.page)).toEqual([10, 11]);
  });
});
