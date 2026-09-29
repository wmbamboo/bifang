"""任务 5 · 引用格式统一（十·5：禁盲映射）。"""

from app.services.citation_normalize import (
    count_bare_citations,
    normalize_citations,
)


def test_only_bare_maps_to_doc():
    text = "棉占比 72.18%[1]，纯色 70.07%[2][3]。"
    out, report = normalize_citations(text, doc_count=5)
    assert out == "棉占比 72.18%[文档1]，纯色 70.07%[文档2][文档3]。"
    assert report["mapped"] == 3
    assert report["removed"] == 0
    assert count_bare_citations(out) == 0


def test_bare_out_of_range_removed():
    text = "引用[1]与越界[9]。"
    out, report = normalize_citations(text, doc_count=3)
    assert out == "引用[文档1]与越界。"
    assert report["mapped"] == 1
    assert report["removed"] == 1
    assert "[9]" not in out
    assert count_bare_citations(out) == 0


def test_mixed_strips_bare_keeps_doc():
    """混用：不能判定裸编号语义 → 删除裸引用，保留 [文档N]。"""
    text = "A 面料棉 72%[文档1]，另述纯色 70%[2]；又见[文档6]与[1]。"
    out, report = normalize_citations(text, doc_count=8)
    assert "[文档1]" in out
    assert "[文档6]" in out
    assert "[2]" not in out
    assert "[1]" not in out or "[文档1]" in out  # 裸 [1] 已删
    assert count_bare_citations(out) == 0
    assert report["removed"] >= 2
    assert report["mapped"] == 0


def test_doc_only_unchanged():
    text = "结论见[文档1][文档2]。"
    out, report = normalize_citations(text, doc_count=2)
    assert out == text
    assert report["mapped"] == 0
    assert report["removed"] == 0
    assert report["had_doc_cites"] is True
    assert report["had_bare_cites"] is False


def test_no_blind_map_when_mixed_same_number():
    """即便裸 [2] 与 [文档2] 同号并存，也不做「假设同源」的盲映射。"""
    text = "证据[文档2]与模型自编[2]并存。"
    out, report = normalize_citations(text)
    assert "[文档2]" in out
    assert count_bare_citations(out) == 0
    assert report["mapped"] == 0
    assert report["removed"] == 1
