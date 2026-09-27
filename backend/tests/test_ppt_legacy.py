"""旧版 .ppt（OLE）正文抽取：python-pptx 会报 Package not found。"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.document_loader import _extract_ppt_ole_text, load_file_text

KB_VC = Path("data/knowledge_base/金融/content/案例：风险投资与私募基金.ppt")
KB_ACCT = Path("data/knowledge_base/金融/content/案例：会计造假和盈余管理.ppt")


@pytest.mark.skipif(not KB_VC.is_file(), reason="本地金融 KB 夹具不存在")
def test_extract_ppt_ole_text_venture_capital():
    out = _extract_ppt_ole_text(KB_VC)
    assert "风险投资" in out
    assert "单击此处编辑母版" not in out
    assert len(out) > 500


@pytest.mark.skipif(not KB_ACCT.is_file(), reason="本地金融 KB 夹具不存在")
def test_load_file_text_legacy_ppt_no_package_error():
    text = load_file_text(KB_ACCT)
    assert "会计造假" in text
