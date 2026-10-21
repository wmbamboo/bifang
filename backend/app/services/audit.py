"""操作审计：白名单中间件 + 登录日志写入。"""
from __future__ import annotations

import re
import time
from datetime import datetime, timedelta
from typing import Any, Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.db import _now, get_conn
from app.security import auth as auth_mod

# (method, path_regex, action)
AUDIT_RULES: list[tuple[str, re.Pattern[str], str]] = [
    ( "POST", re.compile(r"^/knowledge_base/create_knowledge_base/?$"), "kb_create"),
    ( "POST", re.compile(r"^/knowledge_base/delete_knowledge_base/?$"), "kb_delete"),
    ( "POST", re.compile(r"^/knowledge_base/upload_docs/?$"), "doc_upload"),
    ( "POST", re.compile(r"^/knowledge_base/upload_docs_async/?$"), "doc_upload"),
    ( "POST", re.compile(r"^/knowledge_base/delete_docs/?$"), "doc_delete"),
    ( "POST", re.compile(r"^/knowledge_base/update_docs/?$"), "doc_revectorize"),
    ( "POST", re.compile(r"^/knowledge_base/recreate_vector_store/?$"), "doc_revectorize"),
    ( "POST", re.compile(r"^/knowledge_base/upload_tasks/revectorize/?$"), "doc_revectorize"),
    ( "POST", re.compile(r"^/api/feedback/?$"), "fb_create"),
    ( "PUT", re.compile(r"^/api/feedback/[^/]+/?$"), "fb_status"),
    ( "POST", re.compile(r"^/api/feedback/[^/]+/comments/?$"), "fb_comment"),
    ( "POST", re.compile(r"^/api/feedback/upload-image/?$"), "fb_image"),
    ( "POST", re.compile(r"^/mock_api/user/add/?$"), "user_create"),
    ( "POST", re.compile(r"^/mock_api/user/update/?$"), "user_update"),
    ( "PUT", re.compile(r"^/mock_api/user/password/?$"), "pwd_change"),
    ( "GET", re.compile(r"^/mock_api/user/delete/?$"), "user_disable"),
]

# 前端上报允许的 action（含生成/导出/页面停留）
FRONTEND_ACTIONS = {
    "page_view",
    "gen_doc_start",
    "gen_doc_done",
    "gen_ppt_start",
    "gen_ppt_done",
    "gen_fail",
    "export_docx",
    "export_pptx",
    "fb_assign",
}


def write_login_log(
    *,
    username: str,
    name: str = "",
    client_ip: str = "",
    user_agent: str = "",
    event: str,
    reason: str = "",
    session_id: str = "",
    login_at: Optional[str] = None,
    logout_at: Optional[str] = None,
    duration_s: int = 0,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO login_logs
            (username, name, client_ip, user_agent, event, reason, session_id,
             login_at, logout_at, duration_s, record_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username or "",
                name or "",
                client_ip or "",
                (user_agent or "")[:300],
                event,
                reason or "",
                session_id or "",
                login_at,
                logout_at,
                int(duration_s or 0),
                _now(),
            ),
        )


def write_user_log(
    *,
    user: str = "",
    name: str = "",
    client_ip: str = "",
    url: str = "",
    module: str = "",
    menu: str = "",
    fcn: str = "",
    event: str = "action",
    action: str = "",
    target: str = "",
    result: str = "ok",
    detail: str = "",
    session_id: str = "",
    duration_ms: int = 0,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO user_logs
            (user, name, org_code, org_name, source, url, module, menu, fcn,
             client_ip, request_id, record_time, event, action, target, result,
             detail, session_id, duration_ms)
            VALUES (?, ?, '', '', 'web', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user or "",
                name or "",
                (url or "")[:500],
                module or "",
                menu or "",
                fcn or action or "",
                client_ip or "",
                _now(),
                event or "action",
                action or "",
                (target or "")[:200],
                result or "ok",
                (detail or "")[:500],
                session_id or "",
                int(duration_ms or 0),
            ),
        )


def match_action(method: str, path: str) -> Optional[str]:
    m = (method or "").upper()
    for meth, pat, action in AUDIT_RULES:
        if meth == m and pat.match(path):
            return action
    return None


def on_token_timeout(token: str, sess: dict) -> None:
    login_at = float(sess.get("login_at") or 0)
    now = time.time()
    write_login_log(
        username=str(sess.get("username") or ""),
        event="timeout",
        session_id=auth_mod.session_id_of(token),
        login_at=datetime.fromtimestamp(login_at).isoformat(timespec="seconds")
        if login_at
        else None,
        logout_at=_now(),
        duration_s=max(0, int(now - login_at)) if login_at else 0,
    )


def purge_old_logs() -> None:
    """page_view 30 天；其余 user_logs / login_logs 180 天。"""
    now = datetime.now()
    cut_pv = (now - timedelta(days=30)).isoformat(timespec="seconds")
    cut_all = (now - timedelta(days=180)).isoformat(timespec="seconds")
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM user_logs WHERE action='page_view' AND record_time < ?",
            (cut_pv,),
        )
        conn.execute(
            "DELETE FROM user_logs WHERE (action IS NULL OR action!='page_view') AND record_time < ?",
            (cut_all,),
        )
        conn.execute(
            "DELETE FROM login_logs WHERE COALESCE(record_time, login_at, logout_at, '') < ?",
            (cut_all,),
        )


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        method = request.method
        action = match_action(method, path)
        started = time.time()
        response: Response = await call_next(request)
        if not action:
            return response
        try:
            user = auth_mod.current_user(request, on_timeout=on_token_timeout)
            ip, _ua = auth_mod.client_meta(request)
            ok = 200 <= int(response.status_code) < 400
            write_user_log(
                user=(user or {}).get("username") or "",
                name=(user or {}).get("name") or "",
                client_ip=ip,
                url=path,
                event="action",
                action=action,
                result="ok" if ok else "fail",
                detail="" if ok else f"http_{response.status_code}",
                session_id=(user or {}).get("_session_id") or "",
                duration_ms=int((time.time() - started) * 1000),
            )
        except Exception:
            pass
        return response
