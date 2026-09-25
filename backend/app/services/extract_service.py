"""结构化抽取轨：版面坐标（表单元格/KPI 块）归属 → 页级 JSON。

与向量轨同源：同一次解析全文 → 切块 + JSONL。
LLM 仅可选贴标签，不得发明数字（见 extract_labeler）。
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Iterable, Optional

from app.config import get_settings
from app.services.table_structure import (
    extract_tables,
    iter_page_segments,
    metrics_from_kpi_prose,
    metrics_from_table,
)

_PAGE_MARK = re.compile(r"^\[(?:第|幻灯片)?\s*(\d+)\s*页?\]\s*", re.M)

_SCOPE_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("男装大盘", re.compile(r"男装大盘|品类大盘|平台男装|总销量|总销售额")),
    ("男士衬衫", re.compile(r"男士衬衫|商务男装衬衫|(?<![Pp]olo)衬衫")),
    ("polo衫", re.compile(r"polo\s*衫|男士polo|Polo|polo衫", re.I)),
    ("价格带", re.compile(r"价格带|[￥¥]\s*\d+")),
]

# 页类型 → schema 期望（缺漏显式报错，不静默）
PAGE_SCHEMAS: dict[str, dict[str, Any]] = {
    "category_kpi": {
        "min_metrics": 2,
        "require_units": {"万", "亿"},
        "fields": ["name", "value", "unit", "display", "mom", "yoy", "rank_badge"],
    },
    "macro": {
        "min_metrics": 2,
        "require_units": {"万", "亿"},
        "fields": ["name", "value", "unit", "mom", "yoy"],
    },
    "price_band": {
        "min_metrics": 3,
        "require_price_band_or_unit": True,
        "fields": ["price_band", "value", "unit"],
    },
    "ranking": {
        "min_metrics": 0,  # 图鉴页可无表数字
        "fields": ["name", "value"],
    },
    "attribute": {
        "min_metrics": 0,  # 图表页：无数字则 extract_warnings，不硬失败
        "prefer_min_metrics": 8,
        "fields": ["name", "value", "unit"],
    },
    "general": {"min_metrics": 0, "fields": ["name", "value"]},
}


def kb_extracts_dir(kb_name: str) -> Path:
    path = get_settings().kb_root / kb_name / "extracts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def kb_parses_dir(kb_name: str) -> Path:
    path = get_settings().kb_root / kb_name / "parses"
    path.mkdir(parents=True, exist_ok=True)
    return path


def extract_path(kb_name: str, file_name: str) -> Path:
    stem = Path(file_name).stem
    return kb_extracts_dir(kb_name) / f"{stem}.jsonl"


def parse_artifact_path(kb_name: str, file_name: str) -> Path:
    stem = Path(file_name).stem
    return kb_parses_dir(kb_name) / f"{stem}.json"


def _detect_scopes(text: str) -> list[str]:
    out: list[str] = []
    for name, pat in _SCOPE_RULES:
        if pat.search(text or "") and name not in out:
            out.append(name)
    return out


def _detect_page_type(text: str, scopes: list[str]) -> str:
    t = text or ""
    if re.search(r"属性特征|面料材质|图案花纹|属性销量", t):
        return "attribute"
    if "价格带" in scopes or ("价格带" in t and re.search(r"[￥¥]\d+", t)):
        # 含 KPI 卡 + 价格带表的品类大盘页 → category_kpi 优先
        if re.search(r"品类大盘|销量\s*TOP|总销量", t):
            return "category_kpi"
        return "price_band"
    if re.search(r"热销款式|爆款分析", t) and not re.search(r"品类大盘|总销量", t):
        return "ranking"
    if re.search(r"TOP\s*\d+|热销|榜单", t, re.I) and not re.search(
        r"品类大盘|总销量", t
    ):
        return "ranking"
    if "男装大盘" in scopes and "男士衬衫" not in scopes and "polo衫" not in scopes:
        return "macro"
    if "男士衬衫" in scopes or "polo衫" in scopes:
        if re.search(r"品类大盘|总销量|销量\s*TOP", t):
            return "category_kpi"
    return "general"


def _dedupe_metrics(metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for m in metrics:
        key = f"{m.get('value')}|{m.get('unit')}|{m.get('name')}|{m.get('rank_badge')}"
        if key in seen:
            continue
        seen.add(key)
        out.append(m)
    return out


def extract_metrics_layout(text: str, scopes: list[str]) -> list[dict[str, Any]]:
    """版面优先：表单元格 → KPI 散文块。禁止跨 cell 绑同比。"""
    metrics: list[dict[str, Any]] = []
    tables = extract_tables(text)
    covered = set()
    for tb in tables:
        covered.add((tb.start, tb.end))
        metrics.extend(metrics_from_table(tb, page_scopes=scopes))
    # 表外文本（去掉表 HTML，避免重复）
    residual = text or ""
    for tb in sorted(tables, key=lambda x: -x.start):
        residual = residual[: tb.start] + "\n" + residual[tb.end :]
    metrics.extend(metrics_from_kpi_prose(residual, page_scopes=scopes))
    return _dedupe_metrics(metrics)


def _validate_schema(
    page_type: str,
    metrics: list[dict[str, Any]],
) -> tuple[list[str], list[str]]:
    """返回 (errors, warnings)。errors=抽取失败；warnings=可继续但需盯。"""
    schema = PAGE_SCHEMAS.get(page_type) or PAGE_SCHEMAS["general"]
    errors: list[str] = []
    warnings: list[str] = []
    min_m = int(schema.get("min_metrics") or 0)
    if len(metrics) < min_m:
        errors.append(
            f"schema:{page_type} 期望至少 {min_m} 条指标，实际 {len(metrics)}"
        )
    prefer = schema.get("prefer_min_metrics")
    if prefer and len(metrics) < int(prefer):
        warnings.append(
            f"schema:{page_type} 建议至少 {prefer} 条，实际 {len(metrics)}（图表页可能需 VL 读数）"
        )
    req_units = schema.get("require_units")
    if req_units:
        units = {m.get("unit") for m in metrics}
        if not (units & set(req_units)):
            errors.append(
                f"schema:{page_type} 缺少单位 {sorted(req_units)} 的主指标"
            )
    # 无名「指标」过多
    anon = sum(1 for m in metrics if m.get("name") == "指标")
    if metrics and anon == len(metrics):
        warnings.append("全部指标未贴实体名，需 LLM 贴标签或检查页标题 scope")
    for m in metrics:
        raw = (m.get("raw_text") or m.get("raw") or "").replace(",", "")
        val = str(m.get("value") or "").replace(",", "")
        if val and raw and val not in raw:
            errors.append(f"raw_text 不含 value={val}")
    return errors, warnings


def extract_page_record(source: str, page: Optional[int], text: str) -> dict[str, Any]:
    scopes = _detect_scopes(text)
    page_type = _detect_page_type(text, scopes)
    metrics = extract_metrics_layout(text, scopes)
    # display 字段：原样展示串
    for m in metrics:
        unit = m.get("unit") or ""
        m["display"] = f"{m.get('value')}{unit}".strip()
        if m.get("rank_badge"):
            m["display"] = f"{m['rank_badge']} {m['display']}"
    errors, warnings = _validate_schema(page_type, metrics)
    # snippet 保留足量上下文（不再 240 截断 KPI）
    snippet = re.sub(r"\s+", " ", (text or "").strip())
    if len(snippet) > 4000:
        snippet = snippet[:4000]
    tables = extract_tables(text)
    return {
        "source": source,
        "page": page,
        "scopes": scopes,
        "page_type": page_type,
        "metrics": metrics,
        "tables": [
            {
                "n_rows": len(tb.rows),
                "n_cols": max((len(r) for r in tb.rows), default=0),
                "start": tb.start,
                "end": tb.end,
            }
            for tb in tables
        ],
        "snippet": snippet,
        "extract_errors": errors,
        "extract_warnings": warnings,
        "extract_ok": len(errors) == 0,
    }


def _pages_from_text(text: str) -> list[tuple[Optional[int], str]]:
    text = (text or "").strip()
    if not text:
        return []
    parts: list[tuple[Optional[int], str]] = []
    cur_page: Optional[int] = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        body = "\n".join(buf).strip()
        if body:
            parts.append((cur_page, body))
        buf = []

    for line in text.replace("\r\n", "\n").split("\n"):
        m = _PAGE_MARK.match(line.strip())
        if m:
            flush()
            cur_page = int(m.group(1))
            rest = _PAGE_MARK.sub("", line.strip(), count=1).strip()
            if rest:
                buf.append(rest)
            continue
        if line.strip():
            buf.append(line.strip())
    flush()
    return parts or [(None, text)]


def _pages_from_pieces(pieces: list[tuple[str, dict]]) -> list[tuple[Optional[int], str]]:
    by_page: dict[Optional[int], list[str]] = {}
    order: list[Optional[int]] = []
    for body, meta in pieces:
        page = meta.get("page")
        if page not in by_page:
            by_page[page] = []
            order.append(page)
        by_page[page].append(body)
    return [(p, "\n".join(by_page[p])) for p in order]


def save_parse_artifact(
    kb_name: str,
    file_name: str,
    text: str,
    *,
    ocr_meta: Optional[dict] = None,
) -> Path:
    """一次解析产物：按页全文 + 表段索引，供双轨同源。"""
    pages = []
    for page, body in _pages_from_text(text):
        segs = [
            {"kind": k, "start": s, "end": e, "chars": len(b)}
            for k, b, s, e in iter_page_segments(body)
        ]
        pages.append({"page": page, "chars": len(body), "segments": segs})
    payload = {
        "source": file_name,
        "ocr_meta": ocr_meta or {},
        "pages": pages,
        "full_text_chars": len(text or ""),
    }
    path = parse_artifact_path(kb_name, file_name)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def save_file_extract(
    kb_name: str,
    file_name: str,
    text: str,
    pieces: Optional[list[tuple[str, dict]]] = None,
    *,
    prefer_full_text: bool = True,
    label_with_llm: bool = False,
) -> Path:
    """写出 jsonl。默认用全文按页（与向量轨同源），pieces 仅作回退。"""
    if prefer_full_text and (text or "").strip():
        pages = _pages_from_text(text)
    elif pieces:
        pages = _pages_from_pieces(pieces)
    else:
        pages = _pages_from_text(text)

    path = extract_path(kb_name, file_name)
    lines: list[str] = []
    for page, body in pages:
        rec = extract_page_record(file_name, page, body)
        if label_with_llm:
            try:
                from app.services.extract_labeler import label_page_metrics

                rec = label_page_metrics(rec, body)
            except Exception as ex:  # noqa: BLE001
                rec.setdefault("extract_warnings", []).append(f"llm_label:{ex}")
        lines.append(json.dumps(rec, ensure_ascii=False))
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return path


def load_file_extract(kb_name: str, file_name: str) -> list[dict[str, Any]]:
    path = extract_path(kb_name, file_name)
    if not path.exists():
        return []
    out: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def delete_file_extract(kb_name: str, file_name: str) -> None:
    path = extract_path(kb_name, file_name)
    if path.exists():
        path.unlink()
    p2 = parse_artifact_path(kb_name, file_name)
    if p2.exists():
        p2.unlink()


def backfill_from_store(kb_name: str, file_name: str) -> int:
    """从已入向量库的 chunk 按页回填 extract（不重 OCR）。返回页数。"""
    from app.services.kb_service import get_store

    store = get_store(kb_name)
    by_page: dict[Optional[int], list[tuple[int, str]]] = {}
    for d in store.docs:
        meta = d.get("metadata") or {}
        if meta.get("source") != file_name:
            continue
        page = meta.get("page")
        chunk_i = meta.get("chunk")
        try:
            order_key = int(chunk_i) if chunk_i is not None else 0
        except (TypeError, ValueError):
            order_key = 0
        by_page.setdefault(page, []).append(
            (order_key, d.get("page_content") or "")
        )
    if not by_page:
        return 0
    # 拼全文（带页标）保证与入库同源
    parts: list[str] = []
    for page in sorted(by_page.keys(), key=lambda x: (x is None, x or 0)):
        chunks = sorted(by_page[page], key=lambda x: x[0])
        body = "\n".join(c for _, c in chunks)
        if page is not None:
            parts.append(f"[第{page}页]\n{body}")
        else:
            parts.append(body)
    full = "\n\n".join(parts)
    save_parse_artifact(kb_name, file_name, full, ocr_meta={"source": "backfill_store"})
    save_file_extract(kb_name, file_name, full, prefer_full_text=True)
    return len(by_page)


def _title_scopes(title: str) -> list[str]:
    return _detect_scopes(title or "")


def filter_extracts_for_query(
    records: list[dict[str, Any]],
    user_query: str,
) -> list[dict[str, Any]]:
    """按本页标题实体收窄：大盘页抬 macro，衬衫页抬衬衫指标。"""
    m = re.search(r"【本页标题】\s*([^\n【]{2,80})", user_query or "")
    title = m.group(1).strip() if m else ""
    want = _title_scopes(title)
    if not want and not title:
        return records[:12]
    scored: list[tuple[int, dict]] = []
    for rec in records:
        scopes = list(rec.get("scopes") or [])
        metrics = list(rec.get("metrics") or [])
        if want:
            pruned = [
                met
                for met in metrics
                if met.get("name") in want or met.get("name") in {"价格带", "指标"}
            ]
            if pruned:
                metrics = pruned
                rec = {**rec, "metrics": metrics}
        score = 0
        if want:
            if any(w in scopes for w in want):
                score += 5
            for met in metrics:
                if met.get("name") in want:
                    score += 3
        if "大盘" in title and "衬衫" not in title and "polo" not in title.lower():
            if rec.get("page_type") == "price_band" and "男装大盘" not in scopes:
                score -= 3
            if "男装大盘" in scopes:
                score += 4
        if "衬衫" in title and "polo" not in title.lower():
            if any(met.get("name") == "男士衬衫" for met in metrics):
                score += 4
        if re.search(r"polo", title, re.I):
            if any(met.get("name") == "polo衫" for met in metrics):
                score += 4
        if metrics:
            score += 1
        scored.append((score, rec))
    scored.sort(key=lambda x: x[0], reverse=True)
    picked = [r for s, r in scored if s > 0][:10]
    if not picked:
        picked = [r for r in records if r.get("metrics")][:8]
    return picked


def format_extracts_block(records: list[dict[str, Any]]) -> str:
    if not records:
        return ""
    lines = [
        "【结构化指标库·优先采信】下列指标已从材料页按单元格/KPI 块抽出。"
        "写 tips 时数字与口径实体必须成对取自同一条；禁止跨条拼装，禁止改成 TOP 合计。",
    ]
    for i, rec in enumerate(records, 1):
        page = rec.get("page")
        scopes = "、".join(rec.get("scopes") or []) or "—"
        ptype = rec.get("page_type") or "general"
        flag = "OK" if rec.get("extract_ok", True) else "FAIL"
        lines.append(
            f"({i})[{flag}] 源={rec.get('source')} 页={page} 类型={ptype} 实体={scopes}"
        )
        for err in rec.get("extract_errors") or []:
            lines.append(f"  ! {err}")
        shown = 0
        for met in rec.get("metrics") or []:
            name = met.get("name") or "指标"
            unit = met.get("unit") or ""
            if name == "指标" and unit not in {"万", "亿", "%"}:
                continue
            extra = ""
            if met.get("rank_badge"):
                extra += f" {met['rank_badge']}"
            if met.get("yoy"):
                extra += f" 同比{met['yoy']}"
            if met.get("mom"):
                extra += f" 环比{met['mom']}"
            if met.get("price_band"):
                extra += f" {met['price_band']}"
            lines.append(f"  - {met.get('value')}{unit} {name}{extra}")
            shown += 1
            if shown >= 16:
                break
    return "\n".join(lines)


def build_extract_context(
    kb_name: str,
    sources: Iterable[str],
    user_query: str,
) -> str:
    all_recs: list[dict[str, Any]] = []
    seen_src: set[str] = set()
    for src in sources:
        if not src or src in seen_src:
            continue
        seen_src.add(src)
        all_recs.extend(load_file_extract(kb_name, src))
    if not all_recs:
        return ""
    filtered = filter_extracts_for_query(all_recs, user_query)
    return format_extracts_block(filtered)


def extracts_as_pseudo_docs(
    kb_name: str,
    sources: Iterable[str],
    user_query: str,
) -> list[dict]:
    """把结构化指标变成伪 docs，供前端证据校验与 docs_payload。"""
    block_recs = []
    all_recs: list[dict[str, Any]] = []
    for src in sources:
        if src:
            all_recs.extend(load_file_extract(kb_name, src))
    for rec in filter_extracts_for_query(all_recs, user_query):
        metrics = rec.get("metrics") or []
        if not metrics:
            continue
        lines = []
        for met in metrics:
            unit = met.get("unit") or ""
            name = met.get("name") or ""
            badge = met.get("rank_badge") or ""
            lines.append(f"{badge} {met.get('value')}{unit} {name}".strip())
            if met.get("yoy"):
                lines.append(f"{met['yoy']} {name}同比".strip())
            if met.get("mom"):
                lines.append(f"{met['mom']} {name}环比".strip())
        body = "\n".join(lines)
        page = rec.get("page")
        src = rec.get("source") or ""
        content = f"⟦chunk:extract-p{page}|page:{page}⟧\n{body}"
        block_recs.append(
            {
                "page_content": content,
                "metadata": {
                    "source": src,
                    "kb_name": kb_name,
                    "chunk": f"extract-{page}",
                    "page": page,
                    "kind": "extract",
                },
                "score": 1.0,
                "vector_score": 1.0,
            }
        )
    return block_recs
