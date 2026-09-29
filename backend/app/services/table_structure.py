"""版面结构解析：从 VL Markdown/HTML 表还原单元格归属。

归属原则：数字与同比/环比只在同一 cell（或同一 KPI 卡片块）内绑定；
表行用行序（及可选 bbox）分组；行头/价带标签绑定到同名指标。
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
_SHARE_RE = re.compile(r"占比\s*([+\-＋－]?\s*\d+(?:\.\d+)?\s*[%％])")
_RANK_RE = re.compile(r"TOP\s*(\d+)", re.I)
_PRICE_BAND_RE = re.compile(
    r"[￥¥]\s*\d+(?:\.\d+)?\s*[-~～至到]\s*\d+(?:\.\d+)?|"
    r"[￥¥]\s*\d+(?:\.\d+)?\s*元?\s*(?:以下|以上)|"
    r"\d+\s*元\s*(?:以下|以上)|"
    r"\d+\s*[-~～至到]\s*\d+\s*元"
)
_PURE_PCT_RE = re.compile(
    r"^[+\-＋－]?\s*\d+(?:\.\d+)?\s*[%％]$"
)
_ATTR_PAIR_RE = re.compile(
    r"(?<![A-Za-z0-9])([\u4e00-\u9fffA-Za-z]{1,12})\s*"
    r"(\d+(?:\.\d+)?)\s*([%％])"
)
_PRODUCT_CAPTION_RE = re.compile(
    r"([￥¥]\s*\d+(?:\.\d+)?(?:\s*[-–—~～至到]\s*\d+(?:\.\d+)?)?)"
    r"\s*本期销量\s*[:：]?\s*"
    r"(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(万|件)?"
)
_SALES_ONLY_CAPTION_RE = re.compile(
    r"本期销量\s*[:：]?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(万|件)?"
)


@dataclass
class Cell:
    text: str
    row: int
    col: int
    bbox: Optional[list[float]] = None
    is_th: bool = False


@dataclass
class TableBlock:
    rows: list[list[Cell]] = field(default_factory=list)
    raw_html: str = ""
    start: int = 0
    end: int = 0
    profile: Optional[dict[str, Any]] = None


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
            for ci, td in enumerate(
                re.finditer(r"<t([dh])\b[^>]*>([\s\S]*?)</t\1>", tr.group(0), re.I)
            ):
                tag, body = td.group(1), td.group(2)
                cells.append(
                    Cell(
                        text=_strip_html(body),
                        row=ri,
                        col=ci,
                        is_th=(tag.lower() == "h"),
                    )
                )
            if cells:
                rows.append(cells)
        if rows:
            out.append(TableBlock(rows=rows, raw_html=html, start=m.start(), end=m.end()))
    return out


def parse_markdown_tables(text: str) -> list[TableBlock]:
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
        body = [ln for ln in block if not _MD_TABLE_SEP.match(ln)]
        has_sep = any(_MD_TABLE_SEP.match(ln) for ln in block)
        rows: list[list[Cell]] = []
        for ri, ln in enumerate(body):
            parts = [p.strip() for p in ln.strip().strip("|").split("|")]
            rows.append(
                [
                    Cell(text=p, row=ri, col=ci, is_th=(has_sep and ri == 0))
                    for ci, p in enumerate(parts)
                    if p
                ]
            )
        if rows:
            raw = "\n".join(block)
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
    text = text or ""
    tables = extract_tables(text)
    if not tables:
        return [("text", text, 0, len(text))] if text.strip() else []
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
    return (
        re.sub(r"\s+", "", val or "")
        .replace("＋", "+")
        .replace("－", "-")
        .replace("％", "%")
    )


def _is_noise_arrow(text: str) -> bool:
    return bool(re.fullmatch(r"\\?uparrow|↑|↓|→", (text or "").strip(), re.I))


def _is_pure_pct_cell(text: str) -> bool:
    s = (text or "").strip()
    if _PURE_PCT_RE.match(s):
        return True
    # 无标签的光杆百分比
    if re.fullmatch(r"[+\-＋－]?\d+(?:\.\d+)?\s*[%％]", s):
        return True
    return False


def _is_rate_only_cell(text: str) -> bool:
    s = (text or "").strip()
    if not s or _is_noise_arrow(s):
        return False
    if _is_pure_pct_cell(s):
        return True
    if not re.search(r"同比|环比|占比", s):
        return False
    if re.search(r"\d.+\s*[万亿]", s):
        return False
    return True


def _is_volume_cell(text: str) -> bool:
    return bool(re.search(r"\d.+\s*[万亿件]", text or ""))


def _row_labels(row: list[Cell]) -> tuple[str, Optional[str]]:
    """同行最左文本标签 → name；价带格 → price_band。"""
    labels: list[str] = []
    band: Optional[str] = None
    for c in row:
        t = (c.text or "").strip()
        if not t or _is_noise_arrow(t):
            continue
        if _is_volume_cell(t) or _is_pure_pct_cell(t) or _is_rate_only_cell(t):
            break
        bm = _PRICE_BAND_RE.search(t)
        if bm and not _is_volume_cell(t):
            band = bm.group(0).replace(" ", "")
            if not labels:
                labels.append(band)
            continue
        # 维度字：主力价格带 / 商品名 / 男士polo衫
        if re.search(r"[\u4e00-\u9fffA-Za-z]", t):
            labels.append(t)
    name = labels[0] if labels else ""
    return name, band


def _infer_name(
    cell: str,
    *,
    page_scopes: list[str],
    row_header: str,
) -> str:
    c = cell or ""
    h = row_header or ""

    if re.search(r"总销量|总销售额", c) or re.search(r"男装大盘", c):
        return "男装大盘"

    # 行头优先：价格带标签 / 商品名 / 品类词
    if h:
        if _PRICE_BAND_RE.search(h) or "价格带" in h:
            for sc in ("男士衬衫", "polo衫"):
                if sc in page_scopes:
                    return sc
            return h if len(h) <= 24 else "价格带"
        if re.search(r"polo", h, re.I):
            return "polo衫"
        if re.search(r"男士衬衫|(?<![Pp]olo)衬衫", h):
            return "男士衬衫"
        if re.search(r"[\u4e00-\u9fff]", h) and not re.search(
            r"本期|同比|环比|占比|销量|销售额", h
        ):
            # 商品名/店铺名等行头
            return h[:32]

    if _PRICE_BAND_RE.search(c) or "价格带" in c:
        for sc in ("男士衬衫", "polo衫"):
            if sc in page_scopes:
                return sc
        return "价格带"

    if re.search(r"polo", c, re.I):
        return "polo衫"
    if re.search(r"男士衬衫|(?<![Pp]olo)衬衫", c):
        return "男士衬衫"

    if re.search(r"TOP|销量|销售额", c, re.I):
        for sc in ("polo衫", "男士衬衫"):
            if sc in page_scopes:
                return sc
        if "男装大盘" in page_scopes:
            return "男装大盘"
    return "指标"


def metrics_from_cell_text(
    cell_text: str,
    *,
    row: int,
    col: int,
    page_scopes: Optional[list[str]] = None,
    row_header: str = "",
    price_band: Optional[str] = None,
    attach_rate: Optional[str] = None,
    attach_rate_kind: Optional[str] = None,
) -> list[dict[str, Any]]:
    """单单元格内抽指标；同比环比不得跨 cell；无标签速率不伪造成 yoy。"""
    s = (cell_text or "").strip()
    if not s or _is_noise_arrow(s):
        return []
    # 纯占比/纯增速格不单独建条（由行合并）
    if _is_pure_pct_cell(s) and not re.search(r"万|亿|件", s):
        return []

    yoy_m = _YOY_RE.search(s)
    mom_m = _MOM_RE.search(s)
    share_m = _SHARE_RE.search(s)
    yoy = _norm_rate(yoy_m.group(2)) if yoy_m else None
    mom = _norm_rate(mom_m.group(2)) if mom_m else None
    share = _norm_rate(share_m.group(1)) if share_m else None
    rate_unlabeled: Optional[str] = None

    # 邻格速率：仅当列头/邻格明文声明同比|环比|占比 才落入对应字段
    if attach_rate and not yoy and not mom:
        kind = (attach_rate_kind or "unlabeled").lower()
        rate = _norm_rate(attach_rate)
        if kind == "yoy" and not yoy:
            yoy = rate
        elif kind == "mom" and not mom:
            mom = rate
        elif kind == "share" and not share:
            share = rate
        else:
            rate_unlabeled = rate

    rank_m = _RANK_RE.search(s)
    rank_badge = f"TOP{rank_m.group(1)}" if rank_m else None
    band_m = _PRICE_BAND_RE.search(s)
    band = price_band or (band_m.group(0).replace(" ", "") if band_m else None)

    primary = []
    for m in _METRIC_RE.finditer(s):
        num = (m.group(1) or "").replace(",", "")
        unit = (m.group(2) or "").replace("％", "%")
        raw = (m.group(0) or "").strip()
        if not num:
            continue
        span = m.span()
        if unit in {"%", ""} and (yoy_m or mom_m or share_m):
            if yoy_m and yoy_m.start(2) <= span[0] < yoy_m.end(2):
                continue
            if mom_m and mom_m.start(2) <= span[0] < mom_m.end(2):
                continue
            if share_m and share_m.start(1) <= span[0] < share_m.end(1):
                continue
        if unit in {"%", ""} and re.search(r"(同比|环比|占比)\s*$", s[: m.start()]):
            continue
        # 价带数字 50/100 不要当主指标
        if band_m and unit in {"", "元"} and not re.search(r"万|亿|件", raw):
            continue
        if not unit and len(num.replace(".", "")) <= 2 and not band_m:
            continue
        if re.fullmatch(r"20\d{2}", num):
            continue
        primary.append((num, unit, raw, m.start()))

    if not primary:
        return []

    name = _infer_name(s, page_scopes=page_scopes or [], row_header=row_header)
    primary.sort(
        key=lambda x: (
            0 if x[1] in {"万", "亿"} else 1 if x[1] == "件" else 2 if x[1] == "%" else 3,
            x[3],
        )
    )
    num, unit, raw, _ = primary[0]
    # 不要把「销量同比 35.94%」独立成主条（无万亿）
    if unit == "%" and not re.search(r"万|亿|件", s):
        return []

    metric: dict[str, Any] = {
        "name": name,
        "value": num,
        "unit": unit or None,
        "yoy": yoy,
        "mom": mom,
        "share": share,
        "rank_badge": rank_badge,
        "raw_text": (
            s if not attach_rate else f"{s} {attach_rate}".strip()
        ),
        "raw": raw,
        "bbox": {"row": row, "col": col, "source": "table_grid"},
        "provenance": "table_cell",
    }
    if rate_unlabeled:
        metric["rate_unlabeled"] = rate_unlabeled
    if band:
        metric["price_band"] = band
        if name == "指标":
            metric["name"] = band
    return [metric]


def pair_rate_cells(row: list[Cell]) -> list[tuple[Cell, Optional[Cell]]]:
    pairs: list[tuple[Cell, Optional[Cell]]] = []
    i = 0
    while i < len(row):
        cur = row[i]
        nxt = row[i + 1] if i + 1 < len(row) else None
        if (
            nxt
            and _is_rate_only_cell(nxt.text)
            and _is_volume_cell(cur.text)
            and not _is_rate_only_cell(cur.text)
        ):
            pairs.append((cur, nxt))
            i += 2
        else:
            pairs.append((cur, None))
            i += 1
    return pairs


def _find_column_headers(table: TableBlock) -> dict[int, str]:
    """找列名行：含「本期销量/同比/价格带」且无万亿量值。"""
    for row in table.rows:
        if not row:
            continue
        joined = " ".join(c.text for c in row)
        if re.search(r"本期销量|销量同比|销售额同比|价格带|环比", joined) and not re.search(
            r"\d.+\s*[万亿]", joined
        ):
            return {c.col: (c.text or "").strip() for c in row}
    return {}


def _row_visual_offset(table: TableBlock, row: list[Cell]) -> int:
    """rowspan 续行左侧缺格时，把 cell.col 映射到列头坐标系。"""
    if not row or not table.rows:
        return 0
    max_n = max(len(r) for r in table.rows)
    n = len(row)
    if n >= max_n:
        return 0
    return max_n - n


def classify_attached_rate(rate_text: str, col_header: str = "") -> str:
    """判定邻格速率语义。无明文标签 → unlabeled（禁止默认当成同比）。"""
    blob = f"{rate_text or ''} {col_header or ''}"
    if re.search(r"同比", blob):
        return "yoy"
    if re.search(r"环比", blob):
        return "mom"
    if re.search(r"占比", blob):
        return "share"
    return "unlabeled"


def axis_from_header(
    col_header: str = "",
    *,
    row_header: str = "",
    price_band: Optional[str] = None,
) -> Optional[str]:
    """列头/行键 → 语义轴名（可写入 metric.axis，供检索/闸门查表）。

    与 table_profile.header_axis（行/列方向）不同：这里是「价格带/面料/销量」等业务轴。
    """
    if price_band:
        return "价格带"
    blob = f"{col_header or ''} {row_header or ''}"
    if re.search(r"价格带|价位段|价位", blob):
        return "价格带"
    if re.search(r"面料|材质", blob):
        return "面料"
    if re.search(r"图案|花纹", blob):
        return "图案"
    if re.search(r"厚薄", blob):
        return "厚薄"
    if re.search(r"袖型", blob) or (
        re.search(r"袖", blob) and re.search(r"落肩袖|灯笼袖|短袖|长袖", blob)
    ):
        return "袖型"
    ch = (col_header or "").strip()
    if re.search(r"本期销售额|销售额", ch):
        return "销售额"
    if re.search(r"本期销量|销量", ch) and not re.search(r"同比|环比", ch):
        return "销量"
    return None


def _value_col_header(
    col_headers: dict[int, str],
    value_cell: Cell,
    row_off: int,
    header_shift: int,
) -> str:
    vis = value_cell.col + row_off
    hdr_col = vis - header_shift if header_shift else vis
    return (col_headers.get(hdr_col, "") or col_headers.get(value_cell.col, "") or "").strip()


def metrics_from_table(
    table: TableBlock,
    *,
    page_scopes: Optional[list[str]] = None,
    page_type: str = "general",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """按页型 schema / 信号投票抽表；返回 (metrics, table_profile)。"""
    from app.services.table_profile import infer_table_profile, row_key_from_profile

    scopes = page_scopes or []
    profile = infer_table_profile(table, page_type=page_type)
    table.profile = profile.to_dict()
    out: list[dict[str, Any]] = []
    col_headers = _find_column_headers(table)
    # 列头坐标系：若数据最宽行比列头多 1（左侧分组），列头整体右移对齐
    header_shift = 0
    if col_headers and table.rows:
        max_n = max(len(r) for r in table.rows)
        if max_n == max(col_headers.keys()) + 2:
            header_shift = 1

    header_rows = profile.header_rows
    for ri, row in enumerate(table.rows):
        if not row:
            continue
        # 上表头行跳过（密度/schema 判定）
        if ri < header_rows and profile.convention != "page_schema:category_kpi":
            joined = " ".join(c.text for c in row)
            if not re.search(r"\d.+\s*[万亿]", joined):
                continue
        joined = " ".join(c.text for c in row)
        if re.search(r"价格带|本期销量|销量同比", joined) and not re.search(
            r"\d.+\s*[万亿]", joined
        ):
            continue

        header, band = row_key_from_profile(row, profile)
        row_off = _row_visual_offset(table, row)
        for value_cell, rate_cell in pair_rate_cells(row):
            vt = (value_cell.text or "").strip()
            if not vt or _is_noise_arrow(vt):
                continue
            if not _is_volume_cell(vt) and not re.search(r"总销量|总销售额|TOP", vt):
                if _PRICE_BAND_RE.search(vt) or (header and vt == header):
                    continue
            attach = None
            attach_kind = None
            if rate_cell:
                rt = (rate_cell.text or "").strip()
                if _is_pure_pct_cell(rt):
                    attach = rt if "%" in rt or "％" in rt else rt + "%"
                    # 视觉列 = cell.col + rowspan 左缺偏移；再与列头坐标系对齐
                    vis = rate_cell.col + row_off
                    # 列头若无左侧分组列，数据全行多一格时 header 下标 = vis - header_shift
                    hdr_col = vis - header_shift if header_shift else vis
                    hdr = col_headers.get(hdr_col, "") or col_headers.get(
                        rate_cell.col, ""
                    )
                    # rowspan 续行：直取仍 unlabeled 时，试「量列+1」= 同比列
                    kind = classify_attached_rate(rt, hdr)
                    if kind == "unlabeled" and hdr_col - 1 in col_headers:
                        prev_h = col_headers.get(hdr_col - 1, "")
                        if re.search(r"本期销量|本期销售额|销量|销售额", prev_h):
                            # 量列旁的纯% 在价带表里几乎都是「销量同比」列，
                            # 但仍不默认 yoy：只有表内存在任一「同比」列名才认
                            if any(re.search(r"同比", h) for h in col_headers.values()):
                                kind = "yoy"
                            elif any(re.search(r"环比", h) for h in col_headers.values()):
                                kind = "mom"
                    attach_kind = kind
                else:
                    # 邻格带标签文本（「同比 +26.9%」）并入本格，由正则抽取
                    vt = f"{vt} {rt}"
            mets = metrics_from_cell_text(
                vt,
                row=value_cell.row,
                col=value_cell.col,
                page_scopes=scopes,
                row_header=header,
                price_band=band,
                attach_rate=attach,
                attach_rate_kind=attach_kind,
            )
            value_hdr = _value_col_header(
                col_headers, value_cell, row_off, header_shift
            )
            axis = axis_from_header(
                value_hdr, row_header=header or "", price_band=band
            )
            for m in mets:
                m["table_convention"] = profile.convention
                if value_hdr:
                    m["col_header"] = value_hdr
                if axis:
                    m["axis"] = axis
                elif m.get("price_band"):
                    m["axis"] = "价格带"
            out.extend(mets)
    return out, profile.to_dict()


def metrics_from_table_flat(
    table: TableBlock,
    *,
    page_scopes: Optional[list[str]] = None,
    page_type: str = "general",
) -> list[dict[str, Any]]:
    """兼容旧调用：只返回 metrics。"""
    mets, _ = metrics_from_table(
        table, page_scopes=page_scopes, page_type=page_type
    )
    return mets


def metrics_from_kpi_prose(
    text: str,
    *,
    page_scopes: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    scopes = page_scopes or []
    s = re.sub(r"<[^>]+>", "\n", text or "")
    s = re.sub(r"[ \t]+", " ", s)
    blocks = re.split(r"\n{2,}|(?=##\s)", s)
    out: list[dict[str, Any]] = []
    for bi, block in enumerate(blocks):
        b = block.strip()
        if not b or len(b) < 4:
            continue
        if not re.search(r"\d.+\s*[万亿%％]", b):
            continue
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


# 属性轴 → 专属标签（图表 OCR 整块挂在错误节标题后时，用轴归属纠偏品类）
_ATTR_AXIS_LABELS: dict[str, frozenset[str]] = {
    "面料": frozenset(
        {"棉", "聚酯纤维", "涤纶", "粘胶纤维", "醋酯纤维", "锦纶", "氨纶"}
    ),
    "图案": frozenset({"纯色", "几何图案", "条纹", "字母", "动物图案"}),
    "厚薄": frozenset({"薄款", "厚款", "加厚", "超薄"}),
    "袖型": frozenset(
        # 「常规」为 OCR 常截断形（缺「袖」）；与「常规袖」并存时由 rankings 去重保高 pct
        {"落肩袖", "灯笼袖", "常规袖", "常规", "插肩袖", "短袖", "长袖"}
    ),
}
_ATTR_AXIS_HEADING_RE = re.compile(
    r"^(面料材质|面料|材质|图案花纹|图案|花纹|厚薄|袖型)$"
)


def _attr_axis_of_label(label: str) -> Optional[str]:
    for axis, labs in _ATTR_AXIS_LABELS.items():
        if label in labs:
            return axis
    return None


def _dedupe_ranking_label_items(
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """同轴内标签互相包含时只保留更高 pct（常规 79.76 压掉 常规袖 1.50）。"""
    ordered = sorted(
        items, key=lambda x: (-float(x.get("pct") or 0), str(x.get("name") or ""))
    )
    kept: list[dict[str, Any]] = []
    for it in ordered:
        name = str(it.get("name") or "")
        if not name:
            continue
        if any(k["name"] == name for k in kept):
            continue
        if any(
            name != k["name"] and (name in k["name"] or k["name"] in name)
            for k in kept
        ):
            continue
        kept.append({"name": name, "pct": float(it["pct"])})
    return kept


def build_rankings_from_metrics(
    metrics: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """任务 3 第 2 步：从已有属性指标聚合成排序 JSON（不另起 OCR 产物）。

    形如 {dim, items:[{name,pct}…按 pct 降序], top}。
    """
    by_dim: dict[str, list[dict[str, Any]]] = {}
    for m in metrics or []:
        unit = str(m.get("unit") or "").replace("％", "%")
        if unit != "%":
            continue
        label = str(m.get("attr_label") or "").strip()
        if not label:
            continue
        try:
            pct = float(str(m.get("value") or "").replace(",", ""))
        except (TypeError, ValueError):
            continue
        dim = str(m.get("axis") or "").strip() or (_attr_axis_of_label(label) or "")
        if not dim:
            continue
        by_dim.setdefault(dim, []).append({"name": label, "pct": pct})

    out: list[dict[str, Any]] = []
    for dim, items in by_dim.items():
        merged = _dedupe_ranking_label_items(items)
        merged.sort(key=lambda x: (-x["pct"], x["name"]))
        if len(merged) < 2:
            continue
        out.append({"dim": dim, "items": merged, "top": dict(merged[0])})
    out.sort(key=lambda r: r["dim"])
    return out


def metrics_from_attribute_prose(
    text: str,
    *,
    page_scopes: Optional[list[str]] = None,
    page_type: str = "general",
) -> list[dict[str, Any]]:
    """属性页：纯文本「棉 72.18%」类 label+占比，不依赖读图。

    仅 attribute 页启用，避免 KPI 脚注文案被误抽成属性指标。
    双品类页常见「图表OCR」整块落在后一节后：用轴标题归属（面料/图案→Polo，
    厚薄/袖型→衬衫）纠正 name，避免 polo 面料数被标成男士衬衫。
    """
    if page_type != "attribute":
        return []
    scopes = page_scopes or []
    plain = re.sub(r"<[^>]+>", "\n", text or "")
    plain = re.sub(r"[ \t]+", " ", plain)
    # RapidOCR 分行「棉\\n72.18%」→「棉 72.18%」
    plain = re.sub(
        r"([\u4e00-\u9fffA-Za-z]{1,12})\s*\n\s*(\d+(?:\.\d+)?\s*[%％])",
        r"\1 \2",
        plain,
    )
    # 当前小节（男士Polo衫 / 男士衬衫）；轴标题 → 品类归属
    section = ""
    axis_owner: dict[str, str] = {}
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    _SKIP_LABELS = {
        "占比",
        "同比",
        "环比",
        "销量",
        "属性",
        "分析",
        "采样",
        "时间",
        "材质",
        "花纹",
        "厚薄",
        "袖型",
        "提升",
        "均达",
    }
    for line in plain.splitlines():
        line = line.strip()
        if not line:
            continue
        if re.search(r"男士\s*Polo|polo", line, re.I) and "衬衫" not in line:
            section = "polo衫"
        elif re.search(r"男士衬衫|衬衫", line) and not re.search(r"polo", line, re.I):
            section = "男士衬衫"
        # 轴标题行：记下该轴属于当前节（OCR 数字后置时靠此纠偏）
        heading = _ATTR_AXIS_HEADING_RE.search(line)
        if heading and section:
            raw_h = heading.group(1)
            if "面料" in raw_h or raw_h == "材质":
                axis_owner["面料"] = section
            elif "图案" in raw_h or raw_h == "花纹":
                axis_owner["图案"] = section
            elif raw_h == "厚薄":
                axis_owner["厚薄"] = section
            elif raw_h == "袖型":
                axis_owner["袖型"] = section
        for m in _ATTR_PAIR_RE.finditer(line):
            label = (m.group(1) or "").strip()
            num = m.group(2)
            unit = m.group(3).replace("％", "%")
            if label in _SKIP_LABELS:
                continue
            # 句式碎片：「环比提升均达250%」不是属性标签
            if re.search(r"同比|环比|提升|均达|以上|以下|左右", label):
                continue
            if len(label) >= 6 and not re.fullmatch(
                r"[\u4e00-\u9fffA-Za-z]{1,5}", label
            ):
                # 属性标签通常短（棉/纯色/短袖）；过长多半是散文碎片
                continue
            if re.fullmatch(r"20\d{2}", num or ""):
                continue
            axis = _attr_axis_of_label(label)
            name = (
                (axis_owner.get(axis) if axis else None)
                or section
                or next((sc for sc in ("polo衫", "男士衬衫") if sc in scopes), "属性")
            )
            key = f"{label}|{num}{unit}|{name}"
            if key in seen:
                continue
            seen.add(key)
            out.append(
                {
                    "name": name,
                    "value": num,
                    "unit": unit,
                    "attr_label": label,
                    # value 即占比本身，不再重复写入 share
                    "yoy": None,
                    "mom": None,
                    "rank_badge": None,
                    "raw_text": m.group(0),
                    "raw": f"{num}{unit}",
                    "bbox": {"source": "attribute_text"},
                    "provenance": "attribute_text",
                    **({"axis": axis} if axis else {}),
                }
            )
    return out


def metrics_from_product_captions(
    text: str,
    *,
    page_scopes: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    """图鉴/爆款页：caption「¥59.90 本期销量：6771」+ 邻近标题作 name。"""
    scopes = page_scopes or []
    plain = re.sub(r"<img\b[^>]*>", "\n", text or "", flags=re.I)
    plain = re.sub(r"<[^>]+>", "\n", plain)
    # 按 ## 标题切段
    parts = re.split(r"(?=##\s)", plain)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for part in parts:
        part = part.strip()
        if not part:
            continue
        title_m = re.search(r"##\s*([^\n#]{2,40})", part)
        title = (title_m.group(1).strip() if title_m else "") or ""
        # 跳过版式噪声标题
        if title.upper() in {"TREND"} or title in {"爆款分析"}:
            title = ""
        for m in _PRODUCT_CAPTION_RE.finditer(part):
            price = re.sub(r"\s+", "", m.group(1))
            num = (m.group(2) or "").replace(",", "")
            unit = m.group(3) or None
            key = f"{price}|{num}|{title}"
            if key in seen:
                continue
            seen.add(key)
            name = title or next(
                (sc for sc in ("男士衬衫", "polo衫") if sc in scopes), "商品"
            )
            out.append(
                {
                    "name": name,
                    "value": num,
                    "unit": unit,
                    "price": price,
                    "yoy": None,
                    "mom": None,
                    "rank_badge": None,
                    "raw_text": m.group(0).strip(),
                    "raw": f"{num}{unit or ''}",
                    "bbox": {"source": "product_caption"},
                    "provenance": "product_caption",
                }
            )
        # 无价格仅销量
        if not out or title:
            for m in _SALES_ONLY_CAPTION_RE.finditer(part):
                # 已被带价模式吃掉的跳过
                start = m.start()
                window = part[max(0, start - 24) : start]
                if re.search(r"[￥¥]\s*\d", window):
                    continue
                num = (m.group(1) or "").replace(",", "")
                unit = m.group(2) or None
                key = f"sales|{num}|{title}"
                if key in seen:
                    continue
                seen.add(key)
                name = title or next(
                    (sc for sc in ("男士衬衫", "polo衫") if sc in scopes), "商品"
                )
                out.append(
                    {
                        "name": name,
                        "value": num,
                        "unit": unit,
                        "yoy": None,
                        "mom": None,
                        "rank_badge": None,
                        "raw_text": m.group(0).strip(),
                        "raw": f"{num}{unit or ''}",
                        "bbox": {"source": "product_caption"},
                        "provenance": "product_caption",
                    }
                )
    return out
