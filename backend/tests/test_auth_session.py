"""43.2 token 鉴权与弱鉴权去除。"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings
    from app.db import init_db, get_conn
    from app.main import create_app
    from app.security.passwords import hash_password

    get_settings.cache_clear()
    init_db()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('a1','admin',?,'管理员','admin','admin@test.local',1)
            """,
            (hash_password("admin"),),
        )
    return TestClient(create_app())


def test_feedback_list_requires_token(client: TestClient):
    r = client.get("/api/feedback")
    assert r.status_code == 401


def test_username_header_alone_rejected(client: TestClient):
    r = client.get("/api/feedback", headers={"username": "admin", "loginUser": "admin"})
    assert r.status_code == 401


def test_valid_token_ok(client: TestClient):
    login = client.post(
        "/mock_api/login/account",
        json={"username": "admin", "password": "admin", "type": "account"},
    )
    token = login.json()["data"]["token"]
    r = client.get("/api/feedback", headers={"token": token})
    assert r.status_code == 200
    assert r.json().get("success") is True


def test_logout_revokes_token(client: TestClient):
    login = client.post(
        "/mock_api/login/account",
        json={"username": "admin", "password": "admin", "type": "account"},
    )
    token = login.json()["data"]["token"]
    client.post("/mock_api/login/outLogin", headers={"token": token})
    r = client.get("/api/feedback", headers={"token": token})
    assert r.status_code == 401
