"""上传/解析/向量化流水线任务管理。

支持：进度查询、暂停、恢复、停止、断点续跑（含服务重启后恢复）。
"""
from __future__ import annotations

import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from app.db import get_conn, ok, fail, rows_to_list, _now
from app.services import kb_service
from app.services.document_loader import load_file_text, split_text
from app.services.embeddings import embed_texts
from app.config import get_settings

# 进程内控制：task_id -> Event(set=paused) / stop flag
_pause_events: dict[str, threading.Event] = {}
_stop_flags: dict[str, bool] = {}
_worker_lock = threading.Lock()
_running_workers: set[str] = set()


def _ensure_ctrl(task_id: str) -> threading.Event:
    if task_id not in _pause_events:
        _pause_events[task_id] = threading.Event()  # clear = running, set = paused
    return _pause_events[task_id]


def _set_task(
    task_id: str,
    *,
    status: Optional[str] = None,
    done: Optional[int] = None,
    failed: Optional[int] = None,
    current_file: Optional[str] = None,
    message: Optional[str] = None,
) -> None:
    fields = ["update_time=?"]
    params: list[Any] = [_now()]
    if status is not None:
        fields.append("status=?")
        params.append(status)
    if done is not None:
        fields.append("done=?")
        params.append(done)
    if failed is not None:
        fields.append("failed=?")
        params.append(failed)
    if current_file is not None:
        fields.append("current_file=?")
        params.append(current_file)
    if message is not None:
        fields.append("message=?")
        params.append(message)
    params.append(task_id)
    with get_conn() as conn:
        conn.execute(f"UPDATE upload_tasks SET {', '.join(fields)} WHERE id=?", params)


def _set_item(
    task_id: str,
    file_name: str,
    *,
    status: Optional[str] = None,
    stage: Optional[str] = None,
    progress: Optional[int] = None,
    docs_count: Optional[int] = None,
    error: Optional[str] = None,
) -> None:
    fields = ["update_time=?"]
    params: list[Any] = [_now()]
    if status is not None:
        fields.append("status=?")
        params.append(status)
    if stage is not None:
        fields.append("stage=?")
        params.append(stage)
    if progress is not None:
        fields.append("progress=?")
        params.append(progress)
    if docs_count is not None:
        fields.append("docs_count=?")
        params.append(docs_count)
    if error is not None:
        fields.append("error=?")
        params.append(error)
    params.extend([task_id, file_name])
    with get_conn() as conn:
        conn.execute(
            f"UPDATE upload_task_items SET {', '.join(fields)} WHERE task_id=? AND file_name=?",
            params,
        )


def _recount(task_id: str) -> tuple[int, int]:
    with get_conn() as conn:
        done = conn.execute(
            "SELECT COUNT(*) FROM upload_task_items WHERE task_id=? AND status='success'",
            (task_id,),
        ).fetchone()[0]
        failed = conn.execute(
            "SELECT COUNT(*) FROM upload_task_items WHERE task_id=? AND status IN ('failed','cancelled')",
            (task_id,),
        ).fetchone()[0]
    return done, failed


def _compute_percent(task: dict, items: list[dict]) -> int:
    """按文件项进度加权，避免仅用已成功文件数导致 OCR 全程停在 0%。"""
    total = int(task.get("total") or 0)
    if total <= 0:
        return 0
    status = task.get("status") or ""
    if status == "completed":
        return 100
    acc = 0
    for it in items:
        st = it.get("status") or ""
        if st in {"success", "failed", "cancelled"}:
            acc += 100
        else:
            acc += max(0, min(99, int(it.get("progress") or 0)))
    return max(0, min(100, int(acc / total)))


def get_task(task_id: str) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM upload_tasks WHERE id=?", (task_id,)).fetchone()
        if not row:
            return None
        task = dict(row)
        items = rows_to_list(
            conn.execute(
                "SELECT * FROM upload_task_items WHERE task_id=? ORDER BY id",
                (task_id,),
            ).fetchall()
        )
    task["items"] = items
    task["percent"] = _compute_percent(task, items)
    return task


def list_tasks(kb_name: str = "", limit: int = 50) -> dict:
    sql = "SELECT * FROM upload_tasks"
    params: list[Any] = []
    if kb_name:
        sql += " WHERE kb_name=?"
        params.append(kb_name)
    sql += " ORDER BY create_time DESC LIMIT ?"
    params.append(limit)
    with get_conn() as conn:
        rows = rows_to_list(conn.execute(sql, params).fetchall())
        for t in rows:
            items = rows_to_list(
                conn.execute(
                    "SELECT * FROM upload_task_items WHERE task_id=? ORDER BY id",
                    (t["id"],),
                ).fetchall()
            )
            t["items"] = items
            t["percent"] = _compute_percent(t, items)
    return ok(rows)


def create_task_from_upload(
    knowledge_base_name: str,
    files: list[tuple[str, bytes]],
    override: bool = True,
) -> dict:
    """先落盘保存文件，再创建异步向量化任务并启动。"""
    if not knowledge_base_name:
        return fail("知识库名称不能为空", 400)
    if not files:
        return fail("未选择文件", 400)

    save_res = kb_service.save_uploaded_files(knowledge_base_name, files, override=override)
    save_failed = (save_res.get("data") or {}).get("failed_files") or {}

    task_id = uuid.uuid4().hex
    now = _now()
    saved_names: list[tuple[str, int]] = []
    for name, content in files:
        if name in save_failed:
            continue
        saved_names.append((name, len(content)))

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO upload_tasks
            (id, kb_name, status, total, done, failed, current_file, message, create_time, update_time)
            VALUES (?, ?, 'pending', ?, 0, 0, '', ?, ?, ?)
            """,
            (
                task_id,
                knowledge_base_name,
                len(saved_names) + len(save_failed),
                "文件已保存，等待解析、OCR与向量化",
                now,
                now,
            ),
        )
        for name, size in saved_names:
            conn.execute(
                """
                INSERT INTO upload_task_items
                (task_id, file_name, file_size, status, stage, progress, docs_count, error, create_time, update_time)
                VALUES (?, ?, ?, 'pending', 'queued', 0, 0, '', ?, ?)
                """,
                (task_id, name, size, now, now),
            )
        for name, err in save_failed.items():
            conn.execute(
                """
                INSERT INTO upload_task_items
                (task_id, file_name, file_size, status, stage, progress, docs_count, error, create_time, update_time)
                VALUES (?, ?, 0, 'failed', 'upload', 0, 0, ?, ?, ?)
                """,
                (task_id, name, str(err), now, now),
            )

    done, failed = _recount(task_id)
    _set_task(task_id, done=done, failed=failed)
    start_worker(task_id)
    return ok(get_task(task_id), msg="上传任务已创建")


def create_task_for_existing_files(knowledge_base_name: str, file_names: list[str]) -> dict:
    """对已落盘文件重建/续跑向量化任务。"""
    if not file_names:
        return fail("未指定文件", 400)
    content_dir = kb_service.kb_content_dir(knowledge_base_name)
    task_id = uuid.uuid4().hex
    now = _now()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO upload_tasks
            (id, kb_name, status, total, done, failed, current_file, message, create_time, update_time)
            VALUES (?, ?, 'pending', ?, 0, 0, '', ?, ?, ?)
            """,
            (task_id, knowledge_base_name, len(file_names), "等待解析、OCR与向量化", now, now),
        )
        for name in file_names:
            path = content_dir / name
            size = path.stat().st_size if path.exists() else 0
            conn.execute(
                """
                INSERT INTO upload_task_items
                (task_id, file_name, file_size, status, stage, progress, docs_count, error, create_time, update_time)
                VALUES (?, ?, ?, 'pending', 'queued', 0, 0, '', ?, ?)
                """,
                (task_id, name, size, now, now),
            )
    start_worker(task_id)
    return ok(get_task(task_id), msg="向量化任务已创建")


def pause_task(task_id: str) -> dict:
    task = get_task(task_id)
    if not task:
        return fail("任务不存在", 404)
    if task["status"] not in {"running", "pending"}:
        return fail(f"当前状态不可暂停: {task['status']}", 400)
    _ensure_ctrl(task_id).set()
    _set_task(task_id, status="paused", message="已暂停，可恢复继续")
    return ok(get_task(task_id), msg="已暂停")


def resume_task(task_id: str) -> dict:
    task = get_task(task_id)
    if not task:
        return fail("任务不存在", 404)
    if task["status"] not in {"paused", "stopped", "failed", "pending"}:
        if task["status"] == "running":
            return ok(task, msg="任务已在运行")
        if task["status"] == "completed":
            return fail("任务已完成", 400)
    # 将 cancelled / pending 的失败可续跑项保持 pending；stopped 时把 cancelled 改回 pending
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE upload_task_items
            SET status='pending', stage='queued', progress=0, error='', update_time=?
            WHERE task_id=? AND status IN ('cancelled','pending')
            """,
            (_now(), task_id),
        )
        # failed 保持失败，需显式 retry；但 resume 也允许重试 failed
        conn.execute(
            """
            UPDATE upload_task_items
            SET status='pending', stage='queued', progress=0, error='', update_time=?
            WHERE task_id=? AND status='failed'
            """,
            (_now(), task_id),
        )
    _stop_flags[task_id] = False
    _ensure_ctrl(task_id).clear()
    done, failed = _recount(task_id)
    _set_task(task_id, status="pending", done=done, failed=failed, message="恢复处理中")
    start_worker(task_id)
    return ok(get_task(task_id), msg="已恢复")


def stop_task(task_id: str) -> dict:
    task = get_task(task_id)
    if not task:
        return fail("任务不存在", 404)
    _stop_flags[task_id] = True
    _ensure_ctrl(task_id).clear()  # 若暂停中，放开以便 worker 能退出
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE upload_task_items
            SET status='cancelled', stage='stopped', error='用户停止', update_time=?
            WHERE task_id=? AND status IN ('pending','running')
            """,
            (_now(), task_id),
        )
    done, failed = _recount(task_id)
    _set_task(
        task_id,
        status="stopped",
        done=done,
        failed=failed,
        current_file="",
        message="已停止，可在任务管理中恢复继续",
    )
    return ok(get_task(task_id), msg="已停止")


def retry_failed(task_id: str) -> dict:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE upload_task_items
            SET status='pending', stage='queued', progress=0, error='', update_time=?
            WHERE task_id=? AND status IN ('failed','cancelled')
            """,
            (_now(), task_id),
        )
    done, failed = _recount(task_id)
    _set_task(task_id, status="pending", done=done, failed=failed, message="重试失败项")
    _stop_flags[task_id] = False
    _ensure_ctrl(task_id).clear()
    start_worker(task_id)
    return ok(get_task(task_id), msg="已开始重试")


def start_worker(task_id: str) -> None:
    with _worker_lock:
        if task_id in _running_workers:
            return
        _running_workers.add(task_id)
    t = threading.Thread(target=_run_worker, args=(task_id,), daemon=True)
    t.start()


def _wait_if_paused(task_id: str) -> bool:
    """返回 False 表示应停止。"""
    ev = _ensure_ctrl(task_id)
    while ev.is_set():
        if _stop_flags.get(task_id):
            return False
        time.sleep(0.3)
    return not _stop_flags.get(task_id, False)


def _vectorize_one(kb_name: str, file_name: str, task_id: str) -> tuple[bool, str, int]:
    """单文件：解析 → OCR(按需) → 向量化。返回 (ok, error, docs_count)。"""
    settings = get_settings()
    content_dir = kb_service.kb_content_dir(kb_name)
    path = content_dir / file_name
    if not path.exists():
        return False, "文件不存在", 0

    suffix = path.suffix.lower()
    need_ocr_stage = settings.ocr_enabled and suffix in {
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".bmp",
        ".tif",
        ".tiff",
        ".webp",
    }

    def _still_running() -> bool:
        return _wait_if_paused(task_id)

    try:
        # 1) 解析 / OCR
        _set_item(task_id, file_name, status="running", stage="parsing", progress=15)
        if not _still_running():
            return False, "用户停止", 0

        if need_ocr_stage:
            _set_item(task_id, file_name, stage="ocr", progress=25)

            def on_progress(page: int, total: int, mode: str) -> None:
                pct = 25 + int(30 * page / max(total, 1))
                _set_item(
                    task_id,
                    file_name,
                    stage="ocr",
                    progress=min(55, pct),
                )
                # 仅每隔几页更新任务文案，避免频繁写库导致列表刷新抖动
                if page == 1 or page == total or page % 3 == 0:
                    _set_task(
                        task_id,
                        current_file=file_name,
                        message=f"OCR识别：{file_name}（{page}/{total}页）",
                    )

            text = load_file_text(
                path,
                enable_ocr=True,
                on_progress=on_progress,
                should_continue=_still_running,
            )
        else:
            text = load_file_text(path, enable_ocr=False)

        if not _still_running():
            return False, "用户停止", 0

        chunks = split_text(
            text,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        if not chunks:
            tip = (
                "未能解析出文本内容（OCR 后仍为空；请检查是否为损坏文件或纯空白页）"
                if need_ocr_stage
                else "未能解析出文本内容（可能是扫描件/纯图片PDF；请开启 OCR 或提供可复制文本版）"
            )
            return False, tip, 0

        # 2) 向量化
        _set_item(task_id, file_name, stage="vectorizing", progress=60)
        if not _still_running():
            return False, "用户停止", 0

        store = kb_service.get_store(kb_name)
        store.delete_by_source(file_name)
        vectors = embed_texts(chunks)
        metadatas = [
            {"source": file_name, "kb_name": kb_name, "chunk": i}
            for i in range(len(chunks))
        ]
        store.add(chunks, metadatas, vectors)
        kb_service.save_store(kb_name)
        with get_conn() as conn:
            conn.execute(
                "UPDATE kb_files SET in_db=1, docs_count=? WHERE kb_name=? AND file_name=?",
                (len(chunks), kb_name, file_name),
            )
        return True, "", len(chunks)
    except InterruptedError:
        return False, "用户停止", 0
    except Exception as e:  # noqa: BLE001
        return False, str(e), 0


def _run_worker(task_id: str) -> None:
    try:
        task = get_task(task_id)
        if not task:
            return
        kb_name = task["kb_name"]
        _stop_flags.setdefault(task_id, False)
        _ensure_ctrl(task_id).clear()
        _set_task(task_id, status="running", message="正在处理")

        while True:
            if not _wait_if_paused(task_id):
                done, failed = _recount(task_id)
                _set_task(
                    task_id,
                    status="stopped",
                    done=done,
                    failed=failed,
                    current_file="",
                    message="已停止",
                )
                break

            with get_conn() as conn:
                row = conn.execute(
                    """
                    SELECT file_name FROM upload_task_items
                    WHERE task_id=? AND status='pending'
                    ORDER BY id LIMIT 1
                    """,
                    (task_id,),
                ).fetchone()

            if not row:
                done, failed = _recount(task_id)
                status = "completed" if failed == 0 else "completed"
                msg = "全部完成" if failed == 0 else f"完成（成功{done}，失败/取消{failed}）"
                _set_task(
                    task_id,
                    status=status,
                    done=done,
                    failed=failed,
                    current_file="",
                    message=msg,
                )
                break

            file_name = row["file_name"]
            _set_task(task_id, current_file=file_name, message=f"处理中：{file_name}")
            _set_item(task_id, file_name, status="running", stage="parsing", progress=10)

            ok_flag, err, docs_count = _vectorize_one(kb_name, file_name, task_id)

            if _stop_flags.get(task_id) and not ok_flag and err == "用户停止":
                _set_item(
                    task_id,
                    file_name,
                    status="cancelled",
                    stage="stopped",
                    progress=0,
                    error=err,
                )
            elif ok_flag:
                _set_item(
                    task_id,
                    file_name,
                    status="success",
                    stage="done",
                    progress=100,
                    docs_count=docs_count,
                    error="",
                )
            else:
                _set_item(
                    task_id,
                    file_name,
                    status="failed",
                    stage="failed",
                    progress=0,
                    error=err,
                )
                # 同步 kb_files 保持 in_db=0
                with get_conn() as conn:
                    conn.execute(
                        "UPDATE kb_files SET in_db=0, docs_count=0 WHERE kb_name=? AND file_name=?",
                        (kb_name, file_name),
                    )

            done, failed = _recount(task_id)
            _set_task(task_id, done=done, failed=failed)
    finally:
        with _worker_lock:
            _running_workers.discard(task_id)


def recover_interrupted_tasks() -> None:
    """服务启动时：将 running 标记为 paused，便于用户恢复；也可自动续跑。"""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id FROM upload_tasks WHERE status IN ('running','pending')"
        ).fetchall()
        ids = [r["id"] for r in rows]
        for tid in ids:
            conn.execute(
                """
                UPDATE upload_tasks SET status='paused', message='服务重启后已暂停，可点恢复继续', update_time=?
                WHERE id=?
                """,
                (_now(), tid),
            )
            conn.execute(
                """
                UPDATE upload_task_items SET status='pending', stage='queued', progress=0, update_time=?
                WHERE task_id=? AND status='running'
                """,
                (_now(), tid),
            )
    # 自动续跑未完成任务
    for tid in ids:
        print(f"[upload_task] 自动恢复任务 {tid}")
        _stop_flags[tid] = False
        _ensure_ctrl(tid).clear()
        _set_task(tid, status="pending", message="自动恢复中")
        start_worker(tid)
