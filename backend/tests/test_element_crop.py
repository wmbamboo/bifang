"""元素图裁切：与 OCR 同次页图、零换算。"""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw

from app.services.ocr_service import (
    crop_element_assets_from_page,
    parse_vl_box_refs,
)


def test_parse_vl_box_refs_image_and_chart():
    md = (
        '<img src="imgs/img_in_image_box_10_20_100_200.jpg" />\n'
        '<img src="imgs/img_in_chart_box_30_40_150_160.jpg" />\n'
        '<img src="imgs/img_in_image_box_10_20_100_200.jpg" />'  # dup
    )
    refs = parse_vl_box_refs(md)
    assert len(refs) == 2
    kinds = {k for k, _ in refs}
    assert kinds == {"image", "chart"}


def test_crop_element_assets_from_page_writes_elements_and_whole(tmp_path: Path):
    # 200x120 页图；两框
    page = Image.new("RGB", (200, 120), (240, 240, 240))
    draw = ImageDraw.Draw(page)
    draw.rectangle((10, 10, 90, 110), fill=(200, 50, 50))  # image
    draw.rectangle((110, 20, 190, 100), fill=(50, 50, 200))  # chart
    buf = io.BytesIO()
    page.save(buf, format="PNG")
    md = (
        '<img src="imgs/img_in_image_box_10_10_90_110.jpg" />\n'
        '<img src="imgs/img_in_chart_box_110_20_190_100.jpg" />'
    )
    infos = crop_element_assets_from_page(
        buf.getvalue(),
        md,
        assets_dir=tmp_path,
        file_stem="demo",
        page_no=6,
        save_whole=True,
    )
    kinds = {i["kind"] for i in infos}
    assert "whole" in kinds
    assert "image" in kinds
    assert "chart" in kinds
    whole = tmp_path / "whole"
    assert (whole / "page_6.jpg").exists() or (whole / "page_6.png").exists()
    assert (tmp_path / "elements" / "demo_p6_img1.png").exists()
    assert (tmp_path / "elements" / "demo_p6_chart1.png").exists()
    img = Image.open(tmp_path / "elements" / "demo_p6_img1.png")
    assert img.size == (80, 100)
