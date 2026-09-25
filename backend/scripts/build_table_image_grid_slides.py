#!/usr/bin/env python3
"""在 pptTemplate-simple.pptx 的第 42/43 页写入 table / image_grid 版式。

用法（在 backend venv）:
  python scripts/build_table_image_grid_slides.py
"""
from __future__ import annotations

import shutil
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parents[2]
PPTX = ROOT / "frontend" / "public" / "pptTemplate-simple.pptx"
BACKUP = ROOT / "frontend" / "public" / "pptTemplate-simple.tablegrid-bak.pptx"

# 16:9
SLIDE_W = 12192000
SLIDE_H = 6858000


def _clear_non_title(slide) -> None:
    # 删除除标题占位符外的形状（从后往前）
    sp_tree = slide.shapes._spTree
    to_remove = []
    for shape in slide.shapes:
        is_title = False
        try:
            if shape.is_placeholder and shape.placeholder_format.idx == 0:
                is_title = True
            elif shape.has_text_frame and "{slideTitle}" in (shape.text_frame.text or ""):
                is_title = True
            elif shape.has_text_frame and shape.name.startswith("标题"):
                is_title = True
        except Exception:
            pass
        if is_title:
            # 统一写成 {slideTitle}
            try:
                shape.text_frame.clear()
                p = shape.text_frame.paragraphs[0]
                run = p.add_run()
                run.text = "{slideTitle}"
                run.font.size = Pt(28)
                run.font.bold = True
                run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)
            except Exception:
                pass
            continue
        to_remove.append(shape._element)
    for el in to_remove:
        sp_tree.remove(el)


def _set_cell_text(cell, text: str, *, bold: bool = False, size: int = 12) -> None:
    cell.text = ""
    p = cell.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = RGBColor(0x22, 0x22, 0x22)
    # 单 run，便于模板灌模
    cell.text_frame.word_wrap = True


def build_table_slide(slide) -> None:
    _clear_non_title(slide)
    # 副标题
    box = slide.shapes.add_textbox(Inches(0.6), Inches(1.05), Inches(12.0), Inches(0.4))
    tf = box.text_frame
    tf.clear()
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "{tableTitle}"
    run.font.size = Pt(14)
    run.font.color.rgb = RGBColor(0x55, 0x55, 0x66)

    rows, cols = 5, 4
    left, top = Inches(0.5), Inches(1.55)
    width, height = Inches(12.3), Inches(5.0)
    table = slide.shapes.add_table(rows, cols, left, top, width, height).table
    for r in range(rows):
        for c in range(cols):
            key = f"{{cell_r{r}c{c}}}"
            _set_cell_text(table.cell(r, c), key, bold=(r == 0), size=12 if r else 11)
            # 表头底色
            if r == 0:
                tc = table.cell(r, c)._tc
                tcPr = tc.get_or_add_tcPr()
                solid = tcPr.makeelement(qn("a:solidFill"), {})
                srgb = solid.makeelement(qn("a:srgbClr"), {"val": "1F4E79"})
                solid.append(srgb)
                tcPr.append(solid)
                for paragraph in table.cell(r, c).text_frame.paragraphs:
                    for run in paragraph.runs:
                        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)


def build_image_grid_slide(prs: Presentation, slide) -> None:
    _clear_non_title(slide)
    # 使用模板内已有 jpeg 作占位图（后续灌模可换 media）
    media_dir = None  # pictures added from files extracted below
    # 从 pptx 包抽出 image2-5
    import zipfile
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="ppt_media_"))
    pics: list[Path] = []
    with zipfile.ZipFile(PPTX, "r") as z:
        for i, name in enumerate(["ppt/media/image2.jpeg", "ppt/media/image3.jpeg", "ppt/media/image4.jpeg", "ppt/media/image5.jpeg"], start=1):
            if name not in z.namelist():
                continue
            dest = tmp / f"grid{i}.jpeg"
            dest.write_bytes(z.read(name))
            pics.append(dest)
    while len(pics) < 4 and pics:
        pics.append(pics[-1])

    # 2x2
    positions = [
        (Inches(0.5), Inches(1.3)),
        (Inches(6.6), Inches(1.3)),
        (Inches(0.5), Inches(3.85)),
        (Inches(6.6), Inches(3.85)),
    ]
    img_w, img_h = Inches(5.6), Inches(2.0)
    for i, (left, top) in enumerate(positions, start=1):
        if i <= len(pics):
            slide.shapes.add_picture(str(pics[i - 1]), left, top, width=img_w, height=img_h)
        cap = slide.shapes.add_textbox(left, top + img_h + Emu(40000), img_w, Inches(0.4))
        tf = cap.text_frame
        tf.clear()
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = f"{{cap{i}}}"
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)


def main() -> None:
    if not PPTX.exists():
        raise SystemExit(f"missing {PPTX}")
    shutil.copy2(PPTX, BACKUP)
    prs = Presentation(str(PPTX))
    # page 42 = index 41, page 43 = index 42
    build_table_slide(prs.slides[41])
    build_image_grid_slide(prs, prs.slides[42])
    prs.save(str(PPTX))
    print(f"updated {PPTX}")
    print(f"backup  {BACKUP}")

    # verify slots
    import re
    import zipfile

    with zipfile.ZipFile(PPTX) as z:
        for sn in ("ppt/slides/slide42.xml", "ppt/slides/slide43.xml"):
            t = z.read(sn).decode("utf-8", "ignore")
            slots = sorted(set(re.findall(r"\{[A-Za-z_][\w.]*\}", t)))
            print(sn, "slots=", slots)


if __name__ == "__main__":
    main()
