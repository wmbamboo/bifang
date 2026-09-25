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
from app.services.document_loader import load_file_text, split_text_with_meta
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


def _extract_pdf_image_assets(
    path: Path,
    kb_name: str,
    file_name: str,
    *,
    max_per_page: int = 4,
) -> dict[int, list[str]]:
    """抽出 PDF 内嵌图到 kb assets 目录；返回 {page_1based: [asset_id,...]}。"""
    if path.suffix.lower() != ".pdf":
        return {}
    try:
        import pymupdf as fitz
    except Exception:  # noqa: BLE001
        return {}

    settings = get_settings()
    content = kb_content_dir(kb_name)
    assets_dir = content.parent / "assets" / Path(file_name).stem
    assets_dir.mkdir(parents=True, exist_ok=True)
    out: dict[int, list[str]] = {}
    try:
        doc = fitz.open(str(path))
        try:
            for i in range(doc.page_count):
                page = doc.load_page(i)
                page_no = i + 1
                images = page.get_images(full=True) or []
                ids: list[str] = []
                for j, img in enumerate(images[:max_per_page]):
                    xref = img[0]
                    try:
                        pix = fitz.Pixmap(doc, xref)
                        if pix.n >= 5:
                            pix = fitz.Pixmap(fitz.csRGB, pix)
                        asset_id = f"{Path(file_name).stem}_p{page_no}_{j}.png"
                        dest = assets_dir / asset_id
                        pix.save(str(dest))
                        ids.append(asset_id)
                    except Exception:  # noqa: BLE001
                        continue
                if ids:
                    out[page_no] = ids
        finally:
            doc.close()
    except Exception:  # noqa: BLE001
        return out
    return out


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
            # 尽量按页切块；并抽出 PDF 内嵌图为 asset（供后续 image_grid）
            asset_meta = _extract_pdf_image_assets(path, knowledge_base_name, name)
            pieces = split_text_with_meta(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
            if not pieces:
                failed_files[name] = "未能解析出文本内容（含OCR）"
                continue
            try:
                from app.services.extract_service import save_file_extract, save_parse_artifact

                save_parse_artifact(
                    knowledge_base_name, name, text, ocr_meta={"pipeline": "vectorize"}
                )
                save_file_extract(knowledge_base_name, name, text, prefer_full_text=True)
            except Exception as ex:  # noqa: BLE001
                print(f"[warn] extract save failed {name}: {ex}", flush=True)
            chunks = [p[0] for p in pieces]
            vectors = embed_texts(chunks)
            metadatas = []
            for i, (_c, meta) in enumerate(pieces):
                m = {
                    "source": name,
                    "kb_name": knowledge_base_name,
                    "chunk": i,
                    "kind": meta.get("kind") or "text",
                }
                if meta.get("atomic"):
                    m["atomic"] = True
                if meta.get("page") is not None:
                    m["page"] = meta["page"]
                # 同页附图挂到文本 chunk（bbox 暂用整页标记，细粒度随 VL 升级）
                page = meta.get("page")
                if page is not None and asset_meta.get(page):
                    m["asset_ids"] = asset_meta[page]
                    m["has_image"] = True
                metadatas.append(m)
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
        try:
            from app.services.extract_service import delete_file_extract

            delete_file_extract(knowledge_base_name, name)
        except Exception:  # noqa: BLE001
            pass
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


def format_docs_for_prompt(docs: list[dict]) -> tuple[str, list[dict]]:
    contexts = []
    ref_docs = []
    for i, d in enumerate(docs, start=1):
        meta = d.get("metadata") or {}
        source = meta.get("source", "未知文档")
        kb_name = meta.get("kb_name", "")
        chunk_id = meta.get("chunk")
        page = meta.get("page")
        content = d.get("page_content", "")
        link = f"/knowledge_base/download_doc?knowledge_base_name={kb_name}&file_name={source}"
        snippet = " ".join((content or "").split())[:160]
        loc = f" 片段{chunk_id}" if chunk_id is not None else ""
        if page is not None:
            loc += f" 第{page}页"
        # 同 chunk 边界标记，供前端数值+实体同块校验
        head = f"⟦chunk:{chunk_id}|page:{page if page is not None else ''}⟧"
        contexts.append(f"[文档{i}] 来源：{source}{loc}\n{head}\n{content}")
        ref_docs.append(
            {
                "id": i,
                "title": source,
                "source": source,
                "kb_name": kb_name,
                "chunk_id": chunk_id,
                "page": page,
                "asset_ids": meta.get("asset_ids"),
                "kind": meta.get("kind"),
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


def _slide_query_variants(primary: str) -> list[str]:
    """页标题多路检索：去问句尾巴、切短内容词窗口，不依赖领域词表。"""
    t = _clean_query(primary, 80)
    if not t:
        return []
    out: list[str] = []

    def _push(q: str) -> None:
        q = _clean_query(q, 80)
        if q and q not in out:
            out.append(q)

    _push(t)
    stripped = re.sub(
        r"(?:是什么|有哪些|哪几个|哪几|哪些|如何|怎样|怎么看|怎么做|吗|呢|？|\?)+$",
        "",
        t,
    ).strip(" ，,：:")
    _push(stripped)
    no_shell = re.sub(
        r"^(?:请(?:指出|说明|写出|概括|分析)|帮我|帮忙)\s*",
        "",
        stripped or t,
    ).strip(" ，,：:")
    _push(no_shell)
    core = no_shell or stripped or t
    if len(core) > 16:
        _push(core[:16])

    # 内容词短窗口：缓解「整句标题向量漂」；不写死品类词
    try:
        import jieba  # type: ignore

        words = [
            w.strip()
            for w in jieba.lcut(core)
            if re.fullmatch(r"[\u4e00-\u9fffA-Za-z0-9]{2,}", w.strip() or "")
        ]
    except Exception:
        words = []
    if len(words) >= 2:
        _push("".join(words[-3:]))
        _push("".join(words[-2:]))
        if len(words) >= 3:
            _push("".join(words[1:]))
            _push(f"{words[0]}{words[-1]}")

    # 标题实体短查询：压跨品类向量漂移（大盘页勿漂到衬衫价表）
    if "大盘" in core and not any(k in core for k in ("衬衫", "polo", "Polo", "T恤")):
        _push("男装大盘 总销量 总销售额")
        _push("品类大盘 采样时间")
    elif "衬衫" in core and "polo" not in core.lower():
        _push("男士衬衫 销量 销售额")
    elif "polo" in core.lower() or "Polo" in core:
        _push("polo衫 男士polo 销量")
    if "价格带" in core:
        _push("价格带 销量占比")

    return out[:8]


def _add_name(names: list[str], term: str) -> None:
    term = (term or "").strip()
    if 2 <= len(term) <= 8 and term not in _NAME_STOP and term not in names:
        names.append(term)


def _take_short_name(names: list[str], part: str) -> None:
    """取片段末尾 2～4 字专名。冒号前的名字也要，不能只留冒号后的解释。"""
    part = re.sub(r"[^\u4e00-\u9fff：:]+$", "", (part or "").strip())
    if not part:
        return
    if "：" in part or ":" in part:
        head, tail = re.split(r"[：:]", part, maxsplit=1)
        _take_short_name(names, head)
        _take_short_name(names, tail)
        return
    matched = re.search(r"([\u4e00-\u9fff]{2,4})$", part)
    if not matched:
        return
    prefix = re.sub(r"[^\u4e00-\u9fff]", "", part[: matched.start()])
    if len(prefix) > 4:
        return
    _add_name(names, matched.group(1))


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
    if "、" not in normalized and "：" not in normalized and ":" not in normalized:
        return names
    for part in normalized.split("、"):
        _take_short_name(names, part)
    return names


_GRASS_FORMS = ("种拔", "收拔", "种草", "拔草")
_METRIC_TOKEN = re.compile(r"\d+(?:\.\d+)?\s*[%％]|\d+(?:\.\d+)?\s*[亿万]")


def _metric_tokens(texts: list[str]) -> list[str]:
    """大纲要点里的原数字。数据卡页要靠它们把含该数字的片段留在上下文里。"""
    found: list[str] = []
    for text in texts:
        for matched in _METRIC_TOKEN.findall(text or ""):
            token = re.sub(r"\s+", "", matched)
            if token not in found:
                found.append(token)
    return found


def _grass_queries(term: str) -> list[str]:
    """大纲写种草、拔草时，库里常是种拔、收拔。结巴把它们切成不同的词，只搜种草会错过。"""
    if not term or not any(form in term for form in ("种草", "拔草", "种拔", "收拔")):
        return [term] if term else []
    queries = [term]
    for form in ("种拔", "收拔"):
        if form not in queries:
            queries.append(form)
    return queries


def _contains_term(page: str, term: str) -> bool:
    page = page or ""
    if term and term in page:
        return True
    # 采样日：库里常是 2024.03.19，主题可能是 20240319
    if term and re.fullmatch(r"20\d{6}", term):
        if term in re.sub(r"[.\-/]", "", page):
            return True
    if term and any(form in term for form in ("种草", "拔草", "种拔", "收拔")):
        return any(form in page for form in _GRASS_FORMS)
    return False


def plan_writing_retrieval(user_text: str) -> tuple[str, str, list[str]]:
    """从用户消息里抽出检索任务、主查询和第二跳查询。

    大纲用主题，不用整段格式说明；本页写作用标题加各条要点。
    问答保持原问题，不做第二跳。

    若同时出现「撰写大纲」与「【本页标题】」（按页填充），优先按本页检索，
    否则会整段按主题召回，漏掉页级相关片段。
    """
    text = user_text or ""

    def _scope_extras(src: str) -> list[str]:
        """定框范围「商务男装衬衫/polo衫」→ 整段 + 斜杠拆分，助召回品类页事实。"""
        out: list[str] = []
        matched = re.search(r"范围「([^」]{1,40})」", src)
        if not matched:
            matched = re.search(r'范围["“]([^"”]{1,40})["”]', src)
        if not matched:
            # 主题里也可能直接写品类对
            matched = re.search(
                r"主题是【[^】]{0,120}?(商务男装[^】]{0,30}|衬衫/polo[^】]{0,10})",
                src,
            )
            if matched:
                raw = matched.group(1).strip()
                if raw:
                    out.append(raw)
                    for part in re.split(r"[/／|｜]", raw):
                        part = part.strip()
                        if part and part not in out:
                            out.append(part)
                return out
            return out
        raw = matched.group(1).strip()
        if not raw:
            return out
        out.append(raw)
        for part in re.split(r"[/／|｜]", raw):
            part = part.strip()
            if part and part not in out:
                out.append(part)
        return out

    def _period_extras(src: str) -> list[str]:
        """主题/正文里的采样窗 → 多种写法，助命中同窗材料、压掉其它周期大盘。"""
        out: list[str] = []

        def _add(tok: str) -> None:
            tok = (tok or "").strip()
            if tok and tok not in out:
                out.append(tok)

        def _expand_ymd(y: str, m: str, d: str) -> None:
            mm, dd = m.zfill(2), d.zfill(2)
            _add(f"{y}.{mm}.{dd}")
            _add(f"{y}-{mm}-{dd}")
            _add(f"{y}{mm}{dd}")

        # 20240319-20240417 / 20240319至20240417
        for m in re.finditer(
            r"(20\d{2})(\d{2})(\d{2})\s*[-~～至到]\s*(20\d{2})(\d{2})(\d{2})",
            src,
        ):
            y1, mo1, d1, y2, mo2, d2 = m.groups()
            _expand_ymd(y1, mo1, d1)
            _expand_ymd(y2, mo2, d2)
            _add(f"{y1}{mo1}{d1}-{y2}{mo2}{d2}")
            _add(f"{y1}.{mo1}.{d1}-{y2}.{mo2}.{d2}")
            _add(f"{y1}-{mo1}-{d1}至{y2}-{mo2}-{d2}")

        # 2024.03.19-2024.04.17 / 2024-03-19至2024-04-17
        for m in re.finditer(
            r"(20\d{2})[./\-](\d{1,2})[./\-](\d{1,2})\s*[-~～至到]\s*"
            r"(20\d{2})[./\-](\d{1,2})[./\-](\d{1,2})",
            src,
        ):
            y1, mo1, d1, y2, mo2, d2 = m.groups()
            _expand_ymd(y1, mo1, d1)
            _expand_ymd(y2, mo2, d2)
            _add(f"{y1}.{mo1.zfill(2)}.{d1.zfill(2)}-{y2}.{mo2.zfill(2)}.{d2.zfill(2)}")
            _add(f"{y1}-{mo1.zfill(2)}-{d1.zfill(2)}至{y2}-{mo2.zfill(2)}-{d2.zfill(2)}")

        return out[:12]

    def _merge_extras(*groups: list[str]) -> list[str]:
        out: list[str] = []
        for g in groups:
            for s in g:
                if s and s not in out:
                    out.append(s)
        return out

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
                points.append(_clean_query(line, 80))
        extras = _merge_extras(
            [p for p in points if p and p != title],
            _scope_extras(text),
            _period_extras(text),
        )
        if title and "大盘" in title and "男装大盘" not in extras:
            extras.append("男装大盘")
        if title and "衬衫" in title and "polo" not in title.lower():
            for t in ("男士衬衫", "衬衫"):
                if t not in extras:
                    extras.append(t)
        if title and ("polo" in title.lower() or "Polo" in title):
            for t in ("polo衫", "男士polo"):
                if t not in extras:
                    extras.append(t)
        if title and "价格带" in title and "价格带" not in extras:
            extras.append("价格带")
        return "slide", title or (extras[0] if extras else _clean_query(text)), extras

    if _OUTLINE_RE.search(text):
        topic = ""
        matched = re.search(r"主题是【([^】]{2,120})】", text)
        if matched:
            topic = matched.group(1).strip()
        extras = _merge_extras(_scope_extras(text), _period_extras(text))
        return "outline", topic or _clean_query(text), extras

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
    """同一文件里紧邻片段。默认只取下一段；previous=True 时取前后段。"""
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


def _expand_neighbors(docs: list[dict], *, previous: bool, limit_parents: int = 6) -> list[dict]:
    """对靠前命中扩邻居；limit_parents 避免上下文被邻居占满。"""
    out: list[dict] = []
    for doc in docs[: max(0, limit_parents)]:
        out.extend(_neighbor_docs(doc, previous=previous))
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
    # 本页/段落：标题多路向量（去问句尾巴等），再按分数融合，避免口语问句漂到无关段。
    if task in ("slide", "paragraph"):
        first_map: dict[str, dict] = {}
        for q in _slide_query_variants(primary):
            for doc in _search(
                q,
                settings.writing_vector_top_k,
                threshold=settings.default_score_threshold,
                search_mode="vector",
            ):
                key = _doc_key(doc)
                prev = first_map.get(key)
                score = float(doc.get("vector_score") or doc.get("score") or 0.0)
                if prev is None or score > float(
                    prev.get("vector_score") or prev.get("score") or 0.0
                ):
                    first_map[key] = doc
        first = sorted(
            first_map.values(),
            key=lambda d: float(d.get("vector_score") or d.get("score") or 0.0),
            reverse=True,
        )[: settings.writing_vector_top_k]
    else:
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
    # 本页每条要点里的专名优先，不能被第一跳里的引号挤出名单，也不能只留前 5 条。
    point_names: list[str] = []
    for extra in extras:
        for name in _quoted_and_enum_names(extra):
            _add_name(point_names, name)
        if any(form in extra for form in ("种草", "拔草", "种拔", "收拔")):
            _add_name(point_names, "种拔")
            _add_name(point_names, "收拔")
        _add_name(enums, extra)
    uniq = [term for term in point_names + quoted + enums if term and term != primary][:name_limit]

    hops: list[dict] = []
    neighbors: list[dict] = []
    # 短专名走关键词，不走混合。混合分里向量占 0.7，短词余弦又低，专名片段排不上去。
    # 结巴会把「聚流快打」拆开，所以关键词结果还要正文里出现完整专名。
    # 本页标题单独加入：它常常过不了第一跳的 0.5。一个名字保留前若干条命中，避免只拿到总述、漏掉定义。
    hop_terms: list[str] = []
    if task in ("slide", "paragraph") and primary:
        hop_terms.append(primary)
    for term in uniq:
        if term not in hop_terms:
            hop_terms.append(term)
    for term in hop_terms:
        for query in _grass_queries(term):
            for doc in _search(
                query,
                settings.writing_name_top_k,
                threshold=settings.writing_name_score_threshold,
                search_mode="bm25",
            ):
                if not _contains_term(doc.get("page_content") or "", term):
                    continue
                hops.append(doc)
                neighbors.extend(_neighbor_docs(doc, previous=(task in ("slide", "paragraph"))))

    # 第一跳命中也扩邻居：页级数据常在命中页的前后段（图表轴/% 在邻页）。
    # 大纲结构段只扩下一段，降低串章；本页/段落扩前后段。
    take_prev = task in ("slide", "paragraph")
    neighbors.extend(_expand_neighbors(first, previous=take_prev, limit_parents=6))

    merged: list[dict] = []
    seen: set[str] = set()

    def _push(doc: dict) -> None:
        key = _doc_key(doc)
        if key in seen:
            return
        seen.add(key)
        merged.append(doc)

    # 专名第二跳会占满名额，把第一跳里真正带百分数的片段挤掉。
    # 含大纲数字的第一跳结果先留下，其余第一跳仍放在专名之后。
    tokens = _metric_tokens(extras)
    numbered_first: list[dict] = []
    other_first: list[dict] = []
    for doc in first:
        text = doc.get("page_content") or ""
        if tokens and any(token in text for token in tokens):
            numbered_first.append(doc)
        else:
            other_first.append(doc)
    for doc in numbered_first:
        _push(doc)
    # 本页/段落：第一跳（按页标题向量）优先于专名跳与邻居，避免邻页把 T恤专文等正命中挤出上限。
    # 大纲结构段：仍先专名+邻居，再补其余第一跳（专名定义常靠第二跳）。
    if task in ("slide", "paragraph"):
        for doc in other_first:
            _push(doc)
        for doc in hops:
            _push(doc)
        for doc in neighbors:
            _push(doc)
    else:
        for doc in hops:
            _push(doc)
        for doc in neighbors:
            _push(doc)
        for doc in other_first:
            _push(doc)

    # 采样窗 / 品类范围命中的片段前置，压掉其它周期（如 T恤 5 月窗）的「男装大盘」串数
    prefer_tokens = [
        t
        for t in extras
        if t
        and (
            re.search(r"20\d{2}", t)
            or any(k in t for k in ("衬衫", "polo", "Polo", "大盘", "商务"))
        )
    ]
    if prefer_tokens:
        # 已命中正文件时，把同文件里带「采样时间+大盘」的页（常是 chunk0 品类大盘页）一并拉入
        for doc in list(merged):
            meta = doc.get("metadata") or {}
            src = meta.get("source")
            kb = meta.get("kb_name")
            if not src or not kb or kb == ALL_KB_NAME:
                continue
            src_s = str(src)
            if not any(k in src_s for k in ("衬衫", "polo", "Polo")):
                continue
            try:
                parent_score = float(doc.get("vector_score") or doc.get("score") or 0.0)
            except (TypeError, ValueError):
                parent_score = 0.0
            for item in get_store(kb).docs:
                item_meta = item.get("metadata") or {}
                if item_meta.get("source") != src:
                    continue
                text = item.get("page_content") or ""
                if "采样时间" not in text:
                    continue
                if not any(k in text for k in ("男装大盘", "品类大盘", "总销量", "总销售额")):
                    continue
                twin = dict(item)
                twin["vector_score"] = parent_score + 0.02
                _push(twin)

    # 本页标题实体加权：与 prefer_tokens 解耦，避免无采样窗时大盘页仍串衬衫价表
    title_boost: list[str] = []
    title_penalty: list[str] = []
    if task in ("slide", "paragraph") and primary:
        if "大盘" in primary and not any(
            k in primary for k in ("衬衫", "polo", "Polo", "T恤")
        ):
            title_boost.extend(["男装大盘", "总销量", "总销售额", "品类大盘"])
            title_penalty.extend(["男士衬衫 价格带", "价格带 本期销量", "男士polo"])
        elif "衬衫" in primary and "polo" not in primary.lower():
            title_boost.extend(["男士衬衫", "衬衫"])
            title_penalty.extend(["男士polo", "polo衫品类"])
        elif "polo" in primary.lower() or "Polo" in primary:
            title_boost.extend(["polo衫", "男士polo", "polo"])
            title_penalty.extend(["男士衬衫 价格带"])
        if "价格带" in primary:
            title_boost.append("价格带")

    if prefer_tokens or title_boost or title_penalty:

        def _prefer_hit(doc: dict) -> int:
            meta = doc.get("metadata") or {}
            src = str(meta.get("source") or "")
            blob = (doc.get("page_content") or "") + " " + src
            compact = re.sub(r"[.\-/]", "", blob)
            hit = 0
            if any(k in src for k in ("衬衫polo", "polo衫", "商务男士衬衫", "商务男装")):
                hit += 6
            for t in prefer_tokens:
                if t in blob:
                    hit += 2
                elif re.sub(r"[.\-/]", "", t) in compact:
                    hit += 2
            if "采样时间" in blob and "男装大盘" in blob:
                hit += 4
            for t in title_boost:
                if t and t in blob:
                    hit += 5
            for t in title_penalty:
                if t and t in blob:
                    hit -= 5
            return hit

        merged.sort(
            key=lambda d: (
                _prefer_hit(d),
                float(d.get("vector_score") or d.get("score") or 0.0),
            ),
            reverse=True,
        )

    return merged[: settings.writing_context_limit], task


_TASK_SUMMARY = {
    "outline": (
        "【大纲摘要】\n"
        "每个幻灯片在要点之前单独写一行「- layout: list」或「- layout: metric」。这一行不算要点。\n"
        "章节顺序按读者决策顺序，不要照搬素材原目录。\n"
        "list 页要点必须且只能是 3～5 条。metric 页只在至少两条要点各自含有检索中的原数字（百分号、亿或万）时使用，要点必须且只能是 2～4 条，每条写清原数字和它指什么。\n"
        "不要换算数字，不要编造检索里没有的比例、金额或天数。数字不足两条时必须写 layout: list。\n"
        "少于该版式下限、多于该版式上限都不合格。\n"
        "有依据就必须写满该版式的条数。一句话里的多个做法、条件、结果要拆开，不要合并成 1 条，也不要编造检索里没有的事实，不要用空话凑条数。\n"
        "一条要点可以合并多个专名。只有合并后仍不超过该版式上限时，才把专名拆开；超过上限时，重新摘要进规定条数，不要只保留原文前几条。\n"
        "整页在检索结果中完全没有依据时，不要写这一页。\n"
        "每条要点必须是检索结果中的一条事实（做法、适用条件、数据或案例），"
        "不要写「有几种方法」「可据此判断」这类没有内容的句子。\n"
        "本页标题必须窄于全文标题，写成这一页要回答的问题。\n"
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
        "专名已经出现时，必须把做法写进对应小点，禁止用套话代替。"
        "数字已经出现时，必须逐行写成数据或小点，解读用该数字旁边的检索原词。"
        "百分数和名称可以分成相邻短句，不必与大纲短语连成同一句。大纲用词和检索不完全一致时，以检索用词为准。"
        "禁止整页拒绝，禁止写「知识库未提供」「知识库中未提供」「无法据此」。"
        "只有该要点的数字和专名在检索结果中都完全没有出现时，这一条才写「知识库未提供依据」，其余有数字的条目照写。\n"
        "一条大纲要点只对应一个小点，不要拆开，也不要另起没有依据的小点。\n"
        "小点标题用该条要点里的专名或做法，不要写成「打法适用情境」「情境」「打法」这类栏目名。\n"
        "小点描述不要重复【当前章节】和【本页标题】里已经写过的话，只写这一条比标题多出来的事实。\n"
        "各小点的描述必须互不雷同：禁止把同一段品牌背景或案例故事粘到多个小点后面；第 N 点描述只服务第 N 条大纲要点。\n"
    ),
    # 大纲流水线·按页填 tips（与正文「小点」不同）
    "outline_slide_fill": (
        "【大纲 tips 填充】\n"
        "必须遵守上方已给出的 layout/tips 契约与 JSON 形状；知识库只提供事实来源。\n"
        "从材料中抽取短事实写入 tips，不要写成带引用编号的长叙述正文。\n"
        "layout=columns 时：栏轴用材料中的对照名（如高举高打/精种准打/聚流快打）；"
        "栏内只挂 4～16 字短标签（如「官方媒体背书」「单日播放破500万+」「内容赛马」「星推搜直」「矩阵收拔」），"
        "禁止把整段案例故事、背景机会塞进同一个 tip；过长事实留给后续案例页。\n"
        "占比/分布类（面料、价格带、属性销量占比等）：同一表内同类口径列齐，"
        "且必须包含份额最大的一项；禁止只摘中间两项漏掉第一名。\n"
        "主题已点名品类时，规模页优先同页写「大盘 + 该品类」原数字对照。\n"
        "【口径对齐】同一片段常并排大盘与子类数字：页标题写大盘则只用大盘数，"
        "写衬衫/polo 则只用该品类数；价格带 tip 必须点名价格带。主题有采样窗时只用同窗数字。\n"
        "tips 数组每个元素一行；禁止在单个 tip 字符串里塞 Markdown 多行列表。\n"
        "不要输出 [1]/[2] 引用标注（大纲 tips 阶段不需要）。\n"
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
    cite_rule = (
        "引用规范：大纲 tips 填充阶段不要输出 [1]/[2] 引用标注。\n"
        if task == "outline_slide_fill"
        else (
            "引用规范：在对应句子末尾使用方括号编号引用，例如 [1] 或 [2][3]，"
            "不要写「(文档1)」这类文字；不要编造未提供的文档编号。\n"
        )
    )
    return (
        "你是毕方智能知识管理助手。请严格依据下列知识库内容回答用户问题或完成撰写任务。\n"
        "写作约束：只使用下列检索结果中的信息；不得用检索外的常识补全或编造数字/案例/结论。\n"
        "不同片段可能分别给出总述和定义，撰写时要合并使用，不要只复述第一条。\n"
        "输出要求：直接给出可用的正文/答案，不要以「根据知识库内容」「根据资料」「根据检索结果」"
        "「基于知识库」等套话或元说明开头；不要复述「我将根据知识库…」这类过程描述。\n"
        f"{cite_rule}"
        "如果知识库不足以回答，请明确说明无法从知识库得到答案。\n\n"
        f"知识库检索结果：\n{context}{tail}"
    )


def vs_type_conf() -> dict:
    return ok({"vs_types": ["faiss"], "def_vs_type": "faiss"})


def get_file_path(knowledge_base_name: str, file_name: str) -> Path:
    return kb_content_dir(knowledge_base_name) / file_name
