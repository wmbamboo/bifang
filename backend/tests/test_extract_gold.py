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
    # 表不得被拆成多段
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
    assert m403.get("yoy") in {"+26.9%", "26.9%"} or (
        m403.get("yoy") and "26.9" in m403["yoy"]
    )

    m39 = _has_metric(metrics, "3.9", "亿")
    assert m39, "缺少 3.9亿"
    assert m39.get("name") == "polo衫"

    m7280 = _has_metric(metrics, "7280.1", "万", "男装大盘")
    assert m7280, "缺少大盘 7280.1万"
    # 大盘增速不得被 polo TOP 的 +26.9% 污染
    assert m7280.get("yoy") in {None, "+30.6%"} or (
        m7280.get("yoy") and "30.6" in str(m7280.get("yoy"))
    )
    assert "26.9" not in str(m7280.get("yoy") or "")


def test_shirt_p4_kpi_gold():
    """P4 必含衬衫 296.2万。"""
    text = _load("polo_p4.md")
    rec = extract_page_record("抖音单品爆款分析-商务男士衬衫polo衫.pdf", 4, text)
    m = _has_metric(rec["metrics"], "296.2", "万")
    assert m, f"缺少 296.2万；got={rec['metrics'][:8]}"
    assert m.get("name") == "男士衬衫"
    assert m.get("rank_badge") in {"TOP7", None} or "TOP" in str(m.get("rank_badge") or "")


def test_attribute_p6_schema_warning_not_silent_zero_ok():
    """P6 属性页：图表为主时允许 0 指标，但须留下 warning（不静默当成功 KPI）。"""
    text = _load("polo_p6.md")
    rec = extract_page_record("抖音单品爆款分析-商务男士衬衫polo衫.pdf", 6, text)
    assert rec["page_type"] == "attribute"
    # 无数字时 prefer_min 触发 warning
    if len(rec["metrics"]) < 8:
        assert rec.get("extract_warnings"), "属性页指标不足应有 extract_warnings"


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
