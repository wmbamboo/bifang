"""表头约定：页型 schema + 三信号投票 + profile 元数据。"""
from __future__ import annotations

from pathlib import Path

from app.services.extract_service import extract_page_record
from app.services.table_profile import infer_table_profile, row_key_from_profile
from app.services.table_structure import Cell, TableBlock, extract_tables, metrics_from_table

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_top_header_signal_vote_prefers_col_axis():
    """上表头：数值密度在数据行，表头轴应为 col（或 mixed 含 header_rows）。"""
    text = _load("top_header_table.md")
    tables = extract_tables(text)
    assert tables
    # 故意用 general，走三信号而非页型短路
    prof = infer_table_profile(tables[0], page_type="general")
    assert prof.convention == "signal_vote"
    assert prof.header_axis in {"col", "mixed"}
    assert prof.header_rows >= 1
    assert prof.confidence >= 0.5

    mets, meta = metrics_from_table(tables[0], page_type="general")
    assert meta["header_rows"] >= 1
    # 行键应绑上品类名，而非占位
    named = [m for m in mets if m.get("name") in {"polo衫", "男士衬衫", "T恤"}]
    assert named, mets
    assert any(str(m.get("value")) == "403.7" for m in named)


def test_double_header_marks_ambiguous_or_multi_header_rows():
    """双层 thead：应识别多行表头或标 ambiguous，便于 LLM 兜底。"""
    text = _load("double_header_table.md")
    tables = extract_tables(text)
    assert tables
    tb = tables[0]
    assert any(c.is_th for row in tb.rows for c in row)
    prof = infer_table_profile(tb, page_type="general")
    assert prof.convention == "signal_vote"
    # 双层：header_rows>=2 或 ambiguous
    assert prof.header_rows >= 2 or prof.ambiguous or prof.header_axis in {
        "col",
        "mixed",
    }
    mets, meta = metrics_from_table(tb, page_type="general")
    assert any(str(m.get("value")) == "403.7" for m in mets)
    assert meta.get("convention") == "signal_vote"


def test_price_band_schema_overrides_kpi_page_type():
    """混页：page_type=category_kpi 但表内多价带 → price_band 约定。"""
    text = _load("polo_p2.md")
    rec = extract_page_record("x.pdf", 2, text)
    assert rec["page_type"] == "category_kpi"
    assert rec.get("table_profiles")
    prof = rec["table_profiles"][0]
    assert prof["convention"] == "page_schema:price_band"
    m172 = next(
        (m for m in rec["metrics"] if str(m.get("value")) == "172.6"), None
    )
    assert m172 and m172.get("price_band")
    assert "50" in m172["price_band"]


def test_row_key_price_band_reverse_locate():
    row = [
        Cell("主力价格带", 0, 0),
        Cell("¥50-100", 0, 1),
        Cell("172.6 万", 0, 2),
        Cell("17.09%", 0, 3),
    ]
    from app.services.table_profile import TableProfile

    name, band = row_key_from_profile(
        row,
        TableProfile(convention="page_schema:price_band", header_axis="mixed"),
    )
    assert band and "50" in band
    assert name


def test_profile_in_page_record_tables_meta():
    text = _load("top_header_table.md")
    rec = extract_page_record("x.pdf", 1, text)
    assert "table_profiles" in rec
    assert rec["tables"] and rec["tables"][0].get("profile")
