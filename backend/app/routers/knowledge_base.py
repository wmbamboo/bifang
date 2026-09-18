from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.config import get_settings
from app.db import ok, fail
from app.services import kb_service
from app.services import upload_task_service

router = APIRouter(prefix="/knowledge_base", tags=["knowledge_base"])


def _body_score_threshold(body: dict) -> float:
    raw = body.get("score_threshold")
    if raw is None:
        return get_settings().default_score_threshold
    return float(raw)


@router.get("/list_knowledge_bases")
async def list_knowledge_bases():
    return kb_service.list_knowledge_bases()


@router.post("/create_knowledge_base")
async def create_knowledge_base(request: Request):
    body = await _read_json(request)
    return kb_service.create_knowledge_base(
        knowledge_base_name=body.get("knowledge_base_name") or body.get("kb_name") or "",
        kb_info=body.get("kb_info") or "",
        vector_store_type=body.get("vector_store_type") or body.get("vs_type") or "chroma",
        embed_model=body.get("embed_model") or "",
    )


@router.post("/update_info")
async def update_info(request: Request):
    body = await _read_json(request)
    return kb_service.update_kb_info(
        knowledge_base_name=body.get("knowledge_base_name") or body.get("kb_name") or "",
        kb_info=body.get("kb_info") or "",
        **body,
    )


@router.post("/delete_knowledge_base")
async def delete_knowledge_base(request: Request):
    body = await request.body()
    text = body.decode("utf-8").strip()
    kb_name = ""
    if text.startswith("{"):
        data = json.loads(text)
        kb_name = data.get("knowledge_base_name") or data.get("kb_name") or ""
    else:
        kb_name = text.strip('"')
    return kb_service.delete_knowledge_base(kb_name)


@router.post("/upload_docs")
async def upload_docs(
    knowledge_base_name: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    override: str = Form("true"),
    to_vector_store: str = Form("true"),
):
    file_tuples: list[tuple[str, bytes]] = []
    for f in files:
        content = await f.read()
        file_tuples.append((f.filename or "unnamed", content))
    result = kb_service.save_uploaded_files(
        knowledge_base_name,
        file_tuples,
        override=str(override).lower() in {"1", "true", "yes"},
    )
    # 默认上传后即索引，便于检索与问答
    do_vec = str(to_vector_store).lower() not in {"0", "false", "no"}
    if do_vec:
        names = [n for n, _ in file_tuples]
        vec = kb_service.vectorize_files(knowledge_base_name, file_names=names)
        return ok(
            {
                "failed_files": {
                    **(result.get("data") or {}).get("failed_files", {}),
                    **(vec.get("data") or {}).get("failed_files", {}),
                }
            },
            msg="上传并向量化完成",
        )
    return result


@router.get("/list_files")
async def list_files(
    knowledge_base_name: str = Query(...),
    query: str = Query(""),
):
    return kb_service.list_files(knowledge_base_name, query)


@router.post("/delete_docs")
async def delete_docs(request: Request):
    body = await _read_json(request)
    return kb_service.delete_docs(
        knowledge_base_name=body.get("knowledge_base_name") or "",
        file_names=body.get("file_names") or [],
        delete_content=body.get("delete_content", True),
    )


@router.post("/update_docs")
async def update_docs(request: Request):
    body = await _read_json(request)
    return kb_service.vectorize_files(
        knowledge_base_name=body.get("knowledge_base_name") or "",
        file_names=body.get("file_names") or None,
        chunk_size=body.get("chunk_size"),
        chunk_overlap=body.get("chunk_overlap"),
    )


@router.post("/recreate_vector_store")
async def recreate_vector_store(request: Request):
    body = await _read_json(request)
    return kb_service.recreate_vector_store(**body)


@router.get("/download_doc")
async def download_doc(
    knowledge_base_name: str = Query(...),
    file_name: str = Query(...),
):
    path = kb_service.get_file_path(knowledge_base_name, file_name)
    if not path.exists():
        return JSONResponse(fail("文件不存在", 404), status_code=404)
    return FileResponse(path, filename=file_name)


@router.post("/search_docs")
async def search_docs(request: Request):
    body = await _read_json(request)
    docs = kb_service.search_docs(
        query=body.get("query") or "",
        knowledge_base_name=body.get("knowledge_base_name") or "",
        top_k=int(body.get("top_k") or 10),
        score_threshold=_body_score_threshold(body),
        mode=body.get("mode") or body.get("retriever") or None,
    )
    return docs


@router.post("/search_cross_kb_docs")
async def search_cross_kb_docs(request: Request):
    body = await _read_json(request)
    return kb_service.search_cross_kb_docs(
        query=body.get("query") or "",
        kb_names=body.get("kb_names") or [],
        top_k=int(body.get("top_k") or 10),
        score_threshold=_body_score_threshold(body),
        mode=body.get("mode") or body.get("retriever") or None,
    )


@router.post("/upload_docs_async")
async def upload_docs_async(
    knowledge_base_name: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    override: str = Form("true"),
):
    """上传文件并创建后台解析/向量化任务（立即返回 task）。"""
    file_tuples: list[tuple[str, bytes]] = []
    for f in files:
        content = await f.read()
        file_tuples.append((f.filename or "unnamed", content))
    return upload_task_service.create_task_from_upload(
        knowledge_base_name,
        file_tuples,
        override=str(override).lower() in {"1", "true", "yes"},
    )


@router.get("/upload_tasks")
async def upload_tasks(knowledge_base_name: str = Query(""), limit: int = Query(50)):
    return upload_task_service.list_tasks(kb_name=knowledge_base_name or "", limit=limit)


@router.get("/upload_tasks/{task_id}")
async def upload_task_detail(task_id: str):
    task = upload_task_service.get_task(task_id)
    if not task:
        return fail("任务不存在", 404)
    return ok(task)


@router.post("/upload_tasks/{task_id}/pause")
async def upload_task_pause(task_id: str):
    return upload_task_service.pause_task(task_id)


@router.post("/upload_tasks/{task_id}/resume")
async def upload_task_resume(task_id: str):
    return upload_task_service.resume_task(task_id)


@router.post("/upload_tasks/{task_id}/stop")
async def upload_task_stop(task_id: str):
    return upload_task_service.stop_task(task_id)


@router.post("/upload_tasks/{task_id}/retry")
async def upload_task_retry(task_id: str):
    return upload_task_service.retry_failed(task_id)


@router.post("/upload_tasks/revectorize")
async def upload_tasks_revectorize(request: Request):
    """对已落盘文件创建向量化任务（用于失败重试/补入向量库）。"""
    body = await _read_json(request)
    return upload_task_service.create_task_for_existing_files(
        knowledge_base_name=body.get("knowledge_base_name") or "",
        file_names=body.get("file_names") or [],
    )


@router.get("/vs_type_conf")
async def vs_type_conf():
    return kb_service.vs_type_conf()


async def _read_json(request: Request) -> dict[str, Any]:
    try:
        body = await request.body()
        if not body:
            return {}
        text = body.decode("utf-8")
        data = json.loads(text)
        if isinstance(data, str):
            data = json.loads(data)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}
