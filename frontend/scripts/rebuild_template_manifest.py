#!/usr/bin/env python3
"""从 pptTemplate-simple.pptx 重建 template-manifest.json（双份逐字节一致）。

权威页表见 .workbuddy/workbuddy-to-cursor.md 第六章。
不要用页内 progress*/List*/imageList* 小字标记当数据源。
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PPTX = ROOT / "public" / "pptTemplate-simple.pptx"
OUT_PUBLIC = ROOT / "public" / "template-manifest.json"
OUT_SRC = ROOT / "src" / "components" / "DocUtil" / "template-manifest.json"

EMU_PER_IN = 914400.0

# 页号 → layout（与交接权威表一致；progress/list 槽位同形，不能只靠占位符推断）
LAYOUT_BY_PAGE = {
    1: "cover",
    2: "chapterCover",
    3: "catalog",
    4: "catalog",
    5: "catalog",
    **{p: "progress" for p in range(6, 15)},
    **{p: "list" for p in range(15, 27)},
    **{p: "metric" for p in range(27, 31)},
    **{p: "columns" for p in range(31, 35)},
    **{p: "metric_columns" for p in range(35, 40)},
    **{p: "metric_list" for p in range(40, 45)},
    **{p: "table" for p in range(45, 49)},
    49: "image_grid",
    50: "tail",
}


def extract_slots(xml: str) -> set[str]:
    texts = re.findall(r"<a:t[^>]*>([^<]*)</a:t>", xml)
    joined = "".join(texts)
    raw = set(re.findall(r"\{([A-Za-z0-9_.]+)\}", joined))
    raw |= set(re.findall(r"\{([A-Za-z0-9_.]+)\}", xml))
    clean: set[str] = set()
    for s in raw:
        if re.fullmatch(r"[0-9A-Fa-f-]{36}", s):
            continue
        if re.fullmatch(r"\d+", s):
            continue
        if len(s) > 64 or " " in s:
            continue
        if any(x in s for x in ("typeface", "rPr", "latin", "</")):
            continue
        clean.add(s)
    return clean


def emu_to_in(v: str | int | float) -> float:
    return round(int(v) / EMU_PER_IN, 4)


def shape_boxes_with_text(xml: str) -> list[dict]:
    """粗提顶层 sp/pic/grpSp 的 off/ext + 内部文本（用于 unit 几何）。"""
    boxes: list[dict] = []

    def add_box(chunk: str, tag: str) -> None:
        if tag == "grpSp":
            gxf = re.search(r"<p:grpSpPr>[\s\S]*?<a:xfrm>([\s\S]*?)</a:xfrm>", chunk)
            if not gxf:
                return
            frag = gxf.group(1)
            off = re.search(r'<a:off[^>]*\bx="(\d+)"[^>]*\by="(\d+)"', frag)
            ext = re.search(r'<a:ext[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"', frag)
        else:
            off = re.search(r'<a:off[^>]*\bx="(\d+)"[^>]*\by="(\d+)"', chunk)
            ext = re.search(r'<a:ext[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"', chunk)
        if not off or not ext:
            return
        texts = re.findall(r"<a:t[^>]*>([^<]*)</a:t>", chunk)
        joined = "".join(texts)
        slots = set(re.findall(r"\{([A-Za-z0-9_.]+)\}", joined))
        boxes.append(
            {
                "tag": tag,
                "x": emu_to_in(off.group(1)),
                "y": emu_to_in(off.group(2)),
                "w": emu_to_in(ext.group(1)),
                "h": emu_to_in(ext.group(2)),
                "slots": slots,
                "text": joined,
            }
        )

    # 顶层节点（与 templateClone.parseTopLevelNodes 同思路）
    tree = re.search(r"<p:spTree\b[^>]*>([\s\S]*)</p:spTree>", xml)
    if not tree:
        return boxes
    inner = tree.group(1)
    i = 0
    while i < len(inner):
        m = re.search(r"<p:(grpSp|sp|pic)\b", inner[i:])
        if not m:
            break
        abs_i = i + m.start()
        tag = m.group(1)
        j = abs_i
        depth = 0
        end = None
        while j < len(inner):
            m2 = re.search(r"</?p:(grpSp|sp|pic|cxnSp)\b[^>]*/?>", inner[j:])
            if not m2:
                break
            tok = m2.group(0)
            at = j + m2.start()
            if tok.startswith("</"):
                depth -= 1
                if depth == 0:
                    end = j + m2.end()
                    break
            elif tok.endswith("/>"):
                if depth == 0:
                    end = j + m2.end()
                    break
            else:
                depth += 1
            j = at + len(tok)
        if end is None:
            break
        add_box(inner[abs_i:end], tag)
        i = end
    return boxes


def unit_for(layout: str, cards: int | None, slots: set[str], boxes: list[dict]) -> dict | None:
    """尽力从 item1 / col1 / cap1 推 unit；推不出则省略。"""
    if layout in ("cover", "chapterCover", "catalog", "tail", "table"):
        return None

    proto = None
    unit_kind = None
    axis = "y"
    if layout in ("list", "progress", "metric"):
        proto = "vItem.item1"
        unit_kind = "list_row" if layout != "metric" else "card"
    elif layout == "columns":
        proto = "col1Title"
        unit_kind = "col_group"
        axis = "x"
    elif layout == "image_grid":
        proto = "cap1"
        unit_kind = "pic_with_cap"
        axis = "grid"
    elif layout in ("metric_columns", "metric_list"):
        proto = "vItem.item1"
        unit_kind = "card"
        axis = "x"
    else:
        return None

    # columns：用整列 grpSp 包络，禁止用量到标题框
    if layout == "columns":
        col_grps = [
            b
            for b in boxes
            if b.get("tag") == "grpSp"
            and any(re.match(r"col\d+Title$", s) for s in b["slots"])
        ]
        if col_grps:
            xs = [b["x"] for b in col_grps]
            ys = [b["y"] for b in col_grps]
            rights = [b["x"] + b["w"] for b in col_grps]
            bottoms = [b["y"] + b["h"] for b in col_grps]
            # pitch：按 x 排序相邻差
            ordered = sorted(col_grps, key=lambda b: b["x"])
            pitch = (
                round(ordered[1]["x"] - ordered[0]["x"], 4)
                if len(ordered) >= 2
                else None
            )
            unit = {
                "axis": "x",
                "band": [
                    round(min(xs), 4),
                    round(min(ys), 4),
                    round(max(rights) - min(xs), 4),
                    round(max(bottoms) - min(ys), 4),
                ],
                "proto": "col1Title",
                "unitSize": [ordered[0]["w"], ordered[0]["h"]],
                "minN": 2,
                "maxN": 9,
                "fontLadder": {"3": 0, "6": -1, "8": -2},
                "align": "stretch",
            }
            if pitch is not None:
                unit["pitch"] = pitch
            return {"unitKind": "col_group", "unit": unit}

    # image_grid：band 必须含 pic 顶，不能只从 cap 起算
    if layout == "image_grid":
        pics = [b for b in boxes if b.get("tag") == "pic"]
        caps = [
            b
            for b in boxes
            if any(re.match(r"cap\d+$", s) for s in b["slots"])
        ]
        if pics and caps:
            xs = [b["x"] for b in pics + caps]
            ys = [b["y"] for b in pics]
            rights = [b["x"] + b["w"] for b in pics + caps]
            bottoms = [b["y"] + b["h"] for b in caps]
            pic0 = sorted(pics, key=lambda b: (b["y"], b["x"]))[0]
            return {
                "unitKind": "pic_with_cap",
                "unit": {
                    "axis": "grid",
                    "band": [
                        round(min(xs), 4),
                        round(min(ys), 4),
                        round(max(rights) - min(xs), 4),
                        round(max(bottoms) - min(ys), 4),
                    ],
                    "proto": "cap1",
                    "unitSize": [pic0["w"], pic0["h"]],
                    "minN": 2,
                    "maxN": 9,
                    "fontLadder": {"3": 0, "6": -1, "8": -2},
                    "align": "stretch",
                },
            }

    def has_proto(b: dict, p: str) -> bool:
        return any(s == p or s.startswith(p + "_") for s in b["slots"])

    protos = [b for b in boxes if has_proto(b, proto)]
    if not protos and layout == "image_grid":
        protos = [b for b in boxes if "cap1" in b["slots"]]

    if not protos:
        return {
            "unitKind": unit_kind,
            "unit": {
                "axis": axis,
                "proto": proto,
                "minN": 2 if layout == "metric" else 3,
                "maxN": 9,
                "fontLadder": {"3": 0, "6": -1, "8": -2},
                "align": "stretch",
            },
        }

    indexed: dict[int, list[dict]] = defaultdict(list)
    for b in boxes:
        for s in b["slots"]:
            m = None
            if layout in ("list", "progress", "metric", "metric_columns", "metric_list"):
                m = re.match(r"vItem\.item(\d+)$", s)
            elif layout == "columns":
                m = re.match(r"col(\d+)Title$", s)
            elif layout == "image_grid":
                m = re.match(r"cap(\d+)$", s)
            if m:
                indexed[int(m.group(1))].append(b)

    reps: dict[int, dict] = {}
    for k, lst in indexed.items():
        reps[k] = max(lst, key=lambda b: b["w"] * b["h"])

    p1 = reps.get(1) or protos[0]
    unit_size = [p1["w"], p1["h"]]
    pitch = None
    if 1 in reps and 2 in reps:
        a, b = reps[1], reps[2]
        dx, dy = abs(b["x"] - a["x"]), abs(b["y"] - a["y"])
        pitch = round(dx if dx >= dy else dy, 4)
        if dx >= dy:
            axis = "x" if layout != "list" or dx > dy * 1.2 else axis
        else:
            axis = "y"

    band_src = list(reps.values()) if reps else protos
    xs = [b["x"] for b in band_src]
    ys = [b["y"] for b in band_src]
    rights = [b["x"] + b["w"] for b in band_src]
    bottoms = [b["y"] + b["h"] for b in band_src]
    band = [
        round(min(xs), 4),
        round(min(ys), 4),
        round(max(rights) - min(xs), 4),
        round(max(bottoms) - min(ys), 4),
    ]

    out: dict = {
        "axis": axis,
        "band": band,
        "proto": proto,
        "unitSize": unit_size,
        "minN": 2 if layout in ("metric", "columns", "metric_columns", "metric_list") else 3,
        "maxN": 9,
        "fontLadder": {"3": 0, "6": -1, "8": -2},
        "align": "stretch",
    }
    if pitch is not None:
        out["pitch"] = pitch
    return {"unitKind": unit_kind, "unit": out}


def analyze_slide(num: int, xml: str) -> dict:
    layout = LAYOUT_BY_PAGE[num]
    slots = extract_slots(xml)
    boxes = shape_boxes_with_text(xml)

    v_max = max(
        (int(m.group(1)) for s in slots if (m := re.match(r"vItem\.item(\d+)$", s))),
        default=0,
    )
    v2_max = max(
        (int(m.group(1)) for s in slots if (m := re.match(r"vItem2\.item(\d+)$", s))),
        default=0,
    )
    col_max = max(
        (int(m.group(1)) for s in slots if (m := re.match(r"col(\d+)Title$", s))),
        default=0,
    )
    cells = [
        (int(a), int(b))
        for s in slots
        if (m := re.match(r"cell_r(\d+)c(\d+)$", s))
        for a, b in [m.groups()]
    ]
    rows = (max(r for r, _ in cells) + 1) if cells else 0
    cols_tbl = (max(c for _, c in cells) + 1) if cells else 0
    caps = max(
        (int(m.group(1)) for s in slots if (m := re.match(r"cap(\d+)$", s))),
        default=0,
    )
    chapter_n = sum(1 for s in slots if re.fullmatch(r"chapterTitle\d+", s))

    page: dict = {"page": num, "layout": layout}

    if layout == "catalog":
        page["cards"] = chapter_n or (num - 2 + 2)  # 3/4/5
        page["slots"] = [f"chapterTitle{i}" for i in range(1, page["cards"] + 1)]
    elif layout in ("progress", "list", "metric"):
        page["cards"] = v_max
        page["slots"] = ["slideTitle", "vItem.itemN", "vItem.itemN_Desc"]
    elif layout == "columns":
        page["cols"] = col_max
        page["slots"] = ["slideTitle", "colKTitle", "colKSub", "colK.itemM"]
    elif layout == "metric_columns":
        page["cards"] = v_max
        page["cols"] = col_max
        page["slots"] = ["slideTitle", "vItem.itemN", "colKTitle", "colK.itemM"]
    elif layout == "metric_list":
        page["cards"] = v_max
        page["lists"] = v2_max
        page["slots"] = ["slideTitle", "vItem.itemN", "vItem2.itemN"]
    elif layout == "table":
        page["rows"] = rows
        page["cols"] = cols_tbl
        # 列出全部 cell 槽利于调试
        cell_slots = sorted(
            (s for s in slots if s.startswith("cell_")),
            key=lambda s: (
                int(re.search(r"r(\d+)", s).group(1)),
                int(re.search(r"c(\d+)", s).group(1)),
            ),
        )
        page["slots"] = ["slideTitle", "tableTitle", *cell_slots]
    elif layout == "image_grid":
        page["cards"] = caps or 4
        page["slots"] = ["slideTitle", *[f"cap{i}" for i in range(1, (caps or 4) + 1)]]
    elif layout == "cover":
        page["slots"] = sorted(
            s
            for s in slots
            if s in ("title", "subtitle", "company", "author", "department", "curDate")
        ) or ["title", "subtitle", "company", "author", "department", "curDate"]
    elif layout == "chapterCover":
        page["slots"] = ["chapterTitle", "chapterSubTitle"]
    elif layout == "tail":
        page["slots"] = sorted(
            s for s in slots if s in ("title", "company", "author", "department", "curDate")
        ) or ["company", "author", "department"]

    unit_meta = unit_for(layout, page.get("cards"), slots, boxes)
    if unit_meta:
        page["unitKind"] = unit_meta["unitKind"]
        page["unit"] = unit_meta["unit"]

    return page


def assign_skins(pages: list[dict]) -> None:
    """同 layout 内按 page 升序，count 回绕（相对前页变小）则 skin+1；skin0 不写字段。"""
    by_layout: dict[str, list[dict]] = defaultdict(list)
    for p in pages:
        if p["layout"] in ("progress", "list"):
            by_layout[p["layout"]].append(p)
    for layout, group in by_layout.items():
        group.sort(key=lambda p: p["page"])
        skin = 0
        prev = None
        for p in group:
            count = p.get("cards") or 0
            if prev is not None and count < prev:
                skin += 1
            if skin > 0:
                p["skin"] = skin
            prev = count


def build_manifest() -> dict:
    if not PPTX.is_file():
        raise SystemExit(f"missing pptx: {PPTX}")
    with zipfile.ZipFile(PPTX) as z:
        slide_names = []
        for n in z.namelist():
            m = re.match(r"ppt/slides/slide(\d+)\.xml$", n)
            if m:
                slide_names.append((int(m.group(1)), n))
        slide_names.sort()
        if len(slide_names) != 50:
            print(f"WARN: expected 50 slides, got {len(slide_names)}", file=sys.stderr)
        pages = []
        for num, name in slide_names:
            xml = z.read(name).decode("utf-8", errors="replace")
            pages.append(analyze_slide(num, xml))
    assign_skins(pages)
    return {
        "template": "pptTemplate-simple.pptx",
        "slideMax": len(pages),
        "pages": pages,
        "reserved": [],
        "futureLayouts": ["chart"],
        "downgrade": {
            "metric_columns": "无精确组合时：栏数>2 且卡数不足 → 降为 2 栏同卡数；仍无则 metric_list",
            "table": "按 (rows, cols) 取最小够用规格；45=5×4 / 46=6×4 / 47=6×5 / 48=8×5；都装不下取 48",
            "N_gt_8": "N>8 优先转 table 或拆页，不缩字号硬塞",
        },
        "notes": {
            "markers": "页内 progress*/List*/imageList* 小字已从模板清除；运行时 strip 仍保留兜底",
        },
    }


def dump_json(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    manifest = build_manifest()
    text = dump_json(manifest)
    OUT_PUBLIC.write_text(text, encoding="utf-8")
    OUT_SRC.write_text(text, encoding="utf-8")
    a = OUT_PUBLIC.read_bytes()
    b = OUT_SRC.read_bytes()
    assert a == b, "public vs src manifest byte mismatch"
    # 快速校验权威表关键页
    by_page = {p["page"]: p for p in manifest["pages"]}
    assert by_page[6]["layout"] == "progress" and by_page[6]["cards"] == 3
    assert by_page[15]["layout"] == "list" and by_page[15].get("skin") in (None, 0)
    assert by_page[45]["layout"] == "table" and by_page[45]["rows"] == 5 and by_page[45]["cols"] == 4
    assert by_page[48]["rows"] == 8 and by_page[48]["cols"] == 5
    assert by_page[49]["layout"] == "image_grid"
    assert by_page[50]["layout"] == "tail"
    assert by_page[22]["cards"] == 4  # 设计侧已补槽：同组 21/22/23 = 3/4/5
    # 清除 notes 里旧 p22 缺陷说明（重建时动态写）
    notes = manifest.get("notes") or {}
    if "p22" in notes and by_page[22]["cards"] == 4:
        notes.pop("p22", None)
        manifest["notes"] = notes
        # re-dump after notes fix
        text = dump_json(manifest)
        OUT_PUBLIC.write_text(text, encoding="utf-8")
        OUT_SRC.write_text(text, encoding="utf-8")
        assert OUT_PUBLIC.read_bytes() == OUT_SRC.read_bytes()
    print(f"wrote {OUT_PUBLIC} and {OUT_SRC} ({len(OUT_PUBLIC.read_bytes())} bytes, slideMax={manifest['slideMax']})")
    # 摘要
    for layout in (
        "progress",
        "list",
        "metric",
        "columns",
        "metric_columns",
        "metric_list",
        "table",
        "image_grid",
    ):
        ps = [p for p in manifest["pages"] if p["layout"] == layout]
        bits = []
        for p in ps:
            sk = f"s{p['skin']}" if p.get("skin") else "s0"
            dim = p.get("cards") or p.get("cols") or f"{p.get('rows')}x{p.get('cols')}"
            bits.append(f"p{p['page']}:{dim}/{sk}")
        print(f"  {layout}: {', '.join(bits)}")


if __name__ == "__main__":
    main()
