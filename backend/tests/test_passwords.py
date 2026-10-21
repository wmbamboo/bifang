"""密码 bcrypt：哈希、校验、明文兼容与升级。"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.security.passwords import (  # noqa: E402
    hash_password,
    is_hashed,
    needs_rehash,
    verify_password,
)


def test_hash_and_verify_roundtrip():
    h = hash_password("secret-xyz")
    assert is_hashed(h)
    assert h.startswith("$2b$")
    assert verify_password("secret-xyz", h)
    assert not verify_password("wrong", h)
    assert not needs_rehash(h)


def test_plaintext_compat_and_needs_rehash():
    assert verify_password("plain", "plain")
    assert not verify_password("plain", "other")
    assert needs_rehash("plain")
    assert not is_hashed("plain")


def test_login_upgrades_plaintext(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings
    from app.db import init_db, get_conn
    from app.main import create_app

    get_settings.cache_clear()
    init_db()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('t1','pwuser','legacy-plain','测','user','',1)
            """
        )
    app = create_app()
    client = TestClient(app)
    r = client.post(
        "/mock_api/login/account",
        json={"username": "pwuser", "password": "legacy-plain", "type": "account"},
    )
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "ok"
    assert r.json()["data"]["token"]
    with get_conn() as conn:
        stored = conn.execute(
            "SELECT password FROM users WHERE username='pwuser'"
        ).fetchone()["password"]
    assert is_hashed(stored)
    assert verify_password("legacy-plain", stored)
