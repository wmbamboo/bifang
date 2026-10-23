"""反馈打包 / 验证员代验证 / Cursor 派发权限。"""
from __future__ import annotations

import os
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


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CURSOR_API_KEY", "")
    get_settings.cache_clear()
    init_db()
    with get_conn() as conn:
        for userid, username, name, access in (
            ("u1", "admin", "管理员", "admin"),
            ("u2", "alice", "爱丽丝", "user"),
            ("u3", "recv", "接收员", "user"),
            ("u4", "veri", "验证员", "user"),
        ):
            conn.execute(
                """
                INSERT OR REPLACE INTO users
                (userid, username, password, name, access, email, user_status)
                VALUES (?,?,?,?,?,?,1)
                """,
                (userid, username, hash_password(username), name, access, ""),
            )
        replace_user_roles(conn, "admin", ["admin"])
        replace_user_roles(conn, "alice", ["user"])
        replace_user_roles(conn, "recv", ["user", "feedback_receiver"])
        replace_user_roles(conn, "veri", ["user", "feedback_verifier"])
    app = create_app()
    return TestClient(app)


def _login(client: TestClient, username: str) -> str:
    r = client.post(
        "/mock_api/login/account",
        json={"username": username, "password": username, "type": "account"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["data"]["token"]
    assert token
    return token


def test_feedback_roles_seeded(client: TestClient):
    with get_conn() as conn:
        codes = {
            r[0]
            for r in conn.execute(
                "SELECT role_code FROM roles WHERE role_code IN (?,?)",
                ("feedback_receiver", "feedback_verifier"),
            ).fetchall()
        }
        assert codes == {"feedback_receiver", "feedback_verifier"}
        for code in codes:
            n = conn.execute(
                """
                SELECT COUNT(*) FROM role_res
                WHERE role_code=? AND auth_res='feedbackMgt' AND res_type='menu'
                """,
                (code,),
            ).fetchone()[0]
            assert n == 1


def test_verifier_can_resolve_others_fixed(client: TestClient):
    alice = _login(client, "alice")
    fid = uuid.uuid4().hex
    r = client.post(
        "/api/feedback",
        headers={"token": alice},
        json={"id": fid, "feedback_type": "bug", "content": "代验证测"},
    )
    assert r.json().get("code") == 200
    admin = _login(client, "admin")
    r2 = client.put(
        f"/api/feedback/{fid}",
        headers={"token": admin},
        json={"status": "fixed"},
    )
    assert r2.json().get("code") == 200

    # 普通他人不可验
    # （recv 无验证员角色）
    recv = _login(client, "recv")
    r3 = client.put(
        f"/api/feedback/{fid}",
        headers={"token": recv},
        json={"status": "resolved"},
    )
    assert r3.json().get("code") == 403

    veri = _login(client, "veri")
    r4 = client.put(
        f"/api/feedback/{fid}",
        headers={"token": veri},
        json={"status": "resolved"},
    )
    assert r4.json().get("code") == 200
    assert r4.json()["data"]["status"] == "resolved"


def test_dispatch_forbidden_for_normal_user(client: TestClient):
    alice = _login(client, "alice")
    r = client.post(
        "/api/feedback/cursor-dispatch",
        headers={"token": alice},
        json={"ids": ["x"]},
    )
    assert r.status_code == 403


def test_dispatch_no_key_errors_job(client: TestClient, tmp_path):
    recv = _login(client, "recv")
    fid = uuid.uuid4().hex
    client.post(
        "/api/feedback",
        headers={"token": recv},
        json={"id": fid, "feedback_type": "bug", "content": "打包测"},
    )
    # 造一张假图
    imgs = get_settings().data_path / "feedback_imgs"
    imgs.mkdir(parents=True, exist_ok=True)
    (imgs / "shot.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    with get_conn() as conn:
        conn.execute(
            "UPDATE feedbacks SET images=? WHERE id=?",
            ('["shot.png"]', fid),
        )

    r = client.post(
        "/api/feedback/cursor-dispatch",
        headers={"token": recv},
        json={"ids": [fid]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("code") == 200
    job_id = body["data"]["job_id"]

    # 等线程跑完（无 Key → error）
    import time

    meta = None
    for _ in range(40):
        time.sleep(0.1)
        sr = client.get(
            f"/api/feedback/cursor-jobs/{job_id}",
            headers={"token": recv},
        )
        assert sr.status_code == 200
        meta = sr.json().get("data") or {}
        if meta.get("status") in {"done", "error"}:
            break
    assert meta and meta.get("status") == "error"
    assert "CURSOR_API_KEY" in (meta.get("error") or "")
    pack = get_settings().feedback_packs_dir / job_id / "pack.zip"
    assert pack.is_file()


def test_build_pack_unit(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    init_db()
    fid = uuid.uuid4().hex
    imgs = get_settings().data_path / "feedback_imgs"
    imgs.mkdir(parents=True, exist_ok=True)
    (imgs / "a.png").write_bytes(b"png")
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
                "单元打包",
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
                '["a.png"]',
                "",
                "alice",
                "爱丽丝",
                "",
                "t",
                "t",
            ),
        )
    from app.services.feedback_pack import build_pack, job_dir

    jid, root = build_pack([fid], created_by="tester")
    assert (root / "manifest.json").is_file()
    assert (root / "BRIEF.md").is_file()
    assert (root / "pack.zip").is_file()
    assert (root / "images" / fid / "a.png").is_file()
    assert job_dir(jid) == root
