"""检索范围：bound_only 硬过滤 / kb_supplement 绑定优先。"""

from __future__ import annotations

from app.services.kb_service import _apply_source_scope


def _doc(source: str, score: float = 1.0) -> dict:
    return {
        "page_content": f"text from {source}",
        "metadata": {"source": source},
        "score": score,
    }


def test_bound_only_filters_to_source_files():
    docs = [_doc("a.pdf"), _doc("b.pdf"), _doc("c.pdf")]
    out = _apply_source_scope(docs, ["a.pdf", "c.pdf"], "bound_only")
    assert [d["metadata"]["source"] for d in out] == ["a.pdf", "c.pdf"]


def test_kb_supplement_prefers_bound_then_others():
    docs = [_doc("other.pdf"), _doc("main.pdf"), _doc("x.pdf")]
    out = _apply_source_scope(docs, ["main.pdf"], "kb_supplement")
    assert out[0]["metadata"]["source"] == "main.pdf"
    assert {d["metadata"]["source"] for d in out} == {
        "main.pdf",
        "other.pdf",
        "x.pdf",
    }


def test_no_bound_files_passthrough():
    docs = [_doc("a.pdf")]
    assert _apply_source_scope(docs, [], "bound_only") == docs
