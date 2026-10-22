"""五十一：检索模式语义——混合须能召回仅 bm25 命中的专名；关键字门槛用绝对覆盖率。"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _unit_at_cos(c: float) -> np.ndarray:
    c = float(c)
    s = float(np.sqrt(max(0.0, 1.0 - c * c)))
    return np.array([c, s], dtype=np.float32)


@pytest.fixture()
def name_store(monkeypatch):
    """3 条 docs：仅第 0 条含「曹俊生」；向量余弦均 < 0.5。"""
    from app.services import kb_service as ks

    docs = [
        {
            "page_content": "曹俊生同志在格力混改中提出若干意见。",
            "metadata": {"source": "a.md"},
        },
        {
            "page_content": "格力电器混改方案与公司治理结构讨论。",
            "metadata": {"source": "b.md"},
        },
        {
            "page_content": "家电行业竞争格局与渠道变革分析。",
            "metadata": {"source": "c.md"},
        },
    ]
    emb = np.stack(
        [
            _unit_at_cos(0.35),
            _unit_at_cos(0.42),
            _unit_at_cos(0.42),
        ]
    )
    monkeypatch.setattr(
        ks,
        "embed_query",
        lambda _q: np.array([1.0, 0.0], dtype=np.float32),
    )
    return ks.HybridStore(docs=docs, embeddings=emb)


def _has_cao(results: list[dict]) -> bool:
    return any("曹俊生" in (r.get("page_content") or "") for r in results)


def test_vector_misses_low_cosine_name(name_store):
    hits = name_store.search("曹俊生", top_k=5, score_threshold=0.5, mode="vector")
    assert hits == []


def test_bm25_finds_name(name_store):
    hits = name_store.search("曹俊生", top_k=5, score_threshold=0.5, mode="bm25")
    assert _has_cao(hits)


def test_hybrid_also_finds_name(name_store):
    """回归闸：修前 hybrid ⊆ vector ⇒ 本条必失败。"""
    hits = name_store.search("曹俊生", top_k=5, score_threshold=0.5, mode="hybrid")
    assert _has_cao(hits)


def test_bm25_unknown_term_empty(name_store):
    """回归闸：修前归一化第一名恒过门槛 ⇒ 本条必失败。"""
    hits = name_store.search("曹俊生zzz", top_k=5, score_threshold=0.5, mode="bm25")
    assert hits == []


def test_hybrid_unknown_term_empty(name_store):
    hits = name_store.search("曹俊生zzz", top_k=5, score_threshold=0.5, mode="hybrid")
    assert hits == []
