"""抽取层金标：衬衫/polo PDF 固化页断言。

不依赖重跑 OCR——用入库 VL Markdown 夹具。
改 table_structure / extract_service 后必跑。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.services.document_loader import split_text_with_meta
from app.services.extract_service import extract_page_record
from app.services.table_structure import extract_tables, iter_page_segments

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def _has_metric(metrics, value: str, unit: str | None = None, name: str | None = None):
    for m in metrics:
        if str(m.get("value")) != value:
            continue
        if unit is not None and m.get("unit") != unit:
            continue
        if name is not None and m.get("name") != name:
            continue
        return m
    return None


def test_table_not_split_across_chunks():
    text = _load("polo_p2.md")
    pieces = split_text_with_meta(f"[第2页]\n{text}", chunk_size=500, chunk_overlap=80)
    table_pieces = [p for p, m in pieces if m.get("kind") == "table"]
    assert len(table_pieces) == 1
    assert "403.7" in table_pieces[0]
    assert "</table>" in table_pieces[0].lower()
    assert all(m.get("atomic") for _, m in pieces if m.get("kind") == "table")


def test_polo_p2_kpi_gold():
    """P2 必含 polo 403.7万 / 3.9亿 / +26.9%，且同比不串到大盘格。"""
    text = _load("polo_p2.md")
    rec = extract_page_record("抖音单品爆款分析-商务男士衬衫polo衫.pdf", 2, text)
    metrics = rec["metrics"]

    m403 = _has_metric(metrics, "403.7", "万")
    assert m403, f"缺少 403.7万；got={[(m.get('value'), m.get('unit'), m.get('name')) for m in metrics]}"
    assert m403.get("name") == "polo衫"
    assert m403.get("rank_badge") == "TOP6"
    assert m403.get("yoy") and "26.9" in m403["yoy"]

    m39 = _has_metric(metrics, "3.9", "亿")
    assert m39 and m39.get("name") == "polo衫"

    m7280 = _has_metric(metrics, "7280.1", "万", "男装大盘")
    assert m7280
    assert "26.9" not in str(m7280.get("yoy") or "")


def test_polo_p2_price_band_row_header_bound():
    """价格带行：¥50-100 绑到量值；列头声明的同比% 合并为 yoy，不独立成「指标」。"""
    text = _load("polo_p2.md")
    rec = extract_page_record("抖音单品爆款分析-商务男士衬衫polo衫.pdf", 2, text)
    metrics = rec["metrics"]

    m172 = _has_metric(metrics, "172.6", "万")
    assert m172, f"缺少 172.6万；{[ (m.get('value'), m.get('name'), m.get('price_band')) for m in metrics]}"
    assert m172.get("price_band") and "50" in m172["price_band"] and "100" in m172["price_band"]
    assert m172.get("name") != "指标"
    assert m172.get("share") and "42.76" in str(m172.get("share"))
    # 列头「销量同比」→ yoy；禁止无标签默认伪造成同比
    assert m172.get("yoy") and "17.09" in str(m172["yoy"])
    assert not m172.get("rate_unlabeled")
    lone = [
        m
        for m in metrics
        if str(m.get("value")) == "17.09" and m.get("name") == "指标"
    ]
    assert not lone, f"纯同比不应独立成条: {lone}"
    # 脚注文案不得被属性抽取成 value=share=250%
    assert not any(str(m.get("value")) == "250" for m in metrics)


def test_bare_rate_without_header_is_unlabeled():
    """无列头声明时，邻格裸% 落 rate_unlabeled，禁止写成 yoy。"""
    from app.services.table_structure import (
        Cell,
        TableBlock,
        metrics_from_table,
    )

    tb = TableBlock(
        rows=[
            [
                Cell("品类A", 0, 0),
                Cell("126.5 万", 0, 1),
                Cell("35.94%", 0, 2),
            ]
        ]
    )
    mets, _ = metrics_from_table(tb, page_type="general")
    assert mets, mets
    m = mets[0]
    assert str(m.get("value")) == "126.5"
    assert m.get("yoy") is None
    assert m.get("mom") is None
    assert m.get("rate_unlabeled") and "35.94" in str(m["rate_unlabeled"])


def test_shirt_p4_kpi_gold():
    """P4（非 P2）必含衬衫 296.2万。"""
    text = _load("polo_p4.md")
    rec = extract_page_record("抖音单品爆款分析-商务男士衬衫polo衫.pdf", 4, text)
    m = _has_metric(rec["metrics"], "296.2", "万")
    assert m and m.get("name") == "男士衬衫"
    assert m.get("rank_badge") == "TOP7" or "TOP" in str(m.get("rank_badge") or "")


def test_attribute_p6_plain_text_no_vl_myth():
    """P6：棉/纯色等为纯文本占比，不依赖 VL 读图。"""
    text = _load("polo_p6.md")
    rec = extract_page_record("抖音单品爆款分析-商务男士衬衫polo衫.pdf", 6, text)
    assert rec["page_type"] == "attribute"
    assert len(rec["metrics"]) >= 8, rec["metrics"]
    cotton = next(
        (m for m in rec["metrics"] if m.get("attr_label") == "棉"), None
    )
    assert cotton and cotton.get("value") == "72.18"
    solid = next(
        (m for m in rec["metrics"] if m.get("attr_label") == "纯色"), None
    )
    assert solid and solid.get("value") == "70.07"
    warn = " ".join(rec.get("extract_warnings") or [])
    assert "需 VL" not in warn


def test_product_grid_p9_captions():
    """P9 图鉴页：不应误判 price_band；caption 销量可抽。"""
    text = _load("polo_p9.md")
    rec = extract_page_record("抖音单品爆款分析-商务男士衬衫polo衫.pdf", 9, text)
    assert rec["page_type"] == "product_grid", rec["page_type"]
    assert len(rec["metrics"]) >= 2
    m = _has_metric(rec["metrics"], "6771")
    assert m, rec["metrics"]
    assert "立领" in str(m.get("name") or "") or m.get("name") != "指标"


def test_snippet_not_truncated_at_240():
    text = _load("polo_p2.md")
    rec = extract_page_record("x.pdf", 2, text)
    assert len(rec["snippet"]) > 240


def test_iter_segments_keeps_table_atomic():
    text = _load("polo_p2.md")
    segs = iter_page_segments(text)
    tables = [s for s in segs if s[0] == "table"]
    assert len(tables) == 1
    assert extract_tables(text)
