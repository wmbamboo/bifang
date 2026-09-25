"""版面结构解析：从 VL Markdown/HTML 表还原单元格归属。

归属原则：数字与同比/环比只在同一 cell（或同一 KPI 卡片块）内绑定；
表行用行序（及可选 bbox）分组，不靠全文流窗口。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

_TABLE_HTML_RE = re.compile(r"<table\b[\s\S]*?</table>", re.I)
_TR_RE = re.compile(r"<tr\b[\s\S]*?</tr>", re.I)
_TD_RE = re.compile(r"<t[dh]\b[^>]*>([\s\S]*?)</t[dh]>", re.I)
_TAG_RE = re.compile(r"<[^>]+>")
_MD_TABLE_SEP = re.compile(r"^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$")

_METRIC_RE = re.compile(
    r"(?<![.\d])("
    r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)+"
    r")\s*(%|％|亿|万|件|元)?"
)
_YOY_RE = re.compile(r"(同比)\s*([+\-＋－]?\s*\d+(?:\.\d+)?\s*[%％])")
_MOM_RE = re.compile(r"(环比)\s*([+\-＋－]?\s*\d+(?:\.\d+)?\s*[%％])")
_RANK_RE = re.compile(r"TOP\s*(\d+)", re.I)
_PRICE_BAND_RE = re.compile(
    r"[￥¥]\s*\d+(?:\.\d+)?\s*[-~～至到]\s*\d+(?:\.\d+)?|"
    r"[￥¥]\s*\d+(?:\.\d+)?\s*元?\s*(?:以下|以上)|"
    r"[￥¥]\s*\d+(?:\.\d+)?\s*以下|"
    r"\d+\s*元\s*(?:以下|以上)"
)


@dataclass
class Cell:
    text: str
    row: int
    col: int
    bbox: Optional[list[float]] = None  # [x0,y0,x1,y1] 若 VL 提供


@dataclass
class TableBlock:
    rows: list[list[Cell]] = field(default_factory=list)
    raw_html: str = ""
    start: int = 0
    end: int = 0


def _strip_html(s: str) -> str:
    t = _TAG_RE.sub(" ", s or "")
    t = re.sub(r"&nbsp;", " ", t, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def parse_html_tables(text: str) -> list[TableBlock]:
    out: list[TableBlock] = []
    for m in _TABLE_HTML_RE.finditer(text or ""):
        html = m.group(0)
        rows: list[list[Cell]] = []
        for ri, tr in enumerate(_TR_RE.finditer(html)):
            cells: list[Cell] = []
            for ci, td in enumerate(_TD_RE.finditer(tr.group(0))):
                cells.append(Cell(text=_strip_html(td.group(1)), row=ri, col=ci))
            if cells:
                rows.append(cells)
        if rows:
            out.append(TableBlock(rows=rows, raw_html=html, start=m.start(), end=m.end()))
    return out


def parse_markdown_tables(text: str) -> list[TableBlock]:
    """简单 GFM 表：连续 | 行。"""
    lines = (text or "").splitlines()
    out: list[TableBlock] = []
    i = 0
    while i < len(lines):
        if "|" not in lines[i]:
            i += 1
            continue
        start = i
        block: list[str] = []
        while i < len(lines) and "|" in lines[i]:
            block.append(lines[i])
            i += 1
        if len(block) < 2:
            continue
        # 去掉分隔行
        body = [ln for ln in block if not _MD_TABLE_SEP.match(ln)]
        rows: list[list[Cell]] = []
        for ri, ln in enumerate(body):
            parts = [p.strip() for p in ln.strip().strip("|").split("|")]
            rows.append([Cell(text=p, row=ri, col=ci) for ci, p in enumerate(parts) if p])
        if rows:
            raw = "\n".join(block)
            # 近似字符偏移
            prefix = "\n".join(lines[:start])
            s = len(prefix) + (1 if start else 0)
            out.append(TableBlock(rows=rows, raw_html=raw, start=s, end=s + len(raw)))
    return out


def extract_tables(text: str) -> list[TableBlock]:
    tables = parse_html_tables(text)
    if tables:
        return tables
    return parse_markdown_tables(text)


def iter_page_segments(text: str) -> list[tuple[str, str, int, int]]:
    """按版面切段：('table'|'text', body, start, end)。表整块保留。"""
    text = text or ""
    tables = extract_tables(text)
    if not tables:
        return [("text", text, 0, len(text))] if text.strip() else []
    # 按出现顺序切
    tables = sorted(tables, key=lambda t: t.start)
    segs: list[tuple[str, str, int, int]] = []
    cursor = 0
    for tb in tables:
        if tb.start > cursor:
            head = text[cursor : tb.start].strip()
            if head:
                segs.append(("text", head, cursor, tb.start))
        segs.append(("table", text[tb.start : tb.end], tb.start, tb.end))
        cursor = tb.end
    if cursor < len(text):
        tail = text[cursor:].strip()
        if tail:
            segs.append(("text", tail, cursor, len(text)))
    return segs


def _norm_rate(val: str) -> str:
    return re.sub(r"\s+", "", val or "").replace("＋", "+").replace("－", "-").replace("％", "%")


def metrics_from_cell_text(
    cell_text: str,
    *,
    row: int,
    col: int,
    page_scopes: Optional[list[str]] = None,
    row_header: str = "",
) -> list[dict[str, Any]]:
    """单单元格内抽指标；同比环比不得跨 cell。"""
    s = (cell_text or "").strip()
    if not s:
        return []
    yoy_m = _YOY_RE.search(s)
    mom_m = _MOM_RE.search(s)
    yoy = _norm_rate(yoy_m.group(2)) if yoy_m else None
    mom = _norm_rate(mom_m.group(2)) if mom_m else None
    rank_m = _RANK_RE.search(s)
    rank_badge = f"TOP{rank_m.group(1)}" if rank_m else None
    band_m = _PRICE_BAND_RE.search(s)

    # 纯增速格：留给行内配对，本身不产主指标
    primary = []
    for m in _METRIC_RE.finditer(s):
        num = (m.group(1) or "").replace(",", "")
        unit = (m.group(2) or "").replace("％", "%")
        raw = (m.group(0) or "").strip()
        if not num:
            continue
        # 跳过已被同比/环比捕获的百分比（避免重复当主值）
        span = m.span()
        if unit in {"%", ""} and (yoy_m or mom_m):
            if yoy_m and yoy_m.start(2) <= span[0] < yoy_m.end(2):
                continue
            if mom_m and mom_m.start(2) <= span[0] < mom_m.end(2):
                continue
        if unit in {"%", ""} and re.search(r"(同比|环比)\s*$", s[: m.start()]):
            continue
        if not unit and len(num.replace(".", "")) <= 2 and not band_m:
            continue
        if re.fullmatch(r"20\d{2}", num):
            continue
        primary.append((num, unit, raw, m.start()))

    if not primary:
        return []

    name = _infer_name(s, page_scopes=page_scopes or [], row_header=row_header)
    out: list[dict[str, Any]] = []
    # 取主 KPI：优先带 万/亿 的；价格带格可取首个销量
    primary.sort(
        key=lambda x: (
            0 if x[1] in {"万", "亿"} else 1 if x[1] == "%" else 2,
            x[3],
        )
    )
    num, unit, raw, _ = primary[0]
    metric = {
        "name": name,
        "value": num,
        "unit": unit or None,
        "yoy": yoy,
        "mom": mom,
        "rank_badge": rank_badge,
        "raw_text": s,
        "raw": raw,
        "bbox": {"row": row, "col": col, "source": "table_grid"},
        "provenance": "table_cell",
    }
    if band_m:
        metric["price_band"] = band_m.group(0).replace(" ", "")
        if name == "指标":
            metric["name"] = "价格带"
    out.append(metric)
    return out


def _infer_name(
    cell: str,
    *,
    page_scopes: list[str],
    row_header: str,
) -> str:
    """实体名：总销量/总销售额→大盘；TOP/品类销量→页内品类；行头品类优先。"""
    c = cell or ""
    h = row_header or ""

    if re.search(r"总销量|总销售额", c) or re.search(r"男装大盘", c):
        return "男装大盘"

    if _PRICE_BAND_RE.search(c) or "价格带" in c or "价格带" in h:
        for sc in ("男士衬衫", "polo衫"):
            if sc in h or sc in page_scopes:
                return sc
        return "价格带"

    if re.search(r"polo", c, re.I) or re.search(r"polo", h, re.I):
        return "polo衫"
    if re.search(r"男士衬衫|(?<![Pp]olo)衬衫", c) or re.search(
        r"男士衬衫|(?<![Pp]olo)衬衫", h
    ):
        return "男士衬衫"

    # 销量 TOP / 销售额 TOP → 品类页 scope
    if re.search(r"TOP|销量|销售额", c, re.I):
        for sc in ("polo衫", "男士衬衫"):
            if sc in page_scopes:
                return sc
        if "男装大盘" in page_scopes:
            return "男装大盘"

    if h:
        for sc in ("男士衬衫", "polo衫", "男装大盘"):
            if sc in h or (sc == "polo衫" and re.search(r"polo", h, re.I)):
                return sc
    return "指标"


def pair_rate_cells(row: list[Cell]) -> list[tuple[Cell, Optional[Cell]]]:
    """KPI 横排常见「值格 + 增速格」交替；把后继纯增速格并到前一格。"""
    pairs: list[tuple[Cell, Optional[Cell]]] = []
    i = 0
    while i < len(row):
        cur = row[i]
        nxt = row[i + 1] if i + 1 < len(row) else None
        if nxt and _is_rate_only_cell(nxt.text) and not _is_rate_only_cell(cur.text):
            pairs.append((cur, nxt))
            i += 2
        else:
            pairs.append((cur, None))
            i += 1
    return pairs


def _is_rate_only_cell(text: str) -> bool:
    s = (text or "").strip()
    if not s:
        return False
    if not re.search(r"同比|环比|占比", s):
        return False
    # 无 万/亿 主量
    if re.search(r"\d.+\s*[万亿]", s):
        return False
    return True


def _row_header_label(row: list[Cell]) -> str:
    """行首若是维度名（无万/亿主值）则作 header；KPI 横排首格是数值卡则不用。"""
    if not row:
        return ""
    head = row[0].text or ""
    if re.search(r"\d.+\s*[万亿]", head):
        return ""
    if _is_rate_only_cell(head):
        return ""
    return head


def metrics_from_table(
    table: TableBlock,
    *,
    page_scopes: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    scopes = page_scopes or []
    out: list[dict[str, Any]] = []
    for row in table.rows:
        if not row:
            continue
        header = _row_header_label(row)
        # 表头行跳过（全是维度名、无万亿主值）
        joined = " ".join(c.text for c in row)
        if re.search(r"价格带|本期销量|销量同比", joined) and not re.search(
            r"\d.+\s*[万亿]", joined
        ):
            continue
        for value_cell, rate_cell in pair_rate_cells(row):
            merged = value_cell.text
            if rate_cell:
                merged = f"{value_cell.text} {rate_cell.text}"
            mets = metrics_from_cell_text(
                merged,
                row=value_cell.row,
                col=value_cell.col,
                page_scopes=scopes,
                row_header=header if value_cell.col > 0 else header,
            )
            out.extend(mets)
    return out


def metrics_from_kpi_prose(
    text: str,
    *,
    page_scopes: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    """非表 KPI 卡：按「标签+数字+增速」邻近块切（版面块，非整页窗）。"""
    scopes = page_scopes or []
    s = re.sub(r"<[^>]+>", "\n", text or "")
    s = re.sub(r"[ \t]+", " ", s)
    # 用空行/标题切块
    blocks = re.split(r"\n{2,}|(?=##\s)", s)
    out: list[dict[str, Any]] = []
    for bi, block in enumerate(blocks):
        b = block.strip()
        if not b or len(b) < 4:
            continue
        if not re.search(r"\d.+\s*[万亿%％]", b):
            continue
        # 一块内再按「总销量|销量 TOP|销售额」切开
        parts = re.split(
            r"(?=(?:总销量|总销售额|(?:销量|销售额)\s*TOP))",
            b,
        )
        for pi, part in enumerate(parts):
            part = part.strip()
            if not part:
                continue
            mets = metrics_from_cell_text(
                part,
                row=bi,
                col=pi,
                page_scopes=scopes,
                row_header="",
            )
            for m in mets:
                m["provenance"] = "kpi_block"
                m["bbox"] = {"row": bi, "col": pi, "source": "kpi_block"}
            out.extend(mets)
    return out
