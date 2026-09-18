from __future__ import annotations

import json
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.db import ok
from app.services import chat_service, kb_service
from app.services.llm import stream_chat, resolve_model

router = APIRouter(prefix="/chat", tags=["chat"])


def _openai_chunk(content: str = "", finish_reason: Optional[str] = None, docs: Optional[list] = None) -> str:
    payload: dict[str, Any] = {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": get_settings().deepseek_model,
        "choices": [
            {
                "index": 0,
                "delta": {"content": content} if content else {},
                "finish_reason": finish_reason,
            }
        ],
    }
    if docs is not None:
        payload["docs"] = docs
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    return await _handle_completions(body, kb_name=None)


@router.post("/completions")
async def chat_completions_alias(request: Request):
    # OpenAI SDK baseURL=/chat 时请求 /chat/completions；兼容误配
    body = await request.json()
    return await _handle_completions(body, kb_name=None)


async def _handle_completions(body: dict[str, Any], kb_name: Optional[str]):
    messages = body.get("messages") or []
    model = body.get("model")
    stream = body.get("stream", True)
    conversation_id = body.get("conversation_id") or ""
    mod_fcn = body.get("mod_fcn") or ""
    op_user = body.get("op_user") or ""
    stream_options = body.get("stream_options") or {}
    temperature = float(stream_options.get("temperature") or body.get("temperature") or 0.7)
    top_k = int(stream_options.get("top_k") or get_settings().default_top_k)
    raw_threshold = stream_options.get("score_threshold")
    score_threshold = float(
        get_settings().default_score_threshold if raw_threshold is None else raw_threshold
    )

    # 规范化 messages
    norm_messages = []
    for m in messages:
        role = m.get("role") or "user"
        content = m.get("content") or ""
        if isinstance(content, list):
            # pro-chat 可能传复杂结构
            parts = []
            for item in content:
                if isinstance(item, dict):
                    parts.append(str(item.get("text") or item.get("content") or ""))
                else:
                    parts.append(str(item))
            content = "".join(parts)
        norm_messages.append({"role": role, "content": str(content)})

    extra_system = None
    docs_payload: list = []
    if kb_name:
        user_query = ""
        for m in reversed(norm_messages):
            if m["role"] == "user":
                user_query = m["content"]
                break
        docs, task = kb_service.retrieve_for_writing(
            user_query,
            kb_name,
            top_k=top_k,
            score_threshold=score_threshold,
        )
        _, docs_payload = kb_service.format_docs_for_prompt(docs)
        extra_system = kb_service.build_rag_system_prompt(docs, task=task)

    if conversation_id:
        chat_service.ensure_conv(
            conversation_id,
            user=op_user,
            mod_fcn=mod_fcn,
            kb_name=kb_name or "",
            chat_type="knowledge_base" if kb_name else "llm",
            name=(norm_messages[-1]["content"][:30] if norm_messages else "新会话"),
        )

    if not stream:
        # 非流式：拼接
        chunks = []
        async for c in stream_chat(norm_messages, model=model, temperature=temperature, extra_system=extra_system):
            chunks.append(c)
        text = "".join(chunks)
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": resolve_model(model),
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "stop",
                }
            ],
            "docs": docs_payload,
        }

    async def event_gen():
        # 先推送 docs，便于前端展示相关文档
        if docs_payload:
            yield _openai_chunk(content="", docs=docs_payload)
        async for content in stream_chat(
            norm_messages, model=model, temperature=temperature, extra_system=extra_system
        ):
            yield _openai_chunk(content=content)
        yield _openai_chunk(content="", finish_reason="stop")
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---- 会话历史 ----
@router.get("/user_chat_conv/list")
async def user_chat_conv_list(user: str = Query(""), mod_fcn: str = Query("")):
    return chat_service.list_user_convs(user, mod_fcn)


@router.post("/chat_conv/update")
async def chat_conv_update(request: Request):
    body = await request.json()
    return chat_service.update_conv(body.get("conv_id"), body.get("conv_name") or "新会话")


@router.get("/chat_conv/delete")
async def chat_conv_delete(conv_id: str = Query(...)):
    return chat_service.delete_conv(conv_id)


@router.get("/chat_conv_msg/list")
async def chat_conv_msg_list(conv_id: str = Query(...)):
    return chat_service.list_conv_msgs(conv_id)


@router.get("/chat_conv_msg/clear")
async def chat_conv_msg_clear(conv_id: str = Query(...)):
    return chat_service.clear_conv_msgs(conv_id)


@router.post("/chat_msg/bat_add")
async def chat_msg_bat_add(request: Request):
    body = await request.json()
    if isinstance(body, str):
        body = json.loads(body)
    return chat_service.bat_add_msgs(body)


@router.post("/chat_msg/update")
async def chat_msg_update(request: Request):
    body = await request.json()
    return chat_service.update_msg(body.get("conv_id"), body.get("message_id"), body.get("content") or "")


@router.get("/chat_msg/delete")
async def chat_msg_delete(conv_id: str = Query(...), message_id: str = Query(...)):
    return chat_service.delete_msg(conv_id, message_id)


@router.get("/chat_llm_conf")
async def chat_llm_conf():
    settings = get_settings()
    return ok(
        {
            "def_model_name": settings.deepseek_model,
            "model_names": [settings.deepseek_model, "deepseek-reasoner"],
            "temperature": 0.7,
        }
    )


@router.get("/chat_emd_conf")
async def chat_emd_conf():
    settings = get_settings()
    return ok(
        {
            "def_embedding": settings.embedding_model,
            "embed_models": [
                settings.embedding_model,
                "BAAI/bge-large-zh-v1.5",
                "BAAI/bge-m3",
            ],
            "device": settings.embedding_device,
            "retrieval_mode": settings.retrieval_mode,
        }
    )
