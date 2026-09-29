"""任务 4：检索去重（只读入参 + 页内近重复）。无模块级账本。"""

from __future__ import annotations

from typing import Any, Optional, Sequence

import numpy as np


def doc_exclude_key(doc: dict[str, Any]) -> str:
    """与 kb_service._doc_key 同口径，避免循环 import。"""
    meta = doc.get("metadata") or {}
    head = (doc.get("page_content") or "")[:48]
    return f"{meta.get('kb_name')}|{meta.get('source')}|{meta.get('chunk')}|{head}"


def _page_ord(doc: dict[str, Any]) -> float:
    meta = doc.get("metadata") or {}
    for key in ("page", "chunk"):
        if meta.get(key) is None:
            continue
        try:
            return float(meta[key])
        except (TypeError, ValueError):
            continue
    return 1e9


def apply_exclude_keys(
    docs: list[dict[str, Any]],
    exclude_keys: Optional[Sequence[str]],
    *,
    report: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    """硬过滤：返回集合与 exclude_keys 无交集（验收 2）。None/空 → 原样。"""
    if exclude_keys is None:
        return docs
    banned = {str(k) for k in exclude_keys if str(k).strip()}
    if not banned:
        return docs
    kept: list[dict[str, Any]] = []
    dropped: list[str] = []
    for doc in docs:
        key = doc_exclude_key(doc)
        if key in banned:
            dropped.append(key)
            continue
        kept.append(doc)
    if report is not None:
        report["excluded"] = dropped
    return kept


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na <= 0 or nb <= 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def dedup_near_duplicate_docs(
    docs: list[dict[str, Any]],
    vectors: Sequence[Optional[np.ndarray]],
    *,
    threshold: float = 0.92,
    report: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    """页内近重复：相邻/两两 cosine > threshold 时保留页码更靠前的一条。"""
    if not docs:
        return []
    if len(vectors) != len(docs):
        raise ValueError("vectors 与 docs 长度必须一致")

    order = sorted(range(len(docs)), key=lambda i: (_page_ord(docs[i]), i))
    kept_idx: list[int] = []
    dropped: list[dict[str, Any]] = []

    for i in order:
        vi = vectors[i]
        if vi is None:
            kept_idx.append(i)
            continue
        drop = False
        for j in kept_idx:
            vj = vectors[j]
            if vj is None:
                continue
            if cosine(np.asarray(vi, dtype=np.float32), np.asarray(vj, dtype=np.float32)) > threshold:
                drop = True
                dropped.append(
                    {
                        "dropped": doc_exclude_key(docs[i]),
                        "kept": doc_exclude_key(docs[j]),
                        "cosine": round(
                            cosine(
                                np.asarray(vi, dtype=np.float32),
                                np.asarray(vj, dtype=np.float32),
                            ),
                            4,
                        ),
                    }
                )
                break
        if not drop:
            kept_idx.append(i)

    # 稳定：按原相对顺序输出
    kept_set = set(kept_idx)
    out = [docs[i] for i in range(len(docs)) if i in kept_set]
    if report is not None:
        report["near_dup_dropped"] = dropped
    return out


def pairwise_max_cosine(
    docs: list[dict[str, Any]], vectors: Sequence[np.ndarray]
) -> float:
    """测试辅助：返回两两最大 cosine。"""
    best = 0.0
    n = len(docs)
    for i in range(n):
        for j in range(i + 1, n):
            best = max(best, cosine(vectors[i], vectors[j]))
    return best
