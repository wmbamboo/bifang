"""反馈开发管理：程序猿角色与 job 列表。"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import get_settings  # noqa: E402
from app.db import init_db, get_conn  # noqa: E402
from app.main import create_app  # noqa: E402
from app.security.passwords import hash_password  # noqa: E402
from app.security.rbac import replace_user_roles  # noqa: E402
from app.services import feedback_pack as pack  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    init_db()
    with get_conn() as conn:
        for userid, username, roles in (
            ("u1", "admin", ["admin"]),
            ("u2", "alice", ["user"]),
            ("u3", "dev", ["user", "coder"]),
        ):
            conn.execute(
                """
                INSERT OR REPLACE INTO users
                (userid, username, password, name, access, email, user_status)
                VALUES (?,?,?,?,?,?,1)
                """,
                (
                    userid,
                    username,
                    hash_password(username),
                    username,
                    "admin" if "admin" in roles else "user",
                    "",
                ),
            )
            replace_user_roles(conn, username, roles)
    return TestClient(create_app())


def _login(client: TestClient, username: str) -> str:
    r = client.post(
        "/mock_api/login/account",
        json={"username": username, "password": username, "type": "account"},
    )
    assert r.status_code == 200
    return r.json()["data"]["token"]


def test_coder_role_and_menu_seeded(client: TestClient):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT role_name FROM roles WHERE role_code='coder'"
        ).fetchone()
        assert row and row[0] == "程序猿"
        n = conn.execute(
            """
            SELECT COUNT(*) FROM role_res
            WHERE role_code='coder' AND auth_res='feedbackDevMgt'
            """
        ).fetchone()[0]
        assert n == 1
        # admin 不隐式拥有反馈开发管理菜单
        n_admin = conn.execute(
            """
            SELECT COUNT(*) FROM role_res
            WHERE role_code='admin' AND auth_res='feedbackDevMgt'
            """
        ).fetchone()[0]
        assert n_admin == 0
        menu = conn.execute(
            "SELECT path FROM menus WHERE access='feedbackDevMgt'"
        ).fetchone()
        assert menu and menu[0] == "/admin/feedback-dev"


def test_dev_jobs_forbidden_without_coder(client: TestClient):
    tok = _login(client, "alice")
    r = client.get("/api/feedback/dev/jobs", headers={"token": tok})
    assert r.status_code == 403
    # admin 也无（需显式勾选程序猿）
    admin = _login(client, "admin")
    r2 = client.get("/api/feedback/dev/jobs", headers={"token": admin})
    assert r2.status_code == 403


def test_coder_lists_jobs(client: TestClient, tmp_path):
    fid = uuid.uuid4().hex
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO feedbacks (
                id, feedback_type, content, page, status,
                assignee, assignee_name, resolved_by, resolved_at,
                visibility, env, notify_status, notify_at,
                gen_id, gen_type, outline_id, target_key, context_json, images,
                contact, user, user_name, reply, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                fid,
                "bug",
                "开发管理测",
                "/x",
                "pending",
                "",
                "",
                "",
                "",
                "internal",
                "dev",
                "",
                "",
                "",
                "",
                "",
                "",
                "{}",
                "[]",
                "",
                "alice",
                "爱丽丝",
                "",
                "t",
                "t",
            ),
        )
    jid, root = pack.build_pack([fid], created_by="hezl")
    (root / "RESULT.md").write_text("# ok\nfixed\n", encoding="utf-8")

    tok = _login(client, "dev")
    r = client.get("/api/feedback/dev/jobs", headers={"token": tok})
    assert r.status_code == 200
    body = r.json()
    assert body.get("code") == 200
    jobs = body["data"]
    assert any(j["job_id"] == jid for j in jobs)
    hit = next(j for j in jobs if j["job_id"] == jid)
    assert hit["status"] == "done"
    assert hit["has_result"] is True
    assert any(f["id"] == fid for f in hit["feedbacks"])

    d = client.get(f"/api/feedback/dev/jobs/{jid}", headers={"token": tok})
    assert d.json()["code"] == 200
    assert "fixed" in (d.json()["data"].get("result_md") or "")
