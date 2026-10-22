"""全站鉴权中间件 + 角色依赖（四十九）。"""
from __future__ import annotations

import json
from typing import Callable, Optional

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.config import get_settings
from app.security import auth as auth_mod
from app.security.rbac import is_admin
from app.services import audit

# 不鉴权路径（前缀或精确）
_EXACT_PUBLIC = {"/", "/health", "/openapi.json", "/docs", "/redoc", "/favicon.ico"}
_PREFIX_PUBLIC = ("/static", "/assets", "/docs/")
_PUBLIC_POST = {
    "/mock_api/login/account",
    "/mock_api/login/outLogin",
}


def _is_public(request: Request) -> bool:
    if request.method == "OPTIONS":
        return True
    path = request.url.path or "/"
    if path in _EXACT_PUBLIC:
        return True
    if any(path.startswith(p) for p in _PREFIX_PUBLIC):
        return True
    if request.method == "POST" and path in _PUBLIC_POST:
        return True
    # Swagger UI 静态
    if path.startswith("/openapi"):
        return True
    return False


def _unauthorized_body(msg: str = "请先登录") -> dict:
    return {
        "code": 401,
        "msg": msg,
        "data": {"isLogin": False},
        "success": True,
        "errorCode": "401",
        "errorMessage": msg,
    }


def _is_openai_path(path: str) -> bool:
    return path.endswith("/chat/completions") or path.endswith("/completions")


def _openai_unauthorized_body() -> dict:
    return {
        "error": {
            "message": "登录已过期，请重新登录",
            "type": "invalid_request_error",
            "code": "401",
        }
    }


class AuthGuardMiddleware(BaseHTTPMiddleware):
    """除白名单外要求有效 token。mode=off|log|enforce。"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable):
        settings = get_settings()
        mode = (settings.auth_guard_mode or "enforce").strip().lower()
        if mode == "off" or _is_public(request):
            return await call_next(request)

        user = auth_mod.current_user(request, on_timeout=audit.on_token_timeout)
        if user:
            request.state.user = user
            return await call_next(request)

        if mode == "log":
            try:
                from app.db import get_conn, _now

                with get_conn() as conn:
                    conn.execute(
                        """
                        INSERT INTO user_logs
                        (user, name, url, module, menu, fcn, client_ip, event, action, result, detail, record_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            "",
                            "",
                            str(request.url.path),
                            "auth_guard",
                            "",
                            request.method,
                            auth_mod.client_meta(request)[0],
                            "auth",
                            "auth_guard_miss",
                            "warn",
                            "missing_or_invalid_token",
                            _now(),
                        ),
                    )
            except Exception:
                pass
            return await call_next(request)

        # enforce：OpenAI SDK 路径返回 OpenAI 错误体，便于 AuthenticationError 带人话
        path = request.url.path or "/"
        if _is_openai_path(path):
            return JSONResponse(
                status_code=401, content=_openai_unauthorized_body()
            )
        return JSONResponse(status_code=401, content=_unauthorized_body())


def require_api_user(request: Request) -> dict:
    user = getattr(request.state, "user", None) or auth_mod.current_user(
        request, on_timeout=audit.on_token_timeout
    )
    if not user:
        raise HTTPException(status_code=401, detail="登录已过期或未登录")
    return user


def require_api_admin(request: Request) -> dict:
    user = require_api_user(request)
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="无权限")
    return user


def require_api_kb(request: Request) -> dict:
    user = require_api_user(request)
    roles = set(user.get("roles") or [])
    if is_admin(user) or "kb_manager" in roles:
        return user
    raise HTTPException(status_code=403, detail="无知识库管理权限")


# FastAPI Depends 别名
RequireUser = Depends(require_api_user)
RequireAdmin = Depends(require_api_admin)
RequireKb = Depends(require_api_kb)
