"""管理员 user/update：缺 username 时按 userid 定位，避免静默未更新。"""
from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.security.passwords import hash_password, verify_password  # noqa: E402


def _seed_admin_and_target(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings
    from app.db import get_conn, init_db
    from app.main import create_app

    get_settings.cache_clear()
    init_db()
    with get_conn() as conn:
        conn.execute("DELETE FROM users WHERE username IN ('admin', 'target')")
        conn.execute(
            """
            INSERT INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('adm1', 'admin', ?, 'Admin', 'admin', '', 1)
            """,
            (hash_password("admin-pass"),),
        )
        conn.execute(
            """
            INSERT INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('u-target', 'target', ?, 'Target', 'user', '', 1)
            """,
            (hash_password("old-secret"),),
        )
    app = create_app()
    client = TestClient(app)
    login = client.post(
        "/mock_api/login/account",
        json={"username": "admin", "password": "admin-pass", "type": "account"},
    )
    token = login.json()["data"]["token"]
    return client, token


def test_user_update_password_by_userid_only(tmp_path, monkeypatch):
    client, token = _seed_admin_and_target(tmp_path, monkeypatch)
    headers = {"token": token}
    r = client.post(
        "/mock_api/user/update",
        headers=headers,
        json={
            "userid": "u-target",
            "name": "Target",
            "password": "new-secret-9",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is not False, body

    from app.db import get_conn

    with get_conn() as conn:
        row = conn.execute(
            "SELECT password FROM users WHERE username='target'"
        ).fetchone()
    assert verify_password("new-secret-9", row["password"])

    login = client.post(
        "/mock_api/login/account",
        json={"username": "target", "password": "new-secret-9", "type": "account"},
    )
    assert login.json()["data"]["status"] == "ok"


def test_user_update_missing_identity_400(tmp_path, monkeypatch):
    client, token = _seed_admin_and_target(tmp_path, monkeypatch)
    r = client.post(
        "/mock_api/user/update",
        headers={"token": token},
        json={"name": "Nobody", "password": "new-secret-9"},
    )
    body = r.json()
    assert body.get("success") is False
    assert body.get("code") == 400
