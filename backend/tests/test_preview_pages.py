"""五十四：预览页枚举 + 路径穿越拒绝。"""
from __future__ import annotations

import json
from pathlib import Path

from app.config import get_settings
from app.services.kb_service import list_preview_pages, resolve_asset_path


def test_preview_pages_rejects_traversal():
    bad = list_preview_pages("服装", "../etc/passwd")
    assert bad.get("success") is False
    bad2 = list_preview_pages("../服装", "x.pdf")
    assert bad2.get("success") is False
    bad3 = list_preview_pages("服装", "foo/../../x.pdf")
    assert bad3.get("success") is False


def test_preview_pages_polo_has_images_or_text():
    """样本库「服装」polo 文档：应有页图或 extracts 文本。"""
    polo = "抖音单品爆款分析-商务男士衬衫polo衫"
    res = list_preview_pages("服装", f"{polo}.pdf")
    if res.get("success") is not True:
        # 无样本库时跳过（CI 可能无 data）
        root = get_settings().kb_root / "服装"
        if not root.is_dir():
            return
        assert False, res
    pages = res["data"]["pages"]
    assert pages, "应至少有一页（图或文本）"
    assert pages == sorted(pages, key=lambda p: p["page"])
    with_img = [p for p in pages if p.get("asset_id")]
    if with_img:
        sample = with_img[0]
        path = resolve_asset_path(
            "服装", f"{polo}.pdf", sample["asset_id"]
        )
        assert path is not None and path.is_file()


def test_preview_pages_merges_extract_only_pages(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    from app.config import get_settings as gs

    s = gs()
    kb = "ut_kb"
    stem = "demo"
    (s.kb_root / kb / "extracts").mkdir(parents=True)
    (s.kb_root / kb / "assets" / stem / "whole").mkdir(parents=True)
    # 仅第 2 页有 whole 图
    img = s.kb_root / kb / "assets" / stem / "whole" / "page_2.png"
    img.write_bytes(b"\x89PNG\r\n\x1a\n")
    # extracts 有 1、2、3 页
    jl = s.kb_root / kb / "extracts" / f"{stem}.jsonl"
    lines = [
        {"source": f"{stem}.pdf", "page": 1, "snippet": "page one text", "page_type": "general"},
        {"source": f"{stem}.pdf", "page": 2, "snippet": "page two", "page_type": "general"},
        {"source": f"{stem}.pdf", "page": 3, "snippet": "page three only text", "page_type": "general"},
    ]
    jl.write_text(
        "\n".join(json.dumps(x, ensure_ascii=False) for x in lines) + "\n",
        encoding="utf-8",
    )
    res = list_preview_pages(kb, f"{stem}.pdf")
    assert res["success"] is True
    pages = {p["page"]: p for p in res["data"]["pages"]}
    assert set(pages) == {1, 2, 3}
    assert pages[2]["asset_id"] == "whole/page_2.png"
    assert pages[2]["has_image"] is True
    assert pages[1]["has_image"] is False
    assert "page one" in pages[1]["snippet"]
    assert pages[3]["has_image"] is False
