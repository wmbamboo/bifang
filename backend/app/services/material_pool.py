"""材料池 + 分段分配器（任务 4B）。

主形态：方案 B「新端点」——阶段 1+2 在后端一次算完，产出「章节→片段」分配表；
前端再逐段带着 assigned_doc_keys 生成。账本只驻留本次请求结果，不进模块全局缓存。

打分只用通用信号（词面重叠、章序/池序邻近、可选向量分），**禁止** import 领域词表。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional
import re

_TOKEN_RE = re.compile(
    r"[\u4e00-\u9fff]{2}|[A-Za-z][A-Za-z0-9]{1,}|\d+(?:\.\d+)?%?"
)


def tokenize(text: str) -> set[str]:
    return {m.group(0).lower() for m in _TOKEN_RE.finditer(text or "")}


def stable_material_key(doc: dict[str, Any]) -> str:
    """稳定键：kb|source|chunk；缺 chunk 时退回正文头。"""
    meta = doc.get("metadata") or {}
    kb = str(meta.get("kb_name") or "")
    source = str(meta.get("source") or "")
    chunk = meta.get("chunk")
    if source and chunk is not None and str(chunk) != "":
        return f"{kb}|{source}|{chunk}"
    head = (doc.get("page_content") or "")[:48]
    return f"{kb}|{source}|{head}"


@dataclass
class ChapterSpec:
    chapter_id: str
    title: str
    points: list[str] = field(default_factory=list)


@dataclass
class AllocationResult:
    by_chapter: dict[str, list[str]]
    unused: list[str]
    key_to_doc: dict[str, dict[str, Any]] = field(default_factory=dict)


def score_chapter_doc(
    chapter: ChapterSpec,
    doc: dict[str, Any],
    *,
    chapter_index: int,
    n_chapters: int,
    pool_index: int,
    pool_size: int,
) -> float:
    blob = f"{chapter.title} {' '.join(chapter.points)}"
    content = (doc.get("page_content") or "")[:1200]
    ct, dt = tokenize(blob), tokenize(content)
    overlap = (len(ct & dt) / len(ct)) if ct else 0.0
    meta = doc.get("metadata") or {}
    try:
        page_ord = float(
            meta["page"]
            if meta.get("page") is not None
            else (meta["chunk"] if meta.get("chunk") is not None else pool_index)
        )
    except (TypeError, ValueError):
        page_ord = float(pool_index)
    # 用 page_ord 与池序混合近似「文档内位置」
    doc_pos = (
        (0.6 * (pool_index / max(1, pool_size - 1)))
        + (0.4 * min(1.0, page_ord / max(1.0, float(pool_size))))
        if pool_size > 1
        else 0.0
    )
    ch_pos = chapter_index / max(1, n_chapters - 1) if n_chapters > 1 else 0.0
    pos = 1.0 - abs(ch_pos - doc_pos)
    vec = float(doc.get("vector_score") or doc.get("score") or 0.0)
    return overlap * 3.0 + pos * 0.35 + min(max(vec, 0.0), 1.0) * 0.25


def allocate_material_pool(
    chapters: list[ChapterSpec],
    pool: list[dict[str, Any]],
    *,
    max_per_chapter: int = 8,
    min_per_chapter: int = 1,
) -> AllocationResult:
    """把候选池互斥分配到各章。每片最多 1 章；尽量保证每章至少 1 片。"""
    key_to_doc: dict[str, dict[str, Any]] = {}
    ordered_keys: list[str] = []
    for doc in pool:
        key = stable_material_key(doc)
        if key in key_to_doc:
            continue
        key_to_doc[key] = doc
        ordered_keys.append(key)

    if not chapters:
        return AllocationResult(
            by_chapter={}, unused=list(ordered_keys), key_to_doc=key_to_doc
        )

    n_ch = len(chapters)
    pool_size = len(ordered_keys)
    scored: list[tuple[float, int, str]] = []
    for ci, ch in enumerate(chapters):
        for pi, key in enumerate(ordered_keys):
            s = score_chapter_doc(
                ch,
                key_to_doc[key],
                chapter_index=ci,
                n_chapters=n_ch,
                pool_index=pi,
                pool_size=pool_size,
            )
            scored.append((s, ci, key))
    scored.sort(key=lambda x: (-x[0], x[1], x[2]))

    by_chapter: dict[str, list[str]] = {ch.chapter_id: [] for ch in chapters}
    assigned: set[str] = set()

    for s, ci, key in scored:
        if key in assigned:
            continue
        ch_id = chapters[ci].chapter_id
        if len(by_chapter[ch_id]) >= max_per_chapter:
            continue
        # 已有最低配额时跳过极弱匹配，留给别章
        if s < 0.08 and len(by_chapter[ch_id]) >= min_per_chapter:
            continue
        by_chapter[ch_id].append(key)
        assigned.add(key)

    for ci, ch in enumerate(chapters):
        while len(by_chapter[ch.chapter_id]) < min_per_chapter:
            best_key: Optional[str] = None
            best_s = -1.0
            for pi, key in enumerate(ordered_keys):
                if key in assigned:
                    continue
                s = score_chapter_doc(
                    ch,
                    key_to_doc[key],
                    chapter_index=ci,
                    n_chapters=n_ch,
                    pool_index=pi,
                    pool_size=pool_size,
                )
                if s > best_s:
                    best_s, best_key = s, key
            if best_key is None:
                break
            by_chapter[ch.chapter_id].append(best_key)
            assigned.add(best_key)

    unused = [k for k in ordered_keys if k not in assigned]
    return AllocationResult(
        by_chapter=by_chapter, unused=unused, key_to_doc=key_to_doc
    )
