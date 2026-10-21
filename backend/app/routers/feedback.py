"""反馈闭环 API：提交 / 列表 / 详情 / 评论 / 改状态 / 截图上传。"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import FileResponse

from app.config import get_settings
from app.db import _now, fail, get_conn, ok, rows_to_list
from app.routers import mock_api
from app.services import feedback_mail

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

ALLOWED_TYPES = {"bug", "suggestion", "data", "other"}
ALLOWED_STATUS = {"pending", "resolving", "fixed", "resolved", "ignored"}
CONTEXT_MAX_BYTES = 32 * 1024


def _imgs_dir() -> Path:
    d = get_settings().data_path / "feedback_imgs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _actor(request: Request) -> tuple[str, str, str]:
    """返回 (username, name, access)。未登录 → ('', '', 'guest')。

    鉴权顺序：
    1) header token → 内存 _TOKENS（登录签发）
    2) 回退 header username / loginUser（与 CurrentUser?username= 同级弱鉴权；
       后端重启后 token 会丢，但 localStorage 里仍有 loginUser，否则管理页列表恒空）
    """
    token = (
        request.headers.get("token")
        or request.headers.get("Token")
        or ""
    ).strip()
    username = ""
    if token:
        username = mock_api._TOKENS.get(token) or ""
    if not username:
        username = (
            request.headers.get("username")
            or request.headers.get("loginUser")
            or request.headers.get("LoginUser")
            or ""
        ).strip()
    if not username:
        return "", "", "guest"
    with get_conn() as conn:
        row = conn.execute(
            "SELECT username, name, access, email FROM users WHERE username=?",
            (username,),
        ).fetchone()
    if not row:
        return username, "", "user"
    return (
        row["username"] or "",
        row["name"] or row["username"] or "",
        row["access"] or "user",
    )


def _user_email(username: str) -> str:
    if not username:
        return ""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT email FROM users WHERE username=?", (username,)
        ).fetchone()
    return (row["email"] or "") if row else ""


def _parse_images(raw: Any) -> list:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            v = json.loads(raw)
            return v if isinstance(v, list) else []
        except Exception:
            return []
    return []


def _row_public(row: dict) -> dict:
    data = dict(row)
    data["images"] = _parse_images(data.get("images"))
    return data


def _clamp_context(raw: Any) -> str:
    if raw is None:
        return ""
    if isinstance(raw, (dict, list)):
        text = json.dumps(raw, ensure_ascii=False)
    else:
        text = str(raw)
    encoded = text.encode("utf-8")
    if len(encoded) <= CONTEXT_MAX_BYTES:
        return text
    # 截断到上限，附加标记
    cut = encoded[: CONTEXT_MAX_BYTES - 32].decode("utf-8", errors="ignore")
    return cut + "\n/*truncated*/"


@router.post("")
@router.post("/")
async def create_feedback(request: Request):
    body = await request.json()
    fb_id = str(body.get("id") or "").strip() or uuid.uuid4().hex
    fb_type = str(body.get("feedback_type") or body.get("type") or "bug").strip()
    if fb_type not in ALLOWED_TYPES:
        return fail("feedback_type 无效", 400)
    content = str(body.get("content") or "").strip()
    if not content:
        return fail("content 必填", 400)

    username, user_name, _access = _actor(request)
    # 允许未登录；body 可覆盖展示名
    user = str(body.get("user") or username or "")
    user_name = str(body.get("user_name") or user_name or user or "")
    now = _now()
    env = str(body.get("env") or os.getenv("FEEDBACK_ENV") or "dev")
    visibility = str(body.get("visibility") or "internal")
    context_json = _clamp_context(body.get("context_json") or body.get("context") or {})
    images = body.get("images") or []
    if not isinstance(images, list):
        images = []
    images_s = json.dumps(images, ensure_ascii=False)

    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM feedbacks WHERE id=?", (fb_id,)
        ).fetchone()
        if existing:
            # 幂等：同 id 不重复插入，返回已有
            row = conn.execute(
                "SELECT * FROM feedbacks WHERE id=?", (fb_id,)
            ).fetchone()
            return ok(_row_public(dict(row)), msg="已存在（幂等）")
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
                fb_id,
                fb_type,
                content,
                str(body.get("page") or ""),
                "pending",
                "",
                "",
                "",
                "",
                visibility,
                env,
                "",
                "",
                str(body.get("gen_id") or ""),
                str(body.get("gen_type") or ""),
                str(body.get("outline_id") or ""),
                str(body.get("target_key") or ""),
                context_json,
                images_s,
                str(body.get("contact") or ""),
                user,
                user_name,
                "",
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM feedbacks WHERE id=?", (fb_id,)).fetchone()
    return ok(_row_public(dict(row)), msg="提交成功")


@router.get("")
@router.get("/")
async def list_feedback(
    request: Request,
    mine: int = Query(0),
    status: str = Query(""),
    assignee: str = Query(""),
):
    username, _name, access = _actor(request)
    clauses: list[str] = []
    params: list[Any] = []

    if access != "admin":
        # 非 admin / 未登录：只能看自己的；未登录勿匹配 user=''（会误扫到匿名脏数据）
        if not username:
            return ok([])
        clauses.append("user=?")
        params.append(username)
    elif mine:
        if not username:
            return ok([])
        clauses.append("user=?")
        params.append(username)

    if status:
        clauses.append("status=?")
        params.append(status)
    if assignee:
        if assignee in {"me", "self"}:
            clauses.append("assignee=?")
            params.append(username)
        else:
            clauses.append("assignee=?")
            params.append(assignee)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM feedbacks{where} ORDER BY created_at DESC LIMIT 500"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return ok([_row_public(dict(r)) for r in rows])


@router.get("/unread-count")
async def unread_count(request: Request):
    """提交人侧：fixed 待确认；被指派且 pending/resolving。"""
    username, _n, access = _actor(request)
    if not username:
        return ok({"count": 0})
    with get_conn() as conn:
        n1 = conn.execute(
            "SELECT COUNT(*) FROM feedbacks WHERE user=? AND status='fixed'",
            (username,),
        ).fetchone()[0]
        n2 = conn.execute(
            "SELECT COUNT(*) FROM feedbacks WHERE assignee=? AND status IN ('pending','resolving')",
            (username,),
        ).fetchone()[0]
    return ok({"count": int(n1) + int(n2)})


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        return fail("空文件", 400)
    if len(raw) > 8 * 1024 * 1024:
        return fail("图片过大", 400)
    ext = Path(file.filename or "shot.png").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        ext = ".png"
    name = f"{uuid.uuid4().hex}{ext}"
    path = _imgs_dir() / name
    path.write_bytes(raw)
    return ok({"file_name": name, "url": f"/api/feedback/image/{name}"})


@router.get("/image/{file_name}")
async def get_image(file_name: str):
    safe = Path(file_name).name
    path = _imgs_dir() / safe
    if not path.exists():
        return fail("不存在", 404)
    media = "image/png"
    if safe.lower().endswith((".jpg", ".jpeg")):
        media = "image/jpeg"
    elif safe.lower().endswith(".webp"):
        media = "image/webp"
    elif safe.lower().endswith(".gif"):
        media = "image/gif"
    return FileResponse(path, media_type=media, filename=safe)


@router.get("/{fb_id}")
async def get_feedback(fb_id: str, request: Request):
    username, _n, access = _actor(request)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM feedbacks WHERE id=?", (fb_id,)
        ).fetchone()
        if not row:
            return fail("不存在", 404)
        data = _row_public(dict(row))
        if access != "admin" and data.get("user") and data.get("user") != username:
            return fail("无权限", 403)
        comments = conn.execute(
            "SELECT * FROM feedback_comments WHERE feedback_id=? ORDER BY id ASC",
            (fb_id,),
        ).fetchall()
    data["comments"] = rows_to_list(list(comments))
    return ok(data)


@router.post("/{fb_id}/comments")
async def add_comment(fb_id: str, request: Request):
    username, user_name, access = _actor(request)
    body = await request.json()
    content = str(body.get("content") or "").strip()
    if not content:
        return fail("content 必填", 400)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM feedbacks WHERE id=?", (fb_id,)
        ).fetchone()
        if not row:
            return fail("不存在", 404)
        owner = row["user"] or ""
        if access != "admin" and owner and owner != username:
            return fail("无权限", 403)
        now = _now()
        cur = conn.execute(
            """
            INSERT INTO feedback_comments (feedback_id, user, user_name, content, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (fb_id, username, user_name, content, now),
        )
        cid = cur.lastrowid
        conn.execute(
            "UPDATE feedbacks SET updated_at=? WHERE id=?", (now, fb_id)
        )
        c = conn.execute(
            "SELECT * FROM feedback_comments WHERE id=?", (cid,)
        ).fetchone()
    return ok(dict(c), msg="已评论")


@router.put("/{fb_id}")
async def update_feedback(fb_id: str, request: Request):
    username, user_name, access = _actor(request)
    body = await request.json()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM feedbacks WHERE id=?", (fb_id,)
        ).fetchone()
        if not row:
            return fail("不存在", 404)
        fb = dict(row)
        owner = fb.get("user") or ""
        new_status = body.get("status")
        reopen_reason = str(body.get("reopen_reason") or "").strip()

        is_admin = access == "admin"
        is_owner = bool(username) and owner == username

        # 权限：admin 可改状态/指派/回复；user 仅可 resolved 或重开本人条目
        if not is_admin:
            if not is_owner:
                return fail("无权限", 403)
            if new_status not in {"resolved", "pending"}:
                return fail("无权限改此状态", 403)
            if new_status == "pending" and fb.get("status") == "fixed":
                if not reopen_reason:
                    return fail("重开须填原因", 400)
            elif new_status == "resolved":
                if fb.get("status") not in {"fixed", "resolved"}:
                    return fail("仅 fixed 可确认已修复", 400)
            else:
                return fail("无权限", 403)

        now = _now()
        fields: list[str] = ["updated_at=?"]
        params: list[Any] = [now]

        if new_status:
            if new_status not in ALLOWED_STATUS:
                return fail("status 无效", 400)
            fields.append("status=?")
            params.append(new_status)
            if new_status == "resolved":
                fields.extend(["resolved_by=?", "resolved_at=?"])
                params.extend([username, now])
            if new_status == "pending" and reopen_reason:
                # 重开原因写入评论
                conn.execute(
                    """
                    INSERT INTO feedback_comments (feedback_id, user, user_name, content, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        fb_id,
                        username,
                        user_name,
                        f"[重开] {reopen_reason}",
                        now,
                    ),
                )

        if is_admin:
            if "assignee" in body:
                fields.append("assignee=?")
                params.append(str(body.get("assignee") or ""))
            if "assignee_name" in body:
                fields.append("assignee_name=?")
                params.append(str(body.get("assignee_name") or ""))
            if "reply" in body:
                fields.append("reply=?")
                params.append(str(body.get("reply") or ""))

        params.append(fb_id)
        conn.execute(
            f"UPDATE feedbacks SET {', '.join(fields)} WHERE id=?",
            params,
        )
        updated = dict(
            conn.execute("SELECT * FROM feedbacks WHERE id=?", (fb_id,)).fetchone()
        )

    # 邮件：仅 fixed / resolved；异步，失败不阻断
    if new_status in {"fixed", "resolved"}:
        to_email = _user_email(updated.get("user") or "")
        title = (updated.get("content") or "")[:40]

        def _on_done(notify_status: str, err: Optional[str]):
            with get_conn() as c2:
                c2.execute(
                    "UPDATE feedbacks SET notify_status=?, notify_at=? WHERE id=?",
                    (notify_status, _now(), fb_id),
                )

        feedback_mail.schedule_notify(
            feedback_id=fb_id,
            to_email=to_email,
            title=title,
            new_status=new_status,
            reply_summary=str(updated.get("reply") or ""),
            on_done=_on_done,
        )
        # 先标 pending，线程完成后再改
        if feedback_mail.smtp_configured() and feedback_mail.valid_email(to_email):
            with get_conn() as c3:
                c3.execute(
                    "UPDATE feedbacks SET notify_status=? WHERE id=?",
                    ("pending", fb_id),
                )
                updated["notify_status"] = "pending"
        elif not feedback_mail.valid_email(to_email):
            with get_conn() as c3:
                c3.execute(
                    "UPDATE feedbacks SET notify_status=?, notify_at=? WHERE id=?",
                    ("skipped", _now(), fb_id),
                )
                updated["notify_status"] = "skipped"
        else:
            with get_conn() as c3:
                c3.execute(
                    "UPDATE feedbacks SET notify_status=?, notify_at=? WHERE id=?",
                    ("skipped", _now(), fb_id),
                )
                updated["notify_status"] = "skipped"

    return ok(_row_public(updated), msg="已更新")
