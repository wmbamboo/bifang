"""KB 资产列表 / 路径解析。"""
from __future__ import annotations

from pathlib import Path

from app.services.kb_service import list_doc_assets, resolve_asset_path


def test_list_polo_element_assets():
    res = list_doc_assets(
        "服装",
        "抖音单品爆款分析-商务男士衬衫polo衫.pdf",
        kinds=["image", "chart"],
    )
    assert res.get("success") is True
    rows = res.get("data") or []
    assert len(rows) >= 4
    kinds = {r["kind"] for r in rows}
    assert "image" in kinds or "chart" in kinds
    sample = rows[0]
    path = resolve_asset_path(
        sample["kb_name"], sample["file_name"], sample["asset_id"]
    )
    assert path is not None and path.is_file()


def test_resolve_asset_rejects_traversal(tmp_path: Path):
    assert resolve_asset_path("服装", "x.pdf", "../etc/passwd") is None
    assert resolve_asset_path("服装", "x.pdf", "elements/../../x") is None
    # stem=".." 会把 base 退到库目录，须硬拒
    assert resolve_asset_path("服装", "..", "any.png") is None
    assert resolve_asset_path("服装", "../x.pdf", "any.png") is None
