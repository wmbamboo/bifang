"""KB 资产列表 / 路径解析。"""
from __future__ import annotations

from pathlib import Path

from app.services.kb_service import (
    _collect_element_asset_ids,
    list_doc_assets,
    normalize_asset_id,
    resolve_asset_path,
)

POLO = "抖音单品爆款分析-商务男士衬衫polo衫"


def test_list_polo_element_assets():
    res = list_doc_assets(
        "服装",
        f"{POLO}.pdf",
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
    # 出口补宽高，供前端 cover 裁剪省一次 round-trip
    with_wh = [r for r in rows if r.get("w") and r.get("h")]
    assert with_wh, "list_doc_assets 应带 w/h"


def test_element_asset_ids_natural_order():
    """p3 有 img10 时不得排在 img2 前（字符串排序回归）。"""
    from app.config import get_settings

    assets = get_settings().kb_root / "服装" / "assets" / POLO
    by_page = _collect_element_asset_ids(assets, POLO)
    p3 = by_page.get(3) or []
    assert len(p3) >= 10
    idxs = []
    for aid in p3:
        # elements/<stem>_p3_imgK.png
        name = Path(aid).name
        idxs.append(int(name.rsplit("img", 1)[-1].split(".")[0]))
    assert idxs == sorted(idxs)
    assert idxs.index(10) > idxs.index(2)


def test_resolve_bare_asset_id_to_root_or_elements():
    """裸文件名（历史回填）与 elements/ 前缀均可解析。"""
    bare = f"{POLO}_p2_0.png"
    p = resolve_asset_path("服装", f"{POLO}.pdf", bare)
    assert p is not None and p.is_file()
    # 归一化候选含 elements/
    cands = normalize_asset_id(bare)
    assert f"elements/{bare}" in cands


def test_resolve_asset_rejects_traversal(tmp_path: Path):
    assert resolve_asset_path("服装", "x.pdf", "../etc/passwd") is None
    assert resolve_asset_path("服装", "x.pdf", "elements/../../x") is None
    # stem=".." 会把 base 退到库目录，须硬拒
    assert resolve_asset_path("服装", "..", "any.png") is None
    assert resolve_asset_path("服装", "../x.pdf", "any.png") is None
