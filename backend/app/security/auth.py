"""会话 token：滑动过期 + 绝对上限；统一鉴权入口。"""
from __future__ import annotations

import secrets
import time
from typing import Any, Optional

from fastapi import HTTPException, Request

from app.db import get_conn

# 滑动窗口：自最后一次有效请求起 2 小时；绝对上限：自登录起 12 小时
SESSION_IDLE_TTL_S = 2 * 3600
SESSION_ABS_TTL_S = 12 * 3600

# token -> {username, exp_abs, last, login_at}
_TOKENS: dict[str, dict[str, Any]] = {}


def issue_token(username: str) -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    _TOKENS[token] = {
        "username": username,
        "login_at": now,
        "last": now,
        "exp_abs": now + SESSION_ABS_TTL_S,
    }
    return token


def revoke_token(token: str) -> Optional[dict[str, Any]]:
    return _TOKENS.pop(token, None)


def session_id_of(token: str) -> str:
    return (token or "")[:8]


def _client_ip(request: Request) -> str:
    xff = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if xff:
        return xff
    real = (request.headers.get("x-real-ip") or "").strip()
    if real:
        return real
    if request.client:
        return request.client.host or ""
    return ""


def client_meta(request: Request) -> tuple[str, str]:
    ua = (request.headers.get("user-agent") or "")[:300]
    return _client_ip(request), ua


def _load_user(username: str) -> Optional[dict]:
    from app.security.rbac import load_user_roles

    with get_conn() as conn:
        row = conn.execute(
            "SELECT userid, username, name, access, email, user_status FROM users WHERE username=?",
            (username,),
        ).fetchone()
        if not row:
            return None
        data = dict(row)
        data["roles"] = load_user_roles(conn, username)
    return data


def validate_token(
    token: str,
    *,
    on_timeout=None,
) -> Optional[dict]:
    """校验并滑动续期。过期时可选 on_timeout(sess) 写审计后删除。"""
    if not token:
        return None
    sess = _TOKENS.get(token)
    if not sess:
        return None
    now = time.time()
    idle_deadline = float(sess.get("last") or 0) + SESSION_IDLE_TTL_S
    abs_deadline = float(sess.get("exp_abs") or 0)
    if now > abs_deadline or now > idle_deadline:
        if on_timeout:
            try:
                on_timeout(token, sess)
            except Exception:
                pass
        _TOKENS.pop(token, None)
        return None
    sess["last"] = now
    user = _load_user(sess["username"])
    if not user:
        _TOKENS.pop(token, None)
        return None
    if not int(user.get("user_status") or 0):
        _TOKENS.pop(token, None)
        return None
    user["_token"] = token
    user["_session_id"] = session_id_of(token)
    user["_login_at"] = sess.get("login_at")
    return user


def extract_token(request: Request) -> str:
    return (
        request.headers.get("token")
        or request.headers.get("Token")
        or ""
    ).strip()


def current_user(request: Request, *, on_timeout=None) -> Optional[dict]:
    """可为 None；仅认 token，不回退 username/loginUser 头。"""
    return validate_token(extract_token(request), on_timeout=on_timeout)


def require_user(request: Request, *, on_timeout=None) -> dict:
    user = current_user(request, on_timeout=on_timeout)
    if not user:
        raise HTTPException(status_code=401, detail="登录已过期或未登录")
    return user
