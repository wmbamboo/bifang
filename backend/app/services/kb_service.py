from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any, Optional

import jieba
import numpy as np
from rank_bm25 import BM25Okapi

from app.config import get_settings
from app.db import get_conn, ok, fail, rows_to_list, _now
from app.services.document_loader import load_file_text, split_text
from app.services.embeddings import embed_query, embed_texts


def tokenize(text: str) -> list[str]:
    return [t.strip() for t in jieba.lcut(text or "") if t.strip()]


class HybridStore:
    """向量检索（FAISS） + BM25 混合检索。"""

    def __init__(self, docs: list[dict] | None = None, embeddings: np.ndarray | None = None):
        self.docs: list[dict] = docs or []
        self.embeddings: Optional[np.ndarray] = embeddings
        self._bm25: BM25Okapi | None = None
        self._faiss = None
        self._rebuild_bm25()
        self._rebuild_faiss()

    def _rebuild_bm25(self):
        tokens = [tokenize(d.get("page_content", "")) for d in self.docs]
        self._bm25 = BM25Okapi(tokens) if tokens else None

    def _rebuild_faiss(self):
        self._faiss = None
        if self.embeddings is None or len(self.docs) == 0:
            return
        if len(self.embeddings) != len(self.docs):
            return
        try:
            import faiss

            dim = int(self.embeddings.shape[1])
            index = faiss.IndexFlatIP(dim)
            vectors = np.asarray(self.embeddings, dtype=np.float32)
            # 已 normalize，内积≈余弦相似度
            index.add(vectors)
            self._faiss = index
        except Exception as e:  # noqa: BLE001
            print(f"[warn] faiss rebuild failed: {e}")

    def clear(self):
        self.docs = []
        self.embeddings = None
        self._bm25 = None
        self._faiss = None

    def delete_by_source(self, source: str):
        if not self.docs:
            return
        keep_idx = [i for i, d in enumerate(self.docs) if d.get("metadata", {}).get("source") != source]
        self.docs = [self.docs[i] for i in keep_idx]
        if self.embeddings is not None and len(self.embeddings):
            self.embeddings = self.embeddings[keep_idx] if keep_idx else None
        else:
            self.embeddings = None
        self._rebuild_bm25()
        self._rebuild_faiss()

    def add(self, chunks: list[str], metadatas: list[dict], vectors: list[list[float]]):
        for c, m in zip(chunks, metadatas):
            self.docs.append({"page_content": c, "metadata": m})
        arr = np.asarray(vectors, dtype=np.float32)
        if self.embeddings is None or len(self.embeddings) == 0:
            self.embeddings = arr
        else:
            self.embeddings = np.vstack([self.embeddings, arr])
        self._rebuild_bm25()
        self._rebuild_faiss()

    def _vector_search(self, query: str, top_k: int) -> list[dict]:
        if self._faiss is None or not self.docs:
            return []
        q = np.asarray([embed_query(query)], dtype=np.float32)
        scores, idxs = self._faiss.search(q, min(top_k, len(self.docs)))
        results = []
        for score, idx in zip(scores[0], idxs[0]):
            if idx < 0:
                continue
            d = self.docs[int(idx)]
            cos = float(score)
            results.append(
                {
                    "id": f"{d.get('metadata', {}).get('source', '')}-{idx}",
                    "page_content": d.get("page_content", ""),
                    "metadata": dict(d.get("metadata") or {}),
                    "score": round(cos, 4),
                    "vector_score": round(cos, 4),
                    "bm25_score": 0.0,
                    "retriever": "vector",
                }
            )
        return results

    def _bm25_search(self, query: str, top_k: int) -> list[dict]:
        if not self._bm25 or not self.docs:
            return []
        scores = self._bm25.get_scores(tokenize(query))
        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:top_k]
        max_score = max((s for _, s in ranked), default=1.0) or 1.0
        results = []
        for idx, score in ranked:
            d = self.docs[idx]
            norm = float(score) / float(max_score) if max_score else 0.0
            results.append(
                {
                    "id": f"{d.get('metadata', {}).get('source', '')}-{idx}",
                    "page_content": d.get("page_content", ""),
                    "metadata": dict(d.get("metadata") or {}),
                    "score": round(norm, 4),
                    "vector_score": 0.0,
                    "bm25_score": round(norm, 4),
                    "retriever": "bm25",
                }
            )
        return results

    @staticmethod
    def _rrf_fuse(result_lists: list[list[dict]], top_k: int, k: int = 60) -> list[dict]:
        fused: dict[str, dict] = {}
        for results in result_lists:
            for rank, item in enumerate(results):
                key = item["id"]
                if key not in fused:
                    fused[key] = {
                        **item,
                        "rrf_score": 0.0,
                        "vector_score": float(item.get("vector_score") or 0.0),
                        "bm25_score": float(item.get("bm25_score") or 0.0),
                    }
                fused[key]["rrf_score"] += 1.0 / (k + rank + 1)
                fused[key]["vector_score"] = max(
                    float(fused[key].get("vector_score") or 0.0),
                    float(item.get("vector_score") or 0.0),
                )
                fused[key]["bm25_score"] = max(
                    float(fused[key].get("bm25_score") or 0.0),
                    float(item.get("bm25_score") or 0.0),
                )
                fused[key]["metadata"] = item.get("metadata") or fused[key].get("metadata")
                fused[key]["page_content"] = item.get("page_content") or fused[key].get("page_content")
        ranked = sorted(
            fused.values(),
            # 混合排序：语义相似度为主，关键词为辅，RRF 作微调
            key=lambda x: (
                0.7 * float(x.get("vector_score") or 0.0)
                + 0.25 * float(x.get("bm25_score") or 0.0)
                + 0.05 * float(x.get("rrf_score") or 0.0)
            ),
            reverse=True,
        )
        for item in ranked:
            blend = (
                0.7 * float(item.get("vector_score") or 0.0)
                + 0.25 * float(item.get("bm25_score") or 0.0)
                + 0.05 * float(item.get("rrf_score") or 0.0)
            )
            item["score"] = round(blend, 4)
            item["retriever"] = "hybrid"
        return ranked[:top_k]

    def search(
        self,
        query: str,
        top_k: int = 5,
        score_threshold: float = 0.0,
        mode: str = "hybrid",
    ) -> list[dict]:
        mode = (mode or "hybrid").lower()
        if mode == "bm25":
            results = self._bm25_search(query, top_k * 3)
        elif mode == "vector":
            results = self._vector_search(query, top_k * 3)
        else:
            v = self._vector_search(query, top_k * 3)
            b = self._bm25_search(query, top_k * 3)
            results = self._rrf_fuse([v, b], top_k=top_k * 3)

        if score_threshold > 0:
            # 用向量余弦做门槛。混合分里的 BM25 按本次最高分归一化，无关查询的第一名也会变成 1，不能用来判断「像不像」。
            if mode == "bm25":
                results = [r for r in results if float(r.get("score") or 0) >= score_threshold]
            else:
                results = [r for r in results if float(r.get("vector_score") or 0) >= score_threshold]
        return results[:top_k]

    def save(self, base_path: Path):
        base_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path = base_path.with_suffix(".json")
        emb_path = base_path.with_suffix(".npy")
        meta_path.write_text(json.dumps({"docs": self.docs}, ensure_ascii=False), encoding="utf-8")
        if self.embeddings is not None and len(self.embeddings):
            np.save(str(emb_path), np.asarray(self.embeddings, dtype=np.float32))
        elif emb_path.exists():
            emb_path.unlink()

    @classmethod
    def load(cls, base_path: Path) -> "HybridStore":
        meta_path = base_path.with_suffix(".json")
        emb_path = base_path.with_suffix(".npy")
        # 兼容旧 BM25 单文件 vector_store.json
        legacy = base_path.parent / "vector_store.json"
        if not meta_path.exists() and legacy.exists():
            data = json.loads(legacy.read_text(encoding="utf-8"))
            return cls(data.get("docs") or [], None)
        if not meta_path.exists():
            return cls([])
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        embeddings = np.load(str(emb_path)) if emb_path.exists() else None
        return cls(data.get("docs") or [], embeddings)


_stores: dict[str, HybridStore] = {}


def kb_content_dir(kb_name: str) -> Path:
    path = get_settings().kb_root / kb_name / "content"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _index_base(kb_name: str) -> Path:
    return get_settings().kb_root / kb_name / "vector_index"


def get_store(kb_name: str) -> HybridStore:
    if kb_name not in _stores:
        _stores[kb_name] = HybridStore.load(_index_base(kb_name))
    return _stores[kb_name]


def save_store(kb_name: str):
    get_store(kb_name).save(_index_base(kb_name))


def list_knowledge_bases() -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT kb.id, kb.kb_name, kb.kb_info, kb.vs_type, kb.embed_model, kb.create_time,
                   (SELECT COUNT(*) FROM kb_files f WHERE f.kb_name = kb.kb_name) AS file_count
            FROM knowledge_bases kb
            ORDER BY kb.id
            """
        ).fetchall()
    return ok(rows_to_list(rows))


def create_knowledge_base(
    knowledge_base_name: str,
    kb_info: str = "",
    vector_store_type: str = "faiss",
    embed_model: str = "",
) -> dict:
    if not knowledge_base_name:
        return fail("知识库名称不能为空", 400)
    settings = get_settings()
    embed_model = embed_model or settings.embedding_model
    vs_type = vector_store_type or "faiss"
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT 1 FROM knowledge_bases WHERE kb_name=?", (knowledge_base_name,)
        ).fetchone()
        if exists:
            return fail(f"知识库已存在: {knowledge_base_name}", 400)
        conn.execute(
            """
            INSERT INTO knowledge_bases (kb_name, kb_info, vs_type, embed_model, create_time)
            VALUES (?, ?, ?, ?, ?)
            """,
            (knowledge_base_name, kb_info or "", vs_type, embed_model, _now()),
        )
    kb_content_dir(knowledge_base_name)
    _stores[knowledge_base_name] = HybridStore([])
    save_store(knowledge_base_name)
    return ok(msg=f"已创建知识库 {knowledge_base_name}")


def update_kb_info(knowledge_base_name: str, kb_info: str = "", **kwargs) -> dict:
    with get_conn() as conn:
        conn.execute(
            "UPDATE knowledge_bases SET kb_info=? WHERE kb_name=?",
            (kb_info, knowledge_base_name),
        )
    return ok(msg="更新成功")


def delete_knowledge_base(knowledge_base_name: str) -> dict:
    if not knowledge_base_name:
        return fail("知识库名称不能为空", 400)
    with get_conn() as conn:
        conn.execute("DELETE FROM knowledge_bases WHERE kb_name=?", (knowledge_base_name,))
        conn.execute("DELETE FROM kb_files WHERE kb_name=?", (knowledge_base_name,))
    _stores.pop(knowledge_base_name, None)
    kb_dir = get_settings().kb_root / knowledge_base_name
    if kb_dir.exists():
        shutil.rmtree(kb_dir, ignore_errors=True)
    return ok(msg=f"已删除知识库 {knowledge_base_name}")


def list_files(knowledge_base_name: str, query: str = "") -> dict:
    sql = "SELECT * FROM kb_files WHERE kb_name=?"
    params: list[Any] = [knowledge_base_name]
    if query:
        sql += " AND file_name LIKE ?"
        params.append(f"%{query}%")
    sql += " ORDER BY id DESC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    data = []
    for r in rows_to_list(rows):
        data.append(
            {
                "id": str(r["id"]),
                "kb_name": r["kb_name"],
                "file_name": r["file_name"],
                "file_ext": r["file_ext"],
                "file_size": str(r["file_size"]),
                "file_mtime": r["file_mtime"],
                "docs_count": r["docs_count"],
                "in_folder": bool(r["in_folder"]),
                "in_db": bool(r["in_db"]),
                "create_time": r["create_time"],
                "document_loader": "AutoLoader",
                "text_splitter": "RecursiveCharacter",
            }
        )
    return ok(data)


def save_uploaded_files(
    knowledge_base_name: str,
    files: list[tuple[str, bytes]],
    override: bool = True,
) -> dict:
    content_dir = kb_content_dir(knowledge_base_name)
    failed = {}
    for filename, content in files:
        try:
            target = content_dir / filename
            if target.exists() and not override:
                failed[filename] = "文件已存在"
                continue
            target.write_bytes(content)
            with get_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO kb_files
                    (kb_name, file_name, file_ext, file_size, file_mtime, docs_count, in_folder, in_db, create_time)
                    VALUES (?, ?, ?, ?, ?, 0, 1, 0, ?)
                    ON CONFLICT(kb_name, file_name) DO UPDATE SET
                        file_size=excluded.file_size,
                        file_mtime=excluded.file_mtime,
                        in_folder=1,
                        in_db=0,
                        create_time=excluded.create_time
                    """,
                    (
                        knowledge_base_name,
                        filename,
                        Path(filename).suffix,
                        len(content),
                        target.stat().st_mtime,
                        _now(),
                    ),
                )
        except Exception as e:  # noqa: BLE001
            failed[filename] = str(e)
    return ok({"failed_files": failed}, msg="文件上传完成")


def vectorize_files(
    knowledge_base_name: str,
    file_names: Optional[list[str]] = None,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
) -> dict:
    settings = get_settings()
    chunk_size = chunk_size or settings.chunk_size
    chunk_overlap = chunk_overlap or settings.chunk_overlap
    content_dir = kb_content_dir(knowledge_base_name)
    store = get_store(knowledge_base_name)

    with get_conn() as conn:
        if file_names:
            placeholders = ",".join("?" * len(file_names))
            rows = conn.execute(
                f"SELECT file_name FROM kb_files WHERE kb_name=? AND file_name IN ({placeholders})",
                [knowledge_base_name, *file_names],
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT file_name FROM kb_files WHERE kb_name=?",
                (knowledge_base_name,),
            ).fetchall()
        names = [r["file_name"] for r in rows]

    failed_files: dict[str, str] = {}
    for name in names:
        path = content_dir / name
        if not path.exists():
            failed_files[name] = "文件不存在"
            continue
        try:
            store.delete_by_source(name)
            text = load_file_text(path, enable_ocr=settings.ocr_enabled)
            chunks = split_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
            if not chunks:
                failed_files[name] = "未能解析出文本内容（含OCR）"
                continue
            vectors = embed_texts(chunks)
            metadatas = [
                {"source": name, "kb_name": knowledge_base_name, "chunk": i}
                for i in range(len(chunks))
            ]
            store.add(chunks, metadatas, vectors)
            with get_conn() as conn:
                conn.execute(
                    "UPDATE kb_files SET in_db=1, docs_count=? WHERE kb_name=? AND file_name=?",
                    (len(chunks), knowledge_base_name, name),
                )
        except Exception as e:  # noqa: BLE001
            failed_files[name] = str(e)

    save_store(knowledge_base_name)
    return ok({"failed_files": failed_files}, msg="向量化完成")


def delete_docs(knowledge_base_name: str, file_names: list[str], delete_content: bool = True) -> dict:
    store = get_store(knowledge_base_name)
    content_dir = kb_content_dir(knowledge_base_name)
    for name in file_names:
        store.delete_by_source(name)
        with get_conn() as conn:
            conn.execute(
                "DELETE FROM kb_files WHERE kb_name=? AND file_name=?",
                (knowledge_base_name, name),
            )
        if delete_content:
            path = content_dir / name
            if path.exists():
                path.unlink()
    save_store(knowledge_base_name)
    return ok(msg="删除成功")


def recreate_vector_store(
    knowledge_base_name: str,
    chunk_size: int = 750,
    chunk_overlap: int = 150,
    **kwargs,
) -> dict:
    store = HybridStore([])
    _stores[knowledge_base_name] = store
    save_store(knowledge_base_name)
    with get_conn() as conn:
        conn.execute("UPDATE kb_files SET in_db=0, docs_count=0 WHERE kb_name=?", (knowledge_base_name,))
    return vectorize_files(
        knowledge_base_name,
        file_names=None,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def search_docs(
    query: str,
    knowledge_base_name: str,
    top_k: int = 10,
    score_threshold: float = 0.0,
    mode: Optional[str] = None,
) -> list[dict]:
    if not query:
        return []
    settings = get_settings()
    store = get_store(knowledge_base_name)
    # 若仅有旧 BM25 docs 没有向量，自动降级/或补齐向量
    if store.docs and (store.embeddings is None or len(store.embeddings) != len(store.docs)):
        try:
            texts = [d.get("page_content", "") for d in store.docs]
            store.embeddings = np.asarray(embed_texts(texts), dtype=np.float32)
            store._rebuild_faiss()
            save_store(knowledge_base_name)
        except Exception as e:  # noqa: BLE001
            print(f"[warn] auto embedding refresh failed: {e}")
    docs = store.search(
        query,
        top_k=top_k,
        score_threshold=score_threshold,
        mode=(mode or settings.retrieval_mode),
    )
    for d in docs:
        d.setdefault("metadata", {})["kb_name"] = knowledge_base_name
    return docs


ALL_KB_NAME = "__all__"


def search_cross_kb_docs(
    query: str,
    kb_names: list[str],
    top_k: int = 10,
    score_threshold: float = 0.0,
    mode: Optional[str] = None,
) -> list[dict]:
    # 未指定知识库时检索全部库（前端「全部」）
    names = [n for n in (kb_names or []) if n]
    if not names:
        listed = list_knowledge_bases()
        names = [kb.get("kb_name") for kb in (listed.get("data") or []) if kb.get("kb_name")]
    all_docs: list[dict] = []
    for kb in names:
        all_docs.extend(
            search_docs(query, kb, top_k=top_k, score_threshold=score_threshold, mode=mode)
        )
    all_docs.sort(
        key=lambda x: (
            float(x.get("vector_score") or 0.0),
            float(x.get("score") or 0.0),
            float(x.get("bm25_score") or 0.0),
        ),
        reverse=True,
    )
    return all_docs[:top_k]


def _clean_ocr_for_prompt(text: str) -> str:
    """切块常见错字。只改确定的误写，避免模型把错字抄进大纲。"""
    return (
        (text or "")
        .replace("种拔", "种草")
        .replace("收拔", "收割")
    )


def format_docs_for_prompt(docs: list[dict]) -> tuple[str, list[dict]]:
    contexts = []
    ref_docs = []
    for i, d in enumerate(docs, start=1):
        meta = d.get("metadata") or {}
        source = meta.get("source", "未知文档")
        kb_name = meta.get("kb_name", "")
        chunk_id = meta.get("chunk")
        content = _clean_ocr_for_prompt(d.get("page_content", ""))
        link = f"/knowledge_base/download_doc?knowledge_base_name={kb_name}&file_name={source}"
        snippet = " ".join((content or "").split())[:160]
        loc = f" 片段{chunk_id}" if chunk_id is not None else ""
        contexts.append(f"[文档{i}] 来源：{source}{loc}\n{content}")
        ref_docs.append(
            {
                "id": i,
                "title": source,
                "source": source,
                "kb_name": kb_name,
                "chunk_id": chunk_id,
                "snippet": snippet,
                "content": content,
                "link": link,
                "score": d.get("score"),
                # 兼容旧前端字符串解析
                "text": f"出处 [{i}] [{source}]({link})\n\n{content}",
            }
        )
    return "\n\n".join(contexts), ref_docs


_QUOTE_RE = re.compile(r"[「『“\"]([^」』”\"]{2,16})[」』”\"]")
_OUTLINE_RE = re.compile(r"撰写\s*(?:Ppt|PPT|ppt|一篇文章|文章)?\s*大纲")
_NAME_STOP = {
    "可以", "需要", "进行", "通过", "对于", "关于", "这个", "那个", "如何", "怎样",
    "具体", "内容", "方法", "打法", "要点", "判断", "以及", "其中", "分别", "包括",
    "一种", "两种", "三种", "以下", "如下", "主要", "相关", "根据", "知识库",
}


def _clean_query(text: str, limit: int = 80) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()[:limit]


def _add_name(names: list[str], term: str) -> None:
    term = (term or "").strip()
    if 2 <= len(term) <= 8 and term not in _NAME_STOP and term not in names:
        names.append(term)


def _quoted_and_enum_names(text: str) -> list[str]:
    """抽出引号专名，以及顿号、并列「和」两侧的短专名。"""
    names: list[str] = []
    for raw in _QUOTE_RE.findall(text or ""):
        _add_name(names, raw)
    normalized = text or ""
    previous = None
    while normalized != previous:
        previous = normalized
        normalized = re.sub(
            r"([\u4e00-\u9fff]{2,6})(?:和|与|及)([\u4e00-\u9fff]{2,6})",
            r"\1、\2",
            normalized,
        )
    if "、" not in normalized:
        return names
    for part in normalized.split("、"):
        part = re.sub(r"[^\u4e00-\u9fff：:]+$", "", part.strip())
        if "：" in part or ":" in part:
            part = re.split(r"[：:]", part)[-1]
        matched = re.search(r"([\u4e00-\u9fff]{2,4})$", part)
        if not matched:
            continue
        prefix = re.sub(r"[^\u4e00-\u9fff]", "", part[: matched.start()])
        if len(prefix) > 4:
            continue
        _add_name(names, matched.group(1))
    return names


def plan_writing_retrieval(user_text: str) -> tuple[str, str, list[str]]:
    """从用户消息里抽出检索任务、主查询和第二跳查询。

    大纲用主题，不用整段格式说明；本页写作用标题加各条要点。
    问答保持原问题，不做第二跳。
    """
    text = user_text or ""
    if _OUTLINE_RE.search(text):
        topic = ""
        matched = re.search(r"主题是【([^】]{2,80})】", text)
        if matched:
            topic = matched.group(1).strip()
        return "outline", topic or _clean_query(text), []

    if "【本页标题】" in text or "【大纲要点】" in text:
        title = ""
        matched = re.search(r"【本页标题】\s*([^\n【]{2,80})", text)
        if matched:
            title = matched.group(1).strip()
        points: list[str] = []
        block = re.search(r"【大纲要点】\s*(.*?)(?=\n【|\Z)", text, re.S)
        if block:
            for line in block.group(1).splitlines():
                line = re.sub(r"^[\d\.\)）、\-\*\s]+", "", line.strip())
                if not line or line.startswith("（"):
                    continue
                points.append(_clean_query(line, 40))
        extras = [p for p in points if p and p != title][:5]
        return "slide", title or (extras[0] if extras else _clean_query(text)), extras

    if "文章标题是" in text and "撰写大约" in text:
        para = ""
        matched = re.search(r"\[([^\]]{2,80})\]", text)
        if matched:
            para = matched.group(1).strip()
        chapter = ""
        matched = re.search(r"【([^】]{2,40})】章节", text)
        if matched:
            chapter = matched.group(1).strip()
        extras = [chapter] if chapter and chapter != para else []
        return "paragraph", para or chapter or _clean_query(text), extras

    return "general", _clean_query(text, 200), []


def _doc_key(doc: dict) -> str:
    meta = doc.get("metadata") or {}
    head = (doc.get("page_content") or "")[:48]
    return f"{meta.get('kb_name')}|{meta.get('source')}|{meta.get('chunk')}|{head}"


def _neighbor_docs(doc: dict, *, previous: bool = False) -> list[dict]:
    """同一文件里紧挨着的下一段。上一段多半是上一节的尾巴，大纲里会串章，默认不取。"""
    meta = doc.get("metadata") or {}
    source = meta.get("source")
    kb = meta.get("kb_name")
    try:
        chunk = int(meta.get("chunk"))
    except (TypeError, ValueError):
        return []
    if not source or not kb or kb == ALL_KB_NAME:
        return []
    wanted = {chunk + 1}
    if previous:
        wanted.add(chunk - 1)
    parent_score = float(doc.get("vector_score") or 0.0)
    out: list[dict] = []
    for item in get_store(kb).docs:
        item_meta = item.get("metadata") or {}
        if item_meta.get("source") != source:
            continue
        try:
            item_chunk = int(item_meta.get("chunk"))
        except (TypeError, ValueError):
            continue
        if item_chunk not in wanted:
            continue
        copied = dict(item_meta)
        copied["kb_name"] = kb
        out.append(
            {
                "page_content": item.get("page_content", ""),
                "metadata": copied,
                "score": doc.get("score"),
                "vector_score": parent_score,
            }
        )
    return out


def retrieve_for_writing(
    user_text: str,
    knowledge_base_name: str,
    top_k: int = 4,
    score_threshold: float = 0.0,
    mode: Optional[str] = None,
) -> tuple[list[dict], str]:
    """先按主题或本页要点检索，再对专名做第二跳，合并去重。"""
    task, primary, extras = plan_writing_retrieval(user_text)
    if not primary:
        primary = _clean_query(user_text, 200)
    all_kb = knowledge_base_name == ALL_KB_NAME

    def _search(query: str, k: int, threshold: Optional[float] = None, search_mode: Optional[str] = None) -> list[dict]:
        if not query:
            return []
        used_threshold = score_threshold if threshold is None else threshold
        used_mode = search_mode or mode
        if all_kb:
            return search_cross_kb_docs(
                query, [], top_k=k, score_threshold=used_threshold, mode=used_mode
            )
        return search_docs(
            query,
            knowledge_base_name,
            top_k=k,
            score_threshold=used_threshold,
            mode=used_mode,
        )

    # 问答保持原来的混合检索。大纲和正文改用向量前若干条：
    # 混合排序会把封面、爆款标题页顶上来，真正写到做法的片段虽然余弦过线，也会掉出前几名。
    if task not in ("outline", "slide", "paragraph"):
        return _search(primary, top_k), task

    settings = get_settings()
    first = _search(
        primary,
        settings.writing_vector_top_k,
        threshold=settings.default_score_threshold,
        search_mode="vector",
    )
    per_doc_quotes: list[list[str]] = []
    enums: list[str] = []
    for doc in first:
        text = doc.get("page_content") or ""
        names: list[str] = []
        for raw in _QUOTE_RE.findall(text):
            _add_name(names, raw)
        per_doc_quotes.append(names)
        for name in _quoted_and_enum_names(text):
            if name not in names:
                _add_name(enums, name)
    quoted: list[str] = []
    # 从相似度靠后的片段先取引号专名。靠前的往往是封面和爆款标题，会把「高举高打」这类名字挤出名额。
    quote_per_chunk = settings.writing_quote_per_chunk
    name_limit = settings.writing_name_limit
    for names in reversed(per_doc_quotes):
        for name in names[:quote_per_chunk]:
            _add_name(quoted, name)
            if len(quoted) >= name_limit:
                break
        if len(quoted) >= name_limit:
            break
    for name in _quoted_and_enum_names(user_text):
        if name not in quoted:
            _add_name(enums, name)
    for extra in extras:
        _add_name(enums, extra)
    uniq = [term for term in quoted + enums if term and term != primary][:name_limit]

    hops: list[dict] = []
    neighbors: list[dict] = []
    for term in uniq:
        for doc in _search(
            term,
            settings.writing_name_top_k,
            threshold=settings.writing_name_score_threshold,
            search_mode="vector",
        ):
            if term not in (doc.get("page_content") or ""):
                continue
            hops.append(doc)
            neighbors.extend(_neighbor_docs(doc))
            break

    merged: list[dict] = []
    seen: set[str] = set()

    def _push(doc: dict) -> None:
        key = _doc_key(doc)
        if key in seen:
            return
        seen.add(key)
        merged.append(doc)

    for doc in hops:
        _push(doc)
    for doc in neighbors:
        _push(doc)
    for doc in first:
        _push(doc)
    return merged[: settings.writing_context_limit], task


_TASK_SUMMARY = {
    "outline": (
        "【大纲摘要】\n"
        "每条要点必须是检索结果中的一条事实（做法、适用条件、数据或案例），"
        "不要写「有几种方法」「可据此判断」这类没有内容的句子。\n"
        "检索结果用顿号或引号列出多个专名时，能放进 5 条就每个专名单独成条，并把其他片段里已有的解释合并进来；"
        "条款超过 5 条时，重新摘要进这 3～5 条，不要另起第 6 条，也不要只截取原文前几条。没有解释就不要用空话凑条数。\n"
        "每页要点必须且只能是 3～5 条，禁止第 6 条。\n"
        "本页标题必须窄于全文标题，写成这一页要回答的问题。\n"
        "材料不够就少写几条，不要为了凑满条数编造。\n"
        "章节边界：一个章节只写报告里的一节。片段开头或结尾常常粘着上一节或下一节"
        "（另一个品牌案例、带编号的下一节标题）。这些内容不要并进当前章节；与本章标题无关的，另立章节或不要写。\n"
        "归属：出现「情境 / 打法 / 案例」时，打法下面的动作属于该情境中的品牌，写在该打法页里，"
        "不要再拆成一套通用步骤，也不要改挂到旁边的小节标题上。"
        "紧挨总述的「背景」「机会」属于总述，不要安到前面那个案例标题下。\n"
        "引用：一条要点只标它实际所在的文档编号，不要整页共用同一个编号。\n"
    ),
    "slide": (
        "【本页摘要】\n"
        "合并全部检索片段来写，不要只复述总述段。\n"
        "大纲要点里的专名，若其他片段有定义、做法或案例，必须写进对应小点。\n"
        "一条大纲要点只对应一个小点，不要拆开，也不要另起没有依据的小点。\n"
    ),
    "paragraph": (
        "【段落摘要】\n"
        "合并全部检索片段，把相关定义、做法和案例写进正文，不要只复述总述。\n"
        "检索没有依据的句子不要写。\n"
    ),
}


def build_rag_system_prompt(
    docs: list[dict],
    prompt_name: str = "default",
    task: str = "general",
) -> str:
    context, _ = format_docs_for_prompt(docs)
    if not context:
        return (
            "你是毕方智能知识管理助手。当前知识库中没有检索到相关内容。"
            "请明确说明无法从知识库得到答案，不要基于通用知识编造数据、案例或结论；"
            "不要以「根据知识库内容」等套话开头。"
        )
    summary = _TASK_SUMMARY.get(task, "")
    tail = f"\n\n{summary}" if summary else ""
    return (
        "你是毕方智能知识管理助手。请严格依据下列知识库内容回答用户问题或完成撰写任务。\n"
        "写作约束：只使用下列检索结果中的信息；不得用检索外的常识补全或编造数字/案例/结论；"
        "检索不足以支撑时请明确写「知识库未提供依据」，不要臆造。\n"
        "不同片段可能分别给出总述和定义，撰写时要合并使用，不要只复述第一条。\n"
        "输出要求：直接给出可用的正文/答案，不要以「根据知识库内容」「根据资料」「根据检索结果」"
        "「基于知识库」等套话或元说明开头；不要复述「我将根据知识库…」这类过程描述。\n"
        "引用规范：在对应句子末尾使用方括号编号引用，例如 [1] 或 [2][3]，"
        "不要写「(文档1)」这类文字；不要编造未提供的文档编号。\n"
        "如果知识库不足以回答，请明确说明无法从知识库得到答案。\n\n"
        f"知识库检索结果：\n{context}{tail}"
    )


def vs_type_conf() -> dict:
    return ok({"vs_types": ["faiss"], "def_vs_type": "faiss"})


def get_file_path(knowledge_base_name: str, file_name: str) -> Path:
    return kb_content_dir(knowledge_base_name) / file_name
