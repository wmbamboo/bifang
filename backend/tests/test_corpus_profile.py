"""语料画像 API / 挖掘。"""
from __future__ import annotations

from app.services.corpus_profile_service import (
    load_kb_corpus_profile,
    mine_profile_from_extracts,
)


def test_load_builtin_apparel_for_clothing_kb():
    p = load_kb_corpus_profile("服装")
    assert p.get("id") == "apparel"
    assert any(g.get("id") == "shirt" for g in p.get("entityGroups") or [])


def test_mine_profile_returns_draft_shape():
    draft = mine_profile_from_extracts("服装")
    assert draft.get("id", "").startswith("mined:")
    assert "entityGroups" in draft
    assert "minedStats" in draft
