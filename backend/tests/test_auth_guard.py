"""四十九：全站鉴权守卫验收（无 token 401 / 登录白名单 / 角色闸）。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AUTH_GUARD_MODE", "enforce")
    from app.config import get_settings
    from app.db import init_db, get_conn
    from app.main import create_app
    from app.security.passwords import hash_password
    from app.security.rbac import replace_user_roles

    get_settings.cache_clear()
    init_db()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('a1','admin',?,'管理员','admin','admin@test.local',1)
            """,
            (hash_password("admin-pass"),),
        )
        replace_user_roles(conn, "admin", ["admin"])
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('l1','lizy',?,'Lizy','user','lizy@test.local',1)
            """,
            (hash_password("lizy-pass"),),
        )
        replace_user_roles(conn, "lizy", ["user", "kb_manager"])
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('u1','plain',?,'Plain','user','plain@test.local',1)
            """,
            (hash_password("plain-pass"),),
        )
        replace_user_roles(conn, "plain", ["user"])
    get_settings.cache_clear()
    return TestClient(create_app())


def _login(client: TestClient, username: str, password: str) -> str:
    r = client.post(
        "/mock_api/login/account",
        json={"username": username, "password": password, "type": "account"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("code") == 200
    token = (data.get("data") or {}).get("token") or ""
    assert token, f"login no token: {data}"
    return token


def test_users_no_token_401(client: TestClient):
    r = client.get("/mock_api/users")
    assert r.status_code == 401


def test_delete_docs_no_token_401(client: TestClient):
    r = client.post("/knowledge_base/delete_docs", json={})
    assert r.status_code == 401


def test_lizy_users_403(client: TestClient):
    token = _login(client, "lizy", "lizy-pass")
    r = client.get("/mock_api/users", headers={"token": token})
    assert r.status_code == 403


def test_login_whitelist_200(client: TestClient):
    r = client.post(
        "/mock_api/login/account",
        json={"username": "nope", "password": "x", "type": "account"},
    )
    # 登录接口本身必须可达（白名单）；失败也是业务码而非 401 守卫
    assert r.status_code == 200
    assert r.json().get("code") != 401 or "请先登录" not in str(r.json())


def test_health_200(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_forged_xff_ignored_on_direct(client: TestClient):
    """直连即使 peer 在可信列表，裸 XFF 也不采信（须 X-Real-IP）。"""
    from app.db import get_conn

    r = client.post(
        "/mock_api/login/account",
        json={"username": "__probe_ip__", "password": "x", "type": "account"},
        headers={"X-Forwarded-For": "203.0.113.7"},
    )
    assert r.status_code == 200
    with get_conn() as conn:
        row = conn.execute(
            "SELECT client_ip FROM login_logs WHERE username='__probe_ip__' ORDER BY id DESC LIMIT 1"
        ).fetchone()
    assert row is not None
    assert row["client_ip"] != "203.0.113.7"
    assert row["client_ip"] in {"testclient", "127.0.0.1", "::1"}


def test_x_real_ip_honored_from_trusted_peer(client: TestClient):
    """可信 peer + X-Real-IP ⇒ 记真实值（模拟 proxy 覆盖写）。"""
    from app.config import get_settings
    from app.db import get_conn

    # TestClient peer 常为 testclient；临时纳入可信集
    get_settings.cache_clear()
    import os

    os.environ["TRUSTED_PROXIES"] = "127.0.0.1,::1,testclient"
    get_settings.cache_clear()
    r = client.post(
        "/mock_api/login/account",
        json={"username": "__probe_realip__", "password": "x", "type": "account"},
        headers={"X-Real-IP": "192.168.1.77", "X-Forwarded-For": "203.0.113.7"},
    )
    assert r.status_code == 200
    with get_conn() as conn:
        row = conn.execute(
            "SELECT client_ip FROM login_logs WHERE username='__probe_realip__' ORDER BY id DESC LIMIT 1"
        ).fetchone()
    assert row is not None
    assert row["client_ip"] == "192.168.1.77"
