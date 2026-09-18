from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import chat, knowledge_base, kb_chat, mock_api
from app.services import kb_service
from app.services import upload_task_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # 示例库向量化放到后台，避免阻塞服务启动
    import threading

    def _warm_samples():
        try:
            kb_service.vectorize_files("samples")
            print("[info] samples 知识库向量化完成")
        except Exception as e:
            print(f"[warn] samples 向量化跳过: {e}")

    threading.Thread(target=_warm_samples, daemon=True).start()
    # 恢复未完成的上传/向量化任务
    try:
        upload_task_service.recover_interrupted_tasks()
    except Exception as e:
        print(f"[warn] 上传任务恢复跳过: {e}")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="毕方智能知识管理平台",
        version="4.0.0",
        description="LangChain-Chatchat 兼容后端（DeepSeek + GPU Embedding + FAISS/BM25 混合检索）",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origin_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(knowledge_base.router)
    app.include_router(chat.router)
    app.include_router(kb_chat.router)
    app.include_router(mock_api.router)

    @app.get("/")
    async def root():
        return {
            "name": "毕方智能知识管理平台",
            "version": "4.0.0",
            "docs": "/docs",
            "llm": settings.deepseek_model,
            "embedding": settings.embedding_model,
        }

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
