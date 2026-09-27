# -*- coding: utf-8 -*-
"""用 extracts snippet 里的 img_in_image_box 坐标，从整页 PNG 裁出元素图。

坐标空间：VL 版面坐标 ≈ PDF 页 pt × 2 = 2110 × 1190（x 观测最大 2055、y 最大 1102）。
整页图：3840 × 2160。
"""
import json
import os
import re

from PIL import Image

BASE = r"\\wsl.localhost\Ubuntu\home\hezl\bifang\backend\data\knowledge_base\服装"
P = os.path.join(BASE, "extracts", "抖音单品爆款分析-商务男士衬衫polo衫.jsonl")
ASSET_DIR = os.path.join(BASE, "assets", "抖音单品爆款分析-商务男士衬衫polo衫")
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out_bbox")
COORD_W, COORD_H = 2110.0, 1190.0

PAT = re.compile(r"img_in_image_box_(\d+)_(\d+)_(\d+)_(\d+)\.\w+")


def main(only_pages=None):
    rows = []
    with open(P, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    os.makedirs(OUT_DIR, exist_ok=True)
    index = []
    for r in rows:
        page = r.get("page")
        if only_pages and page not in only_pages:
            continue
        boxes = PAT.findall(r.get("snippet") or "")
        if not boxes:
            continue
        src = os.path.join(ASSET_DIR, "抖音单品爆款分析-商务男士衬衫polo衫_p%d_0.png" % page)
        im = Image.open(src)
        W, H = im.size
        sx, sy = W / COORD_W, H / COORD_H
        for i, (x0, y0, x1, y1) in enumerate(boxes):
            box = (int(int(x0) * sx), int(int(y0) * sy), int(int(x1) * sx), int(int(y1) * sy))
            tile = im.crop(box)
            name = "p%d_img%d.png" % (page, i + 1)
            tile.save(os.path.join(OUT_DIR, name))
            index.append(
                {
                    "page": page,
                    "page_type": r.get("page_type"),
                    "idx": i + 1,
                    "coord": [int(x0), int(y0), int(x1), int(y1)],
                    "px": list(box),
                    "size": list(tile.size),
                    "file": name,
                }
            )
    with open(os.path.join(OUT_DIR, "_index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print("裁出 %d 张" % len(index))
    for it in index:
        if it["page"] in (10, 14, 17, 1) or it["idx"] == 1:
            print(
                "p%-3s #%d coord=%s px=%s size=%dx%d"
                % (it["page"], it["idx"], it["coord"], it["px"], it["size"][0], it["size"][1])
            )
    print("out:", OUT_DIR)


if __name__ == "__main__":
    import sys

    only = None
    if len(sys.argv) > 1:
        only = {int(x) for x in sys.argv[1].split(",")}
    main(only)
