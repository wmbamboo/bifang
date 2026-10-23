"""多角色 RBAC 辅助（方案 C）：user_roles 并集。"""
from __future__ import annotations

from typing import Iterable, Optional

import sqlite3


def normalize_roles(roles: Optional[Iterable[str]]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for r in roles or []:
        code = str(r or "").strip()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out


def derive_access(roles: Iterable[str]) -> str:
    """主身份：有 admin 则为 admin，否则 user（kb_manager 只作附加角色）。"""
    return "admin" if "admin" in set(roles) else "user"


def _role_set(user_or_roles) -> set[str]:
    if isinstance(user_or_roles, dict):
        roles = user_or_roles.get("roles")
        if roles:
            return set(roles)
        access = user_or_roles.get("access") or ""
        return {access} if access else set()
    if isinstance(user_or_roles, (list, tuple, set)):
        return set(user_or_roles)
    s = str(user_or_roles or "")
    return {s} if s else set()


def is_admin(user_or_roles) -> bool:
    if isinstance(user_or_roles, dict):
        roles = user_or_roles.get("roles")
        if roles:
            return "admin" in roles
        return (user_or_roles.get("access") or "") == "admin"
    if isinstance(user_or_roles, (list, tuple, set)):
        return "admin" in set(user_or_roles)
    return str(user_or_roles or "") == "admin"


def is_feedback_receiver(user_or_roles) -> bool:
    """admin 或反馈接收员：可打包派发 Cursor。"""
    return is_admin(user_or_roles) or "feedback_receiver" in _role_set(user_or_roles)


def is_feedback_verifier(user_or_roles) -> bool:
    """admin 或反馈验证员：可代验证已修复。"""
    return is_admin(user_or_roles) or "feedback_verifier" in _role_set(user_or_roles)


def can_view_all_feedback(user_or_roles) -> bool:
    """可看全量反馈列表/详情（admin / 接收员 / 验证员 / 程序猿）。"""
    roles = _role_set(user_or_roles)
    return is_admin(user_or_roles) or bool(
        roles
        & {"feedback_receiver", "feedback_verifier", "coder"}
    )


def is_feedback_coder(user_or_roles) -> bool:
    """程序猿：仅该角色可见反馈开发管理（不含 admin 隐式授权）。"""
    return "coder" in _role_set(user_or_roles)


def load_user_roles(conn: sqlite3.Connection, username: str) -> list[str]:
    rows = conn.execute(
        "SELECT role_code FROM user_roles WHERE username=? ORDER BY role_code",
        (username,),
    ).fetchall()
    if rows:
        return [str(r[0]) for r in rows]
    row = conn.execute(
        "SELECT access FROM users WHERE username=?", (username,)
    ).fetchone()
    if row and row["access"]:
        return [str(row["access"])]
    return ["user"]


def replace_user_roles(
    conn: sqlite3.Connection, username: str, roles: Iterable[str]
) -> list[str]:
    codes = normalize_roles(roles)
    if not codes:
        codes = ["user"]
    conn.execute("DELETE FROM user_roles WHERE username=?", (username,))
    for code in codes:
        conn.execute(
            "INSERT INTO user_roles (username, role_code) VALUES (?, ?)",
            (username, code),
        )
    return codes


def menu_auth_union(conn: sqlite3.Connection, role_codes: Iterable[str]) -> list[dict]:
    codes = normalize_roles(role_codes)
    if not codes:
        return []
    placeholders = ",".join("?" * len(codes))
    rows = conn.execute(
        f"""
        SELECT DISTINCT auth_res, res_type, res_status
        FROM role_res
        WHERE res_type='menu' AND role_code IN ({placeholders})
        """,
        codes,
    ).fetchall()
    return [dict(r) for r in rows]
