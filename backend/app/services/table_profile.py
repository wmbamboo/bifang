"""表头约定判定：页型 schema 优先，其次结构/密度/语义三信号投票。

不写「某文档习惯」特判；歧义时由调用方走 LLM 角色标注。
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional

from app.services.table_structure import (
    Cell,
    TableBlock,
    _PRICE_BAND_RE,
    _is_noise_arrow,
    _is_pure_pct_cell,
    _is_rate_only_cell,
    _is_volume_cell,
)

HeaderAxis = Literal["row", "col", "mixed", "none"]
Convention = Literal[
    "page_schema:category_kpi",
    "page_schema:price_band",
    "page_schema:ranking",
    "page_schema:product_grid",
    "signal_vote",
    "llm_roles",
    "unknown",
]


@dataclass
class TableProfile:
    """一份表用的约定，落进页记录便于复跑/调试。"""

    convention: Convention = "unknown"
    header_axis: HeaderAxis = "none"
    header_rows: int = 0
    row_header_cols: int = 0
    confidence: float = 0.0
    ambiguous: bool = False
    signals: dict[str, Any] = field(default_factory=dict)
    n_rows: int = 0
    n_cols: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_NUMERIC_CELL_RE = re.compile(
    r"(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:[%％亿万件元])?"
)
_HEADER_WORD_RE = re.compile(
    r"销量|销售额|同比|环比|占比|价格带|品类|排名|店铺|商品|本期|指标|名称"
)


def _cell_numeric_score(text: str) -> float:
    """1.0 = 纯数值格；0.0 = 纯名词格。"""
    s = (text or "").strip()
    if not s or _is_noise_arrow(s):
        return 0.5
    if _is_volume_cell(s) or _is_pure_pct_cell(s) or _is_rate_only_cell(s):
        return 1.0
    if _PRICE_BAND_RE.search(s) and not _is_volume_cell(s):
        return 0.15  # 价带是行键，偏表头
    if _NUMERIC_CELL_RE.fullmatch(s.replace(" ", "")):
        return 1.0
    if _NUMERIC_CELL_RE.search(s) and len(re.findall(r"[\u4e00-\u9fffA-Za-z]", s)) <= 2:
        return 0.85
    return 0.0


def _axis_numeric_density(table: TableBlock, axis: Literal["row", "col"]) -> list[float]:
    if not table.rows:
        return []
    n_cols = max(len(r) for r in table.rows)
    if axis == "row":
        dens: list[float] = []
        for row in table.rows:
            if not row:
                dens.append(0.0)
                continue
            dens.append(sum(_cell_numeric_score(c.text) for c in row) / len(row))
        return dens
    dens = []
    for ci in range(n_cols):
        vals = []
        for row in table.rows:
            if ci < len(row):
                vals.append(_cell_numeric_score(row[ci].text))
        dens.append(sum(vals) / len(vals) if vals else 0.0)
    return dens


def _signal_structure(table: TableBlock) -> dict[str, Any]:
    """结构标记：<th> / thead / MD 分隔暗示。"""
    html = table.raw_html or ""
    th_count = len(re.findall(r"<th\b", html, re.I))
    has_thead = bool(re.search(r"<thead\b", html, re.I))
    # 首行 th 比例
    first_th = 0
    if table.rows:
        first_th = sum(1 for c in table.rows[0] if getattr(c, "is_th", False))
    md_sep = bool(re.search(r"\|?\s*:?-{3,}", html))
    vote_col = 0
    vote_row = 0
    if has_thead or (table.rows and first_th >= max(1, len(table.rows[0]) // 2)):
        vote_col += 2
    if th_count and table.rows:
        # 若 th 集中在左列
        left_th = 0
        for row in table.rows:
            if row and getattr(row[0], "is_th", False):
                left_th += 1
        if left_th >= max(1, len(table.rows) // 2):
            vote_row += 2
        elif first_th:
            vote_col += 1
    if md_sep:
        vote_col += 1
    return {
        "th_count": th_count,
        "has_thead": has_thead,
        "first_row_th": first_th,
        "vote_row": vote_row,
        "vote_col": vote_col,
    }


def _signal_density(table: TableBlock) -> dict[str, Any]:
    row_d = _axis_numeric_density(table, "row")
    col_d = _axis_numeric_density(table, "col")
    vote_row = vote_col = 0
    header_rows = 0
    row_header_cols = 0
    if row_d:
        # 顶部低密度行 = 上表头
        for d in row_d:
            if d < 0.35:
                header_rows += 1
            else:
                break
        if header_rows:
            vote_col += 2
        elif row_d[0] < min(row_d[1:]) - 0.25 if len(row_d) > 1 else False:
            header_rows = 1
            vote_col += 1
    if col_d:
        for d in col_d:
            if d < 0.35:
                row_header_cols += 1
            else:
                break
        if row_header_cols:
            vote_row += 2
        elif col_d[0] < min(col_d[1:]) - 0.25 if len(col_d) > 1 else False:
            row_header_cols = 1
            vote_row += 1
    return {
        "row_density": [round(x, 3) for x in row_d],
        "col_density": [round(x, 3) for x in col_d],
        "header_rows": header_rows,
        "row_header_cols": row_header_cols,
        "vote_row": vote_row,
        "vote_col": vote_col,
    }


def _signal_semantic(table: TableBlock) -> dict[str, Any]:
    """语义形态：短名词 vs 数值正则。"""
    vote_row = vote_col = 0
    if not table.rows:
        return {"vote_row": 0, "vote_col": 0}
    # 首行像列名？
    first = table.rows[0]
    headerish = sum(
        1
        for c in first
        if _HEADER_WORD_RE.search(c.text or "")
        or (
            _cell_numeric_score(c.text) < 0.3
            and 1 <= len((c.text or "").strip()) <= 16
        )
    )
    if first and headerish >= max(1, len(first) // 2):
        vote_col += 2
    # 左列像行名？
    left_labels = 0
    left_total = 0
    for row in table.rows[1:] if len(table.rows) > 1 else table.rows:
        if not row:
            continue
        left_total += 1
        t = row[0].text or ""
        if _cell_numeric_score(t) < 0.3 and re.search(r"[\u4e00-\u9fffA-Za-z￥¥]", t):
            left_labels += 1
    if left_total and left_labels / left_total >= 0.5:
        vote_row += 2
    # 价带键在左/次左
    band_left = 0
    for row in table.rows:
        for c in row[:2]:
            if _PRICE_BAND_RE.search(c.text or "") and not _is_volume_cell(c.text):
                band_left += 1
                break
    if band_left >= 2:
        vote_row += 1
    return {
        "first_row_headerish": headerish,
        "left_label_ratio": round(left_labels / left_total, 3) if left_total else 0,
        "band_left_rows": band_left,
        "vote_row": vote_row,
        "vote_col": vote_col,
    }


def infer_table_profile(
    table: TableBlock,
    *,
    page_type: str = "general",
) -> TableProfile:
    """页型 schema 优先；同页混表时以表内信号覆盖；否则三信号投票。"""
    n_rows = len(table.rows)
    n_cols = max((len(r) for r in table.rows), default=0)

    # 表内价带密度：混页（KPI+价带）时不能只听 page_type
    band_rows = 0
    for row in table.rows:
        if any(
            _PRICE_BAND_RE.search(c.text or "") and not _is_volume_cell(c.text)
            for c in row
        ):
            band_rows += 1
    looks_price_band = band_rows >= 2

    # —— 第 2 层：页型 schema（可被表内价带信号细化）——
    if looks_price_band and page_type in {
        "category_kpi",
        "price_band",
        "general",
        "macro",
    }:
        return TableProfile(
            convention="page_schema:price_band",
            header_axis="mixed",
            header_rows=1,
            row_header_cols=1,
            confidence=0.93,
            ambiguous=False,
            signals={
                "reason": "price_band_regex_row_key",
                "band_rows": band_rows,
                "page_type": page_type,
            },
            n_rows=n_rows,
            n_cols=n_cols,
        )

    if page_type == "category_kpi":
        # KPI 卡表：横排 label-value，不强绑行头列
        return TableProfile(
            convention="page_schema:category_kpi",
            header_axis="none",
            header_rows=0,
            row_header_cols=0,
            confidence=0.9,
            ambiguous=False,
            signals={"reason": "kpi_label_value_pairs"},
            n_rows=n_rows,
            n_cols=n_cols,
        )
    if page_type == "price_band":
        return TableProfile(
            convention="page_schema:price_band",
            header_axis="mixed",
            header_rows=1,
            row_header_cols=1,
            confidence=0.92,
            ambiguous=False,
            signals={"reason": "price_band_regex_row_key"},
            n_rows=n_rows,
            n_cols=n_cols,
        )
    if page_type in {"ranking", "product_grid"}:
        return TableProfile(
            convention=(
                "page_schema:ranking"
                if page_type == "ranking"
                else "page_schema:product_grid"
            ),
            header_axis="row",
            header_rows=1 if page_type == "ranking" else 0,
            row_header_cols=1,
            confidence=0.88,
            ambiguous=False,
            signals={"reason": "longest_non_numeric_in_row"},
            n_rows=n_rows,
            n_cols=n_cols,
        )

    # —— 第 1 层：三信号投票 ——
    s_struct = _signal_structure(table)
    s_dens = _signal_density(table)
    s_sem = _signal_semantic(table)
    vote_row = s_struct["vote_row"] + s_dens["vote_row"] + s_sem["vote_row"]
    vote_col = s_struct["vote_col"] + s_dens["vote_col"] + s_sem["vote_col"]

    header_rows = s_dens["header_rows"] or (1 if vote_col > vote_row and vote_col >= 2 else 0)
    row_header_cols = s_dens["row_header_cols"] or (
        1 if vote_row > vote_col and vote_row >= 2 else 0
    )

    if vote_row == 0 and vote_col == 0:
        axis: HeaderAxis = "none"
        ambiguous = True
        conf = 0.3
    elif abs(vote_row - vote_col) <= 1 and vote_row > 0 and vote_col > 0:
        axis = "mixed"
        ambiguous = True
        conf = 0.55
        header_rows = max(header_rows, 1)
        row_header_cols = max(row_header_cols, 1)
    elif vote_row > vote_col:
        axis = "row"
        ambiguous = vote_row < 3
        conf = min(0.95, 0.5 + 0.1 * vote_row)
    else:
        axis = "col"
        ambiguous = vote_col < 3
        conf = min(0.95, 0.5 + 0.1 * vote_col)
        header_rows = max(header_rows, 1)

    return TableProfile(
        convention="signal_vote",
        header_axis=axis,
        header_rows=header_rows,
        row_header_cols=row_header_cols,
        confidence=round(conf, 3),
        ambiguous=ambiguous,
        signals={
            "structure": s_struct,
            "density": s_dens,
            "semantic": s_sem,
            "vote_row": vote_row,
            "vote_col": vote_col,
        },
        n_rows=n_rows,
        n_cols=n_cols,
    )


def row_key_from_profile(
    row: list[Cell],
    profile: TableProfile,
    *,
    skip_header_rows: bool = True,
) -> tuple[str, Optional[str]]:
    """按 profile 取本行行键与价带。"""
    if not row:
        return "", None
    # price_band：反向定位价带格
    if profile.convention == "page_schema:price_band":
        band = None
        labels: list[str] = []
        for c in row:
            t = (c.text or "").strip()
            if not t or _is_noise_arrow(t):
                continue
            if _is_volume_cell(t) or _is_pure_pct_cell(t):
                break
            bm = _PRICE_BAND_RE.search(t)
            if bm and not _is_volume_cell(t):
                band = bm.group(0).replace(" ", "")
                labels.append(band)
            elif _cell_numeric_score(t) < 0.3:
                labels.append(t)
        return (labels[0] if labels else ""), band

    # ranking / product：行内最长非数值文本
    if profile.convention in {"page_schema:ranking", "page_schema:product_grid"}:
        best = ""
        band = None
        for c in row:
            t = (c.text or "").strip()
            if not t or _is_volume_cell(t) or _is_pure_pct_cell(t):
                continue
            if _PRICE_BAND_RE.search(t) and not _is_volume_cell(t):
                band = _PRICE_BAND_RE.search(t).group(0).replace(" ", "")
            if _cell_numeric_score(t) < 0.3 and len(t) > len(best):
                best = t
        return best[:40], band

    # category_kpi：不强制行头
    if profile.convention == "page_schema:category_kpi":
        return "", None

    # signal_vote：按 row_header_cols
    cols = max(profile.row_header_cols, 1 if profile.header_axis in {"row", "mixed"} else 0)
    labels = []
    band = None
    for c in row[:cols]:
        t = (c.text or "").strip()
        if not t or _is_volume_cell(t) or _is_pure_pct_cell(t):
            continue
        bm = _PRICE_BAND_RE.search(t)
        if bm and not _is_volume_cell(t):
            band = bm.group(0).replace(" ", "")
        if _cell_numeric_score(t) < 0.3:
            labels.append(t)
    return (labels[0] if labels else ""), band
