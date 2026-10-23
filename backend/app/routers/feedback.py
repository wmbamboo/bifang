"""反馈闭环 API：提交 / 列表 / 详情 / 评论 / 改状态 / 截图上传 / Cursor 派发。"""
from __future__ import annotations

import json
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import FileResponse

from fastapi import HTTPException

from app.config import get_settings
from app.db import _now, fail, get_conn, ok, rows_to_list
from app.security import auth as auth_mod
from app.security.guard import RequireFeedbackDev, RequireFeedbackDispatch
from app.security.rbac import (
    can_view_all_feedback,
    is_admin,
    is_feedback_coder,
    is_feedback_receiver,
    is_feedback_verifier,
)
from app.services import audit, feedback_mail
from app.services import cursor_agent as cursor_agent_svc
from app.services import feedback_pack as feedback_pack_svc

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

ALLOWED_TYPES = {"bug", "suggestion", "data", "other"}
ALLOWED_STATUS = {"pending", "resolving", "fixed", "resolved", "ignored"}
CONTEXT_MAX_BYTES = 32 * 1024

_dispatch_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="fb-cursor")
_dispatch_lock = threading.Lock()
# username -> job_id（同用户同时最多 1 个 running）
_running_by_user: dict[str, str] = {}


def _imgs_dir() -> Path:
    d = get_settings().data_path / "feedback_imgs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _actor(
    request: Request, *, required: bool = False
) -> tuple[str, str, str, Optional[dict]]:
    """返回 (username, name, access, user_dict)。access：含 admin 则为 admin。"""
    user = auth_mod.current_user(request, on_timeout=audit.on_token_timeout)
    if not user:
        if required:
            raise HTTPException(status_code=401, detail="登录已过期或未登录")
        return "", "", "guest", None
    access = "admin" if is_admin(user) else (user.get("access") or "user")
    return (
        user.get("username") or "",
        user.get("name") or user.get("username") or "",
        access,
        user,
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

    username, user_name, _access, _u = _actor(request, required=True)
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
    username, _name, access, actor = _actor(request, required=True)
    clauses: list[str] = []
    params: list[Any] = []

    view_all = can_view_all_feedback(actor or {})
    if not view_all:
        clauses.append("user=?")
        params.append(username)
    elif mine:
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
        out = []
        for r in rows:
            item = _row_public(dict(r))
            fid = item.get("id") or ""
            item["comment_count"] = _comment_count(conn, fid)
            item["new_comment_count"] = _new_comment_count(
                conn, fid, username
            )
            out.append(item)
    return ok(out)


def _comment_count(conn, feedback_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) FROM feedback_comments WHERE feedback_id=?",
        (feedback_id,),
    ).fetchone()
    return int(row[0]) if row else 0


def _new_comment_count(conn, feedback_id: str, username: str) -> int:
    """他人评论中晚于本用户已读水位的条数。"""
    if not feedback_id or not username:
        return 0
    read = conn.execute(
        """
        SELECT comments_read_at FROM feedback_reads
        WHERE username=? AND feedback_id=?
        """,
        (username, feedback_id),
    ).fetchone()
    watermark = (read["comments_read_at"] if read else "") or ""
    row = conn.execute(
        """
        SELECT COUNT(*) FROM feedback_comments
        WHERE feedback_id=?
          AND IFNULL(user,'') != ?
          AND IFNULL(created_at,'') > ?
        """,
        (feedback_id, username, watermark),
    ).fetchone()
    return int(row[0]) if row else 0


def _sum_new_comments_for_user(conn, username: str, display_name: str) -> int:
    """与我相关的反馈上的新评论总数（提交人或被指派）。"""
    name = (display_name or "").strip()
    if name and name != username:
        owner_clause = "(f.user=? OR f.user_name=? OR f.user=? OR f.user_name=? OR f.assignee=?)"
        params: list[Any] = [username, username, name, name, username]
    else:
        owner_clause = "(f.user=? OR f.user_name=? OR f.assignee=?)"
        params = [username, username, username]
    row = conn.execute(
        f"""
        SELECT COUNT(*) FROM feedback_comments c
        JOIN feedbacks f ON f.id = c.feedback_id
        LEFT JOIN feedback_reads r
          ON r.feedback_id = c.feedback_id AND r.username = ?
        WHERE {owner_clause}
          AND IFNULL(c.user,'') != ?
          AND IFNULL(c.created_at,'') > IFNULL(r.comments_read_at, '')
        """,
        [username, *params, username],
    ).fetchone()
    return int(row[0]) if row else 0


def _mark_comments_read(conn, username: str, feedback_id: str) -> str:
    """把已读水位抬到当前最新评论时间（无评论则用 now）。"""
    latest = conn.execute(
        """
        SELECT MAX(created_at) FROM feedback_comments WHERE feedback_id=?
        """,
        (feedback_id,),
    ).fetchone()
    stamp = (latest[0] if latest and latest[0] else None) or _now()
    conn.execute(
        """
        INSERT INTO feedback_reads (username, feedback_id, comments_read_at)
        VALUES (?, ?, ?)
        ON CONFLICT(username, feedback_id) DO UPDATE SET
          comments_read_at=excluded.comments_read_at
        """,
        (username, feedback_id, stamp),
    )
    return stamp


def _submitter_fixed_count(conn, username: str, display_name: str) -> int:
    """提交人待验证：status=fixed，username / 显示名任一命中。"""
    name = (display_name or "").strip()
    if name and name != username:
        row = conn.execute(
            """
            SELECT COUNT(*) FROM feedbacks
            WHERE status='fixed'
              AND (user=? OR user_name=? OR user=? OR user_name=?)
            """,
            (username, username, name, name),
        ).fetchone()
    else:
        row = conn.execute(
            """
            SELECT COUNT(*) FROM feedbacks
            WHERE status='fixed' AND (user=? OR user_name=?)
            """,
            (username, username),
        ).fetchone()
    return int(row[0]) if row else 0


@router.get("/unread-count")
async def unread_count(
    request: Request,
    scope: str = Query(
        "all",
        description="all=新评论+待办；submitter=仅待验证；comments=仅新评论",
    ),
):
    """角标：默认 count=新评论数；另返回 todos（待验证+指派）。"""
    username, display_name, _access, actor = _actor(request)
    if not username:
        return ok({"count": 0, "new_comments": 0, "todos": 0})
    scope_norm = (scope or "all").strip().lower()
    with get_conn() as conn:
        n_comments = _sum_new_comments_for_user(conn, username, display_name)
        n1 = _submitter_fixed_count(conn, username, display_name)
        n2 = 0
        if scope_norm != "submitter":
            handler = bool(actor) and (
                is_admin(actor)
                or is_feedback_coder(actor)
                or is_feedback_receiver(actor)
            )
            if handler:
                row = conn.execute(
                    """
                    SELECT COUNT(*) FROM feedbacks
                    WHERE assignee=? AND status IN ('pending','resolving')
                    """,
                    (username,),
                ).fetchone()
                n2 = int(row[0]) if row else 0
        todos = n1 + n2
        if scope_norm == "submitter":
            return ok(
                {"count": n1, "new_comments": n_comments, "todos": n1}
            )
        if scope_norm == "comments":
            return ok(
                {
                    "count": n_comments,
                    "new_comments": n_comments,
                    "todos": todos,
                }
            )
        # all：右上角以新评论为主；todos 单独字段
        return ok(
            {
                "count": n_comments,
                "new_comments": n_comments,
                "todos": todos,
            }
        )


@router.post("/{fb_id}/comments/read")
async def mark_feedback_comments_read(fb_id: str, request: Request):
    """查看评论后抬已读水位，清掉该条新评论红标。"""
    username, _n, _a, actor = _actor(request, required=True)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM feedbacks WHERE id=?", (fb_id,)
        ).fetchone()
        if not row:
            return fail("不存在", 404)
        data = dict(row)
        if (
            not can_view_all_feedback(actor or {})
            and data.get("user")
            and data.get("user") != username
            and data.get("assignee") != username
        ):
            return fail("无权限", 403)
        stamp = _mark_comments_read(conn, username, fb_id)
    return ok({"comments_read_at": stamp, "new_comment_count": 0})


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


def _run_dispatch_job(job_id: str, username: str, instruction: str) -> None:
    try:
        root = feedback_pack_svc.job_dir(job_id)
        cursor_agent_svc.run_cursor_agent(job_id, root, instruction=instruction)
    finally:
        with _dispatch_lock:
            if _running_by_user.get(username) == job_id:
                _running_by_user.pop(username, None)


@router.post("/cursor-dispatch")
async def cursor_dispatch(request: Request, _user: dict = RequireFeedbackDispatch):
    body = await request.json()
    ids = body.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return fail("ids 必填", 400)
    ids = [str(i).strip() for i in ids if str(i).strip()]
    if not ids:
        return fail("ids 必填", 400)
    if len(ids) > 50:
        return fail("单次最多 50 条", 400)
    instruction = str(body.get("instruction") or "")
    username = _user.get("username") or ""

    with _dispatch_lock:
        existing = _running_by_user.get(username)
        if existing:
            meta = feedback_pack_svc.read_meta(existing) or {}
            if meta.get("status") in {"queued", "packed", "running"}:
                return fail(f"已有进行中的任务 {existing}", 409)
        job_id = uuid.uuid4().hex
        _running_by_user[username] = job_id

    try:
        feedback_pack_svc.build_pack(
            ids, job_id=job_id, created_by=username, instruction=instruction
        )
        feedback_pack_svc.write_meta(job_id, status="queued")
    except Exception as ex:
        with _dispatch_lock:
            _running_by_user.pop(username, None)
        return fail(f"打包失败：{ex}", 500)

    _dispatch_pool.submit(_run_dispatch_job, job_id, username, instruction)
    return ok({"job_id": job_id, "status": "queued"}, msg="已排队")


@router.post("/workbuddy-prepare")
async def workbuddy_prepare(request: Request, _user: dict = RequireFeedbackDispatch):
    """打包反馈（不派 Cursor），返回 job_id + WorkBuddy 分析指令。

    用户把返回的 instruction 粘贴进 WorkBuddy，WorkBuddy 经 bifang-feedback MCP
    读任务包 → 分析 → write_result 写回 RESULT.md（推荐设计方案），前端任务状态即变 done。
    """
    body = await request.json()
    ids = body.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return fail("ids 必填", 400)
    ids = [str(i).strip() for i in ids if str(i).strip()]
    if not ids:
        return fail("ids 必填", 400)
    if len(ids) > 50:
        return fail("单次最多 50 条", 400)
    instruction = str(body.get("instruction") or "")
    username = _user.get("username") or ""

    job_id = uuid.uuid4().hex
    try:
        feedback_pack_svc.build_pack(
            ids, job_id=job_id, created_by=username, instruction=instruction
        )
        feedback_pack_svc.write_meta(job_id, status="queued", agent="workbuddy")
    except Exception as ex:
        return fail(f"打包失败：{ex}", 500)

    wb_instruction = (
        f"请用 bifang-feedback MCP 工具分析毕方反馈任务 {job_id}：\n"
        "1. 调用 read_job 读取反馈条目全文、页面、context_json 与截图清单；\n"
        "2. 对每条反馈结合毕方代码库（\\\\wsl.localhost\\Ubuntu\\home\\hezl\\bifang）定位根因，"
        "必要时用 read_image 查看截图；\n"
        "3. 分析并给出推荐设计方案：列出可选方案（各自思路、涉及模块、优缺点与权衡），"
        "给出推荐意见，调用 write_result 写回该任务的 RESULT.md；\n"
        "   暂不产出可直接执行的落地方案（不给出代码级改法），"
        "后续由人工在 WorkBuddy 继续分析并分派 Cursor。\n"
        f"job_id: {job_id}"
    )
    return ok(
        {
            "job_id": job_id,
            "status": "queued",
            "agent": "workbuddy",
            "instruction": wb_instruction,
        },
        msg="已打包，请在 WorkBuddy 中粘贴分析指令",
    )


@router.get("/cursor-jobs/{job_id}")
async def cursor_job_status(job_id: str, _user: dict = RequireFeedbackDispatch):
    safe = Path(job_id).name
    meta = feedback_pack_svc.read_meta(safe)
    if not meta:
        return fail("任务不存在", 404)
    root = feedback_pack_svc.job_dir(safe)
    meta = dict(meta)
    meta["has_result"] = (root / "RESULT.md").exists()
    meta["has_error"] = (root / "ERROR.md").exists()
    meta["has_pack"] = (root / "pack.zip").exists()
    return ok(meta)


@router.get("/cursor-jobs/{job_id}/pack")
async def cursor_job_pack(job_id: str, _user: dict = RequireFeedbackDispatch):
    safe = Path(job_id).name
    path = feedback_pack_svc.job_dir(safe) / "pack.zip"
    if not path.is_file():
        return fail("包不存在", 404)
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"feedback_pack_{safe[:8]}.zip",
    )


@router.get("/dev/jobs")
async def list_dev_jobs(
    _user: dict = RequireFeedbackDev,
    limit: int = Query(100, ge=1, le=500),
):
    """程序猿：Agent 任务列表（前因后果摘要）。"""
    return ok(feedback_pack_svc.list_jobs(limit=limit))


@router.get("/dev/jobs/{job_id}")
async def get_dev_job(job_id: str, _user: dict = RequireFeedbackDev):
    data = feedback_pack_svc.job_detail(job_id)
    if not data:
        return fail("任务不存在", 404)
    return ok(data)


@router.get("/dev/jobs/{job_id}/pack")
async def get_dev_job_pack(job_id: str, _user: dict = RequireFeedbackDev):
    safe = Path(job_id).name
    path = feedback_pack_svc.job_dir(safe) / "pack.zip"
    if not path.is_file():
        return fail("包不存在", 404)
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"feedback_pack_{safe[:8]}.zip",
    )


@router.get("/{fb_id}")
async def get_feedback(fb_id: str, request: Request):
    username, _n, access, actor = _actor(request, required=True)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM feedbacks WHERE id=?", (fb_id,)
        ).fetchone()
        if not row:
            return fail("不存在", 404)
        data = _row_public(dict(row))
        if (
            not can_view_all_feedback(actor or {})
            and data.get("user")
            and data.get("user") != username
        ):
            return fail("无权限", 403)
        comments = conn.execute(
            "SELECT * FROM feedback_comments WHERE feedback_id=? ORDER BY id ASC",
            (fb_id,),
        ).fetchall()
    data["comments"] = rows_to_list(list(comments))
    return ok(data)


@router.post("/{fb_id}/comments")
async def add_comment(fb_id: str, request: Request):
    username, user_name, access, actor = _actor(request, required=True)
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
        if (
            not can_view_all_feedback(actor or {})
            and owner
            and owner != username
        ):
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
    username, user_name, access, actor = _actor(request, required=True)
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

        admin_ok = is_admin(actor or {})
        is_owner = bool(username) and owner == username
        verifier_ok = is_feedback_verifier(actor or {})
        coder_ok = is_feedback_coder(actor or {})

        # 权限：admin 可改状态/指派/回复；
        # 程序猿可将条目标为 fixed（待验证）；
        # 提交人或反馈验证员可将 fixed → resolved / 重开
        if not admin_ok:
            if coder_ok and new_status == "fixed":
                pass
            elif new_status in {"resolved", "pending"} and (
                is_owner or verifier_ok
            ):
                if new_status == "pending" and fb.get("status") == "fixed":
                    if not reopen_reason:
                        return fail("重开须填原因", 400)
                elif new_status == "resolved":
                    if fb.get("status") not in {"fixed", "resolved"}:
                        return fail("仅待验证状态可标记为已验证", 400)
                else:
                    return fail("无权限", 403)
            else:
                return fail("无权限改此状态", 403)

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

        if admin_ok or (coder_ok and new_status == "fixed"):
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
                    ("no_email", _now(), fb_id),
                )
                updated["notify_status"] = "no_email"
        else:
            with get_conn() as c3:
                c3.execute(
                    "UPDATE feedbacks SET notify_status=?, notify_at=? WHERE id=?",
                    ("skipped", _now(), fb_id),
                )
                updated["notify_status"] = "skipped"

    return ok(_row_public(updated), msg="已更新")


@router.post("/{fb_id}/resend-notify")
async def resend_notify(fb_id: str, request: Request):
    """补邮箱后重发 fixed/resolved 通知（admin 或提交人）。"""
    username, _n, access, actor = _actor(request, required=True)
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM feedbacks WHERE id=?", (fb_id,)).fetchone()
        if not row:
            return fail("不存在", 404)
        fb = dict(row)
        if not is_admin(actor or {}) and fb.get("user") != username:
            return fail("无权限", 403)
        status = fb.get("status") or ""
        if status not in {"fixed", "resolved"}:
            return fail("仅 fixed/resolved 可重发", 400)
        to_email = _user_email(fb.get("user") or "")
        if not feedback_mail.smtp_configured():
            return fail("未配置 SMTP", 400)
        if not feedback_mail.valid_email(to_email):
            conn.execute(
                "UPDATE feedbacks SET notify_status=?, notify_at=? WHERE id=?",
                ("no_email", _now(), fb_id),
            )
            return fail("提交人未填邮箱", 400)

    def _on_done(notify_status: str, err: Optional[str]):
        with get_conn() as c2:
            c2.execute(
                "UPDATE feedbacks SET notify_status=?, notify_at=? WHERE id=?",
                (notify_status, _now(), fb_id),
            )

    feedback_mail.schedule_notify(
        feedback_id=fb_id,
        to_email=to_email,
        title=(fb.get("content") or "")[:40],
        new_status=status,
        reply_summary=str(fb.get("reply") or ""),
        on_done=_on_done,
    )
    with get_conn() as c3:
        c3.execute(
            "UPDATE feedbacks SET notify_status=? WHERE id=?",
            ("pending", fb_id),
        )
    return ok({"notify_status": "pending"}, msg="已触发重发")
