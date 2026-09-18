from __future__ import annotations

from fastapi import APIRouter, Request

from app.routers.chat import _handle_completions

router = APIRouter(tags=["kb_openai"])


@router.post("/knowledge_base/local_kb/{kb_name}/chat/completions")
async def kb_chat_completions(kb_name: str, request: Request):
    body = await request.json()
    return await _handle_completions(body, kb_name=kb_name)
