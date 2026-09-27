"""属性页 chart_box：VL 嵌图后 RapidOCR 补标签+占比。"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

from app.services.ocr_service import (
    enrich_vl_chart_boxes,
    pair_label_pct_lines,
)

FIXTURES = Path(__file__).parent / "fixtures"


def test_pair_label_pct_lines_joins_rapidocr_rows():
    raw = "棉\n72.18%\n聚酯纤维\n19.16%\nother line\n纯色\n70.07%"
    out = pair_label_pct_lines(raw)
    assert "棉 72.18%" in out
    assert "聚酯纤维 19.16%" in out
    assert "纯色 70.07%" in out
    assert "other line" in out


def test_enrich_vl_chart_boxes_skips_when_pairs_present():
    md = (
        "属性销量占比\n棉 72.18%\n涤纶 15.32%\n纯色 70.07%\n条纹 18.20%\n"
        '<img src="imgs/img_in_chart_box_10_10_100_100.jpg" />'
    )
    out = enrich_vl_chart_boxes(md, b"not-an-image")
    assert out == md


def test_enrich_vl_chart_boxes_on_polo_fabric_fixture():
    """真实面料条形裁切：应读出棉 72.18%。"""
    png = (FIXTURES / "polo_p6_chart_fabric.png").read_bytes()
    im = Image.open(FIXTURES / "polo_p6_chart_fabric.png")
    w, h = im.size
    md = (
        "## 属性特征分析\n面料材质\n属性销量占比\n"
        f'<img src="imgs/img_in_chart_box_0_0_{w}_{h}.jpg" alt="Image" />'
    )
    out = enrich_vl_chart_boxes(md, png)
    assert "[图表OCR]" in out
    assert "72.18" in out
    assert "棉" in out
