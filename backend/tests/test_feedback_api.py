"""反馈闭环：权限与通知降级。"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# 使用临时库，避免污染开发库
_tmp = ROOT / "data" / f"test_fb_{uuid.uuid4().hex[:8]}.db"
os.environ["DATA_DIR"] = str(_tmp.parent)
# 强制 db 指向临时文件：config 用 DATA_DIR/bifang.db 时改名困难，直接 patch 后 init

from app.config import get_settings  # noqa: E402
from app.db import init_db, get_conn, _now  # noqa: E402
from app.main import create_app  # noqa: E402
from app.routers import mock_api  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_file = tmp_path / "fb.db"
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    # 清缓存 settings
    get_settings.cache_clear()
    s = get_settings()
    assert s.db_path.parent == tmp_path or str(tmp_path) in str(s.db_path)
    init_db()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('u1','admin','admin','管理员','admin','admin@test.local',1)
            """
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('u2','alice','alice','爱丽丝','user','',1)
            """
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('u3','bob','bob','鲍勃','user','bob@test.local',1)
            """
        )
    app = create_app()
    return TestClient(app)


def _login(client: TestClient, username: str, password: str) -> str:
    r = client.post(
        "/mock_api/login/account",
        json={"username": username, "password": password, "type": "account"},
    )
    assert r.status_code == 200
    token = r.json()["data"]["token"]
    assert token
    return token


def test_user_cannot_change_status(client: TestClient):
    admin_tok = _login(client, "admin", "admin")
    # admin 提交一条
    fid = uuid.uuid4().hex
    r = client.post(
        "/api/feedback",
        headers={"token": admin_tok},
        json={"id": fid, "feedback_type": "bug", "content": "x"},
    )
    assert r.status_code == 200
    user_tok = _login(client, "alice", "alice")
    r2 = client.put(
        f"/api/feedback/{fid}",
        headers={"token": user_tok},
        json={"status": "resolving"},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body.get("code") == 403 or body.get("success") is False


def test_admin_can_change_status(client: TestClient):
    tok = _login(client, "admin", "admin")
    fid = uuid.uuid4().hex
    client.post(
        "/api/feedback",
        headers={"token": tok},
        json={"id": fid, "feedback_type": "bug", "content": "y"},
    )
    r = client.put(
        f"/api/feedback/{fid}",
        headers={"token": tok},
        json={"status": "resolving"},
    )
    assert r.status_code == 200
    assert r.json()["code"] == 200
    assert r.json()["data"]["status"] == "resolving"


def test_no_email_skipped_notify(client: TestClient, monkeypatch):
    from app.config import get_settings
    from app.services import feedback_mail

    monkeypatch.setattr(feedback_mail, "smtp_configured", lambda: True)
    get_settings.cache_clear()
    tok = _login(client, "alice", "alice")  # alice email empty
    fid = uuid.uuid4().hex
    client.post(
        "/api/feedback",
        headers={"token": tok},
        json={"id": fid, "feedback_type": "bug", "content": "no-mail"},
    )
    admin = _login(client, "admin", "admin")
    r = client.put(
        f"/api/feedback/{fid}",
        headers={"token": admin},
        json={"status": "fixed"},
    )
    assert r.status_code == 200
    assert r.json()["code"] == 200
    assert r.json()["data"]["notify_status"] == "no_email"


def test_unread_count_submitter_vs_assignee(client: TestClient):
    admin_tok = _login(client, "admin", "admin")
    alice_tok = _login(client, "alice", "alice")
    fid_sub = uuid.uuid4().hex
    fid_asg = uuid.uuid4().hex
    client.post(
        "/api/feedback",
        headers={"token": alice_tok},
        json={"id": fid_sub, "feedback_type": "bug", "content": "mine-fixed"},
    )
    client.post(
        "/api/feedback",
        headers={"token": alice_tok},
        json={"id": fid_asg, "feedback_type": "bug", "content": "assigned"},
    )
    client.put(
        f"/api/feedback/{fid_sub}",
        headers={"token": admin_tok},
        json={"status": "fixed"},
    )
    client.put(
        f"/api/feedback/{fid_asg}",
        headers={"token": admin_tok},
        json={"status": "resolving", "assignee": "admin"},
    )
    r_all = client.get(
        "/api/feedback/unread-count",
        headers={"token": admin_tok},
    )
    assert r_all.json()["code"] == 200
    assert r_all.json()["data"]["count"] == 1
    r_sub = client.get(
        "/api/feedback/unread-count?scope=submitter",
        headers={"token": admin_tok},
    )
    assert r_sub.json()["data"]["count"] == 0
    r_alice = client.get(
        "/api/feedback/unread-count?scope=submitter",
        headers={"token": alice_tok},
    )
    assert r_alice.json()["data"]["count"] == 1


def test_smtp_fail_still_200(client: TestClient, monkeypatch):
    from app.services import feedback_mail

    def _boom(*_a, **_k):
        raise ConnectionError("refused")

    monkeypatch.setattr(feedback_mail, "smtp_configured", lambda: True)
    monkeypatch.setattr(feedback_mail, "_send_sync", _boom)
    tok = _login(client, "bob", "bob")
    fid = uuid.uuid4().hex
    client.post(
        "/api/feedback",
        headers={"token": tok},
        json={"id": fid, "feedback_type": "bug", "content": "smtp-fail"},
    )
    admin = _login(client, "admin", "admin")
    r = client.put(
        f"/api/feedback/{fid}",
        headers={"token": admin},
        json={"status": "fixed"},
    )
    assert r.status_code == 200
    assert r.json()["code"] == 200
    # pending 或 failed（异步可能已跑完）
    assert r.json()["data"]["notify_status"] in {"pending", "failed", "skipped", "sent", "no_email"}
    import time

    time.sleep(0.3)
    r2 = client.get(f"/api/feedback/{fid}", headers={"token": admin})
    assert r2.json()["data"]["notify_status"] in {"pending", "failed"}
