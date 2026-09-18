from __future__ import annotations

from functools import lru_cache
from typing import Any, AsyncIterator, Optional

from openai import AsyncOpenAI, OpenAI

from app.config import get_settings


@lru_cache
def get_sync_client() -> OpenAI:
    settings = get_settings()
    return OpenAI(
        api_key=settings.deepseek_api_key or "sk-placeholder",
        base_url=settings.deepseek_api_base,
    )


@lru_cache
def get_async_client() -> AsyncOpenAI:
    settings = get_settings()
    return AsyncOpenAI(
        api_key=settings.deepseek_api_key or "sk-placeholder",
        base_url=settings.deepseek_api_base,
    )


def resolve_model(model: Optional[str] = None) -> str:
    settings = get_settings()
    if not model or model in {"", "auto", "default"}:
        return settings.deepseek_model
    # 前端可能缓存旧模型名，统一映射到 DeepSeek
    aliases = {
        "glm4:9b-chat-q8_0": settings.deepseek_model,
        "glm-4": settings.deepseek_model,
        "chatglm": settings.deepseek_model,
        "quentinz/bge-large-zh-v1.5:latest": settings.deepseek_model,
    }
    return aliases.get(model, model if model.startswith("deepseek") else settings.deepseek_model)


async def stream_chat(
    messages: list[dict[str, Any]],
    model: Optional[str] = None,
    temperature: float = 0.7,
    extra_system: Optional[str] = None,
) -> AsyncIterator[str]:
    client = get_async_client()
    settings = get_settings()
    key = (settings.deepseek_api_key or "").strip()
    if not key or key.startswith("sk-your-") or key == "sk-placeholder":
        yield "未配置有效的 DEEPSEEK_API_KEY，请在 backend/.env 中填写 DeepSeek API Key 后重启服务。"
        return

    final_messages = list(messages)
    if extra_system:
        final_messages = [{"role": "system", "content": extra_system}] + [
            m for m in final_messages if m.get("role") != "system"
        ]

    try:
        stream = await client.chat.completions.create(
            model=resolve_model(model),
            messages=final_messages,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            content = getattr(delta, "content", None) or ""
            if content:
                yield content
    except Exception as e:
        yield f"调用 DeepSeek 失败：{e}"


async def chat_once(
    messages: list[dict[str, Any]],
    model: Optional[str] = None,
    temperature: float = 0.7,
) -> str:
    client = get_async_client()
    settings = get_settings()
    key = (settings.deepseek_api_key or "").strip()
    if not key or key.startswith("sk-your-") or key == "sk-placeholder":
        return "未配置有效的 DEEPSEEK_API_KEY，请在 backend/.env 中填写后重试。"
    try:
        resp = await client.chat.completions.create(
            model=resolve_model(model),
            messages=messages,
            temperature=temperature,
            stream=False,
        )
        return resp.choices[0].message.content or ""
    except Exception as e:
        return f"调用 DeepSeek 失败：{e}"
