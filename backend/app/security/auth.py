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
    """仅当 TCP 对端是可信代理时才采信 X-Real-IP（四十九·7）。

    不单独采信裸 X-Forwarded-For：本机直连 peer 也是 127.0.0.1，
    若信 XFF 则 curl 自带伪造头仍会写进审计。dev proxy / nginx 须覆盖写 X-Real-IP。
    """
    from app.config import get_settings

    peer = ""
    if request.client:
        peer = (request.client.host or "").strip()
    trusted = get_settings().trusted_proxy_set
    if peer not in trusted:
        return peer
    real = (request.headers.get("x-real-ip") or "").strip()
    if real:
        return real
    return peer


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
    """header token → query token → Authorization Bearer（仅当命中会话表）。"""
    h = (
        request.headers.get("token")
        or request.headers.get("Token")
        or ""
    ).strip()
    if h:
        return h
    q = (request.query_params.get("token") or "").strip()
    if q:
        return q
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        cand = auth[7:].strip()
        if cand and cand in _TOKENS:
            return cand
    return ""


def current_user(request: Request, *, on_timeout=None) -> Optional[dict]:
    """可为 None；仅认 token，不回退 username/loginUser 头。"""
    return validate_token(extract_token(request), on_timeout=on_timeout)


def require_user(request: Request, *, on_timeout=None) -> dict:
    user = current_user(request, on_timeout=on_timeout)
    if not user:
        raise HTTPException(status_code=401, detail="登录已过期或未登录")
    return user
