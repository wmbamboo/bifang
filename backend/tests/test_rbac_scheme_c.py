"""RBAC 方案 C：回滚 user 知识库授权、kb_manager、user_roles 并集。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def db_ready(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.config import get_settings
    from app.db import init_db

    get_settings.cache_clear()
    init_db()
    return tmp_path


def test_rbac_scheme_c_rollback_and_union(db_ready):
    from app.db import get_conn
    from app.security.rbac import is_admin, load_user_roles, menu_auth_union
    from app.security.passwords import hash_password

    with get_conn() as conn:
        # A 副作用已回滚：user 不再有 kb 菜单
        bad = conn.execute(
            """
            SELECT COUNT(*) FROM role_res
            WHERE role_code='user' AND res_type='menu'
              AND auth_res IN ('kbMgt','kbFileMgt')
            """
        ).fetchone()[0]
        assert bad == 0

        kb = conn.execute(
            """
            SELECT auth_res FROM role_res
            WHERE role_code='kb_manager' AND res_type='menu'
            ORDER BY auth_res
            """
        ).fetchall()
        assert {r[0] for r in kb} >= {"kbMgt", "kbFileMgt"}

        admin_roles = load_user_roles(conn, "admin")
        assert "admin" in admin_roles
        user_roles = load_user_roles(conn, "user")
        assert "user" in user_roles
        assert "kb_manager" not in user_roles

        menus = {m["auth_res"] for m in menu_auth_union(conn, user_roles)}
        assert "kbMgt" not in menus

        # 写入 lizy 并验证 user+kb_manager
        conn.execute(
            """
            INSERT OR REPLACE INTO users
            (userid, username, password, name, access, email, user_status)
            VALUES ('lizy1','lizy',?,'Lizy','user','lizy@test.local',1)
            """,
            (hash_password("x"),),
        )
    # 再跑 patch（init 已跑过；手动补 lizy 角色）
    from app.db import get_conn as gc
    from app.security.rbac import replace_user_roles

    with gc() as conn:
        replace_user_roles(conn, "lizy", ["user", "kb_manager"])
        lr = load_user_roles(conn, "lizy")
        assert "user" in lr and "kb_manager" in lr
        lm = {m["auth_res"] for m in menu_auth_union(conn, lr)}
        assert "kbMgt" in lm and "kbFileMgt" in lm
        assert not is_admin({"roles": lr, "access": "user"})
        assert is_admin({"roles": admin_roles, "access": "admin"})


def test_replace_user_roles_and_derive(db_ready):
    from app.db import get_conn
    from app.security.rbac import derive_access, load_user_roles, replace_user_roles

    with get_conn() as conn:
        codes = replace_user_roles(conn, "user", ["user", "kb_manager"])
        assert set(codes) == {"user", "kb_manager"}
        assert derive_access(codes) == "user"
        assert set(load_user_roles(conn, "user")) == {"user", "kb_manager"}
        assert derive_access(["admin", "kb_manager"]) == "admin"
