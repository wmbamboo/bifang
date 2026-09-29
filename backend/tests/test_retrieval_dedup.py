"""任务 4 验收：页内近重复去重 + exclude_keys。"""

from __future__ import annotations

import numpy as np

from app.services.retrieval_dedup import (
    apply_exclude_keys,
    dedup_near_duplicate_docs,
    doc_exclude_key,
    pairwise_max_cosine,
)


def _doc(source: str, chunk: int, text: str, page: int) -> dict:
    return {
        "page_content": text,
        "metadata": {
            "kb_name": "服装",
            "source": source,
            "chunk": chunk,
            "page": page,
        },
        "score": 0.8,
        "vector_score": 0.8,
    }


def test_near_dup_price_band_chunks_cosine_at_most_threshold():
    """4 个高相似价格带 chunk → 去重后两两 cosine ≤ 0.92。"""
    base = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    # 彼此几乎同向（cosine ≈ 0.995）
    vecs = [
        base,
        base + np.array([0.0, 0.05, 0.0, 0.0], dtype=np.float32),
        base + np.array([0.0, 0.0, 0.05, 0.0], dtype=np.float32),
        base + np.array([0.0, 0.04, 0.03, 0.0], dtype=np.float32),
    ]
    docs = [
        _doc("价格带.pdf", i, f"价格带 ¥50-100 销量{i}", page=i + 1)
        for i in range(4)
    ]
    # 确认构造确实高相似
    assert pairwise_max_cosine(docs, vecs) > 0.92

    kept = dedup_near_duplicate_docs(docs, vecs, threshold=0.92)
    kept_vecs = [vecs[docs.index(d)] for d in kept]
    assert len(kept) >= 1
    assert pairwise_max_cosine(kept, kept_vecs) <= 0.92 + 1e-6
    # 保留页码更靠前
    assert kept[0]["metadata"]["page"] == 1


def test_exclude_keys_no_intersection():
    docs = [
        _doc("a.pdf", 0, "片段A", 1),
        _doc("b.pdf", 1, "片段B", 2),
        _doc("c.pdf", 2, "片段C", 3),
    ]
    ban = {doc_exclude_key(docs[0]), doc_exclude_key(docs[2])}
    out = apply_exclude_keys(docs, ban)
    keys = {doc_exclude_key(d) for d in out}
    assert keys.isdisjoint(ban)
    assert doc_exclude_key(docs[1]) in keys


def test_no_exclude_keys_byte_identical():
    """不传 exclude_keys → 与现状一致（不做排除）。"""
    docs = [
        _doc("a.pdf", 0, "片段A", 1),
        _doc("b.pdf", 1, "片段B", 2),
    ]
    assert apply_exclude_keys(docs, None) is docs or apply_exclude_keys(docs, None) == docs
    assert apply_exclude_keys(docs, None) == docs
    assert apply_exclude_keys(list(docs), []) == docs

    # retrieve 路径：无向量时 finalize 仅 exclude，None 不改结果
    from app.services import kb_service

    sample = list(docs)
    # 直接测 finalize 等价：exclude None + 无向量库 → 原样
    vecs = kb_service._lookup_doc_vectors("不存在的库_xyz", sample)
    assert all(v is None for v in vecs)
    out = apply_exclude_keys(sample, None)
    assert [doc_exclude_key(d) for d in out] == [doc_exclude_key(d) for d in sample]
