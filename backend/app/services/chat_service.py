from __future__ import annotations

import json
from typing import Any, Optional

from app.db import get_conn, ok, fail, rows_to_list, new_id, ms_now, _now


def list_user_convs(user: str, mod_fcn: str) -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user, chat_type, kb_name, name, mod_fcn
            FROM chat_convs
            WHERE user=? AND mod_fcn=?
            ORDER BY create_time DESC
            """,
            (user or "", mod_fcn or ""),
        ).fetchall()
    return ok(rows_to_list(rows))


def update_conv(conv_id: str, conv_name: str) -> dict:
    with get_conn() as conn:
        conn.execute("UPDATE chat_convs SET name=? WHERE id=?", (conv_name, conv_id))
    return ok(msg="修改成功")


def delete_conv(conv_id: str) -> dict:
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_convs WHERE id=?", (conv_id,))
        conn.execute("DELETE FROM chat_msgs WHERE conv_id=?", (conv_id,))
    return ok(msg="删除成功")


def list_conv_msgs(conv_id: str) -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_msgs WHERE conv_id=? ORDER BY createAt ASC",
            (conv_id,),
        ).fetchall()
    data = []
    for r in rows_to_list(rows):
        extra = r.get("extra") or "{}"
        try:
            extra_obj = json.loads(extra) if isinstance(extra, str) else extra
        except Exception:
            extra_obj = {}
        data.append(
            {
                "uid": r["uid"],
                "id": r["id"],
                "conv_id": r["conv_id"],
                "role": r["role"],
                "message": r.get("message") or r.get("content") or "",
                "content": r.get("content") or "",
                "parentId": r.get("parentId") or "",
                "extra": extra_obj,
                "createAt": r.get("createAt"),
                "updateAt": r.get("updateAt"),
                "create_time": r.get("create_time"),
            }
        )
    return ok(data)


def clear_conv_msgs(conv_id: str) -> dict:
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_msgs WHERE conv_id=?", (conv_id,))
    return ok(msg="清空成功")


def ensure_conv(
    conv_id: str,
    user: str = "",
    mod_fcn: str = "",
    kb_name: str = "",
    chat_type: str = "llm",
    name: str = "新会话",
) -> None:
    with get_conn() as conn:
        exists = conn.execute("SELECT 1 FROM chat_convs WHERE id=?", (conv_id,)).fetchone()
        if exists:
            return
        conn.execute(
            """
            INSERT INTO chat_convs (id, user, chat_type, kb_name, name, mod_fcn, create_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (conv_id, user, chat_type, kb_name, name, mod_fcn, _now()),
        )


def bat_add_msgs(payload: dict[str, Any]) -> dict:
    conv_id = payload.get("conv_id") or new_id()
    messages = payload.get("messages") or []
    last_content = payload.get("last_content")
    last_acc_docs = payload.get("last_acc_docs")
    last_acc_docs_text = payload.get("last_acc_docs_text")
    msg_req_action = payload.get("msg_req_action") or "send"

    # 从消息推断用户/功能（前端通常已建会话，这里做兜底）
    ensure_conv(conv_id)

    with get_conn() as conn:
        if msg_req_action == "resend":
            # 重新生成时替换最后一条 assistant
            conn.execute(
                """
                DELETE FROM chat_msgs WHERE uid IN (
                    SELECT uid FROM chat_msgs WHERE conv_id=? AND role='assistant'
                    ORDER BY createAt DESC LIMIT 1
                )
                """,
                (conv_id,),
            )

        # 简化：清空后全量写入当前会话消息
        conn.execute("DELETE FROM chat_msgs WHERE conv_id=?", (conv_id,))
        for msg in messages:
            mid = msg.get("id") or new_id()
            now = msg.get("createAt") or ms_now()
            content = msg.get("content") or msg.get("message") or ""
            if isinstance(content, list):
                content = "".join(str(x) for x in content)
            role = msg.get("role") or "user"
            extra = msg.get("extra") or {}
            if role == "assistant" and last_acc_docs is not None:
                extra = dict(extra) if isinstance(extra, dict) else {}
                extra["ret_docs"] = last_acc_docs
                if last_acc_docs_text:
                    extra["ret_docs_text"] = last_acc_docs_text
            conn.execute(
                """
                INSERT INTO chat_msgs
                (uid, id, conv_id, role, message, content, parentId, extra, createAt, updateAt, create_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id(),
                    mid,
                    conv_id,
                    role,
                    content,
                    content,
                    msg.get("parentId") or "",
                    json.dumps(extra, ensure_ascii=False),
                    now,
                    msg.get("updateAt") or now,
                    _now(),
                ),
            )

        # 若最后一条不是 assistant 且有 last_content，补一条
        if last_content and (not messages or messages[-1].get("role") != "assistant"):
            extra = {}
            if last_acc_docs is not None:
                extra["ret_docs"] = last_acc_docs
                if last_acc_docs_text:
                    extra["ret_docs_text"] = last_acc_docs_text
            now = ms_now()
            conn.execute(
                """
                INSERT INTO chat_msgs
                (uid, id, conv_id, role, message, content, parentId, extra, createAt, updateAt, create_time)
                VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)
                """,
                (
                    new_id(),
                    new_id(),
                    conv_id,
                    "assistant",
                    last_content,
                    last_content,
                    json.dumps(extra, ensure_ascii=False),
                    now,
                    now,
                    _now(),
                ),
            )

        # 更新会话名称
        first_user = next((m for m in messages if m.get("role") == "user"), None)
        if first_user:
            title = str(first_user.get("content") or "新会话")[:30]
            conn.execute("UPDATE chat_convs SET name=? WHERE id=?", (title, conv_id))

    return ok(msg="保存成功")


def update_msg(conv_id: str, message_id: str, content: str) -> dict:
    with get_conn() as conn:
        conn.execute(
            "UPDATE chat_msgs SET content=?, message=?, updateAt=? WHERE conv_id=? AND id=?",
            (content, content, ms_now(), conv_id, message_id),
        )
    return ok(msg="修改成功")


def delete_msg(conv_id: str, message_id: str) -> dict:
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_msgs WHERE conv_id=? AND id=?", (conv_id, message_id))
    return ok(msg="删除成功")
