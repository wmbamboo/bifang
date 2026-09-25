"""PDF/图片 OCR：用于扫描件与图表文字混排文档。

默认引擎：PaddleOCR-VL（版面/表格 Markdown，适合知衣类数据页）。
回退：rapidocr-onnxruntime（轻量中英 OCR）。

按页判断：原生文字过少或页面含图时再 OCR，并与文字层合并。
"""
from __future__ import annotations

import io
import os
import tempfile
import threading
from pathlib import Path
from typing import Callable, Optional

from app.config import get_settings

_ocr_lock = threading.Lock()
_ocr_engine = None
_ocr_engine_name: Optional[str] = None
_ocr_init_error: Optional[str] = None


def _vl_result_to_text(res) -> str:
    """从 PaddleOCRVL predict 结果抽出可读文本（优先 Markdown，保留表结构）。"""
    md = getattr(res, "markdown", None)
    if callable(md):
        try:
            md = md()
        except Exception:  # noqa: BLE001
            md = None
    if isinstance(md, dict):
        texts = md.get("markdown_texts")
        if isinstance(texts, str) and texts.strip():
            return texts.strip()
        if isinstance(texts, list):
            joined = "\n\n".join(str(x).strip() for x in texts if str(x).strip())
            if joined:
                return joined
        # 部分版本用 text
        alt = md.get("text")
        if isinstance(alt, str) and alt.strip():
            return alt.strip()

    data = getattr(res, "json", None)
    if callable(data):
        try:
            data = data()
        except Exception:  # noqa: BLE001
            data = None
    if isinstance(data, dict):
        for key in ("markdown_texts", "text", "ocr_text"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        # 递归搜 parsing_res_list 一类结构里的 text
        chunks: list[str] = []

        def _walk(obj) -> None:
            if isinstance(obj, dict):
                t = obj.get("text") or obj.get("content")
                if isinstance(t, str) and t.strip():
                    chunks.append(t.strip())
                for v in obj.values():
                    _walk(v)
            elif isinstance(obj, list):
                for v in obj:
                    _walk(v)

        _walk(data)
        if chunks:
            return "\n".join(chunks)
    return ""


def _init_paddleocr_vl():
    from paddleocr import PaddleOCRVL

    settings = get_settings()
    version = (settings.ocr_vl_pipeline_version or "v1.5").strip()
    backend = (settings.ocr_vl_engine or "transformers").strip().lower()
    kwargs: dict = {"pipeline_version": version}
    # transformers：走 HF/torch，避免与 embedding 的 CUDA 库互相降级
    if backend in ("transformers", "hf", "torch"):
        kwargs["engine"] = "transformers"
    else:
        kwargs["engine"] = "paddle"
        device = (settings.embedding_device or "").strip().lower()
        if device in ("cpu",):
            kwargs["device"] = "cpu"
        elif device.startswith("cuda") or device == "gpu":
            kwargs["device"] = "gpu"
    return PaddleOCRVL(**kwargs)


def _init_rapidocr():
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def _get_engine():
    """懒加载 OCR 引擎。返回 (engine, name)。"""
    global _ocr_engine, _ocr_engine_name, _ocr_init_error
    if _ocr_engine is not None and _ocr_engine_name:
        return _ocr_engine, _ocr_engine_name
    if _ocr_init_error:
        raise RuntimeError(_ocr_init_error)
    with _ocr_lock:
        if _ocr_engine is not None and _ocr_engine_name:
            return _ocr_engine, _ocr_engine_name
        settings = get_settings()
        wanted = (settings.ocr_engine or "paddleocr_vl").strip().lower()
        errors: list[str] = []

        def _try(name: str, factory):
            global _ocr_engine, _ocr_engine_name
            try:
                _ocr_engine = factory()
                _ocr_engine_name = name
                return True
            except Exception as e:  # noqa: BLE001
                errors.append(f"{name}: {e}")
                return False

        order = (
            ["paddleocr_vl", "rapidocr"]
            if wanted in ("paddleocr_vl", "paddleocr-vl", "vl", "paddle")
            else ["rapidocr", "paddleocr_vl"]
            if wanted in ("rapidocr", "rapid")
            else [wanted, "rapidocr"]
        )
        # 去重保序
        seen = set()
        for name in order:
            if name in seen:
                continue
            seen.add(name)
            if name == "paddleocr_vl" and _try("paddleocr_vl", _init_paddleocr_vl):
                return _ocr_engine, _ocr_engine_name
            if name == "rapidocr" and _try("rapidocr", _init_rapidocr):
                return _ocr_engine, _ocr_engine_name

        _ocr_init_error = "OCR 引擎初始化失败: " + " | ".join(errors) or "未知错误"
        raise RuntimeError(_ocr_init_error)


def _ocr_with_paddleocr_vl(engine, image_bytes: bytes) -> str:
    fd, tmp_path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        Path(tmp_path).write_bytes(image_bytes)
        output = engine.predict(tmp_path)
        # predict 可能返回 list 或 generator
        if output is None:
            return ""
        results = list(output) if not isinstance(output, list) else output
        parts = [_vl_result_to_text(res) for res in results]
        return "\n\n".join(p for p in parts if p).strip()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _ocr_with_rapidocr(engine, image_bytes: bytes) -> str:
    import numpy as np
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)
    result, _ = engine(arr)
    if not result:
        return ""
    lines = []
    for item in result:
        if not item or len(item) < 2:
            continue
        text = str(item[1]).strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def ocr_image_bytes(image_bytes: bytes) -> str:
    """对 PNG/JPEG 字节做 OCR，返回纯文本（PaddleOCR-VL 时多为 Markdown）。"""
    engine, name = _get_engine()
    if name == "paddleocr_vl":
        return _ocr_with_paddleocr_vl(engine, image_bytes)
    return _ocr_with_rapidocr(engine, image_bytes)


def _merge_page_text(native: str, ocr: str) -> str:
    native = (native or "").strip()
    ocr = (ocr or "").strip()
    if not ocr:
        return native
    if not native:
        return ocr
    # 图文混排：保留文字层，并追加 OCR 中明显未覆盖的内容
    native_compact = "".join(native.split())
    extra_lines = []
    for line in ocr.splitlines():
        s = line.strip()
        if not s:
            continue
        compact = "".join(s.split())
        if len(compact) >= 2 and compact not in native_compact:
            extra_lines.append(s)
    if not extra_lines:
        # OCR 更长则优先 OCR（常见于扫描页文字层为空/乱码；VL Markdown 表也更长）
        return ocr if len(ocr) > len(native) * 1.2 else native
    return native + "\n\n[OCR补充]\n" + "\n".join(extra_lines)


def _page_needs_ocr(page, native_text: str, min_chars: int) -> bool:
    text = (native_text or "").strip()
    if len(text) < min_chars:
        return True
    try:
        images = page.get_images(full=True) or []
    except Exception:
        images = []
    # 有图且正文不长：图表混排页，补 OCR
    if images and len(text) < max(min_chars * 4, 200):
        return True
    return False


ProgressCb = Optional[Callable[[int, int, str], None]]
ContinueCb = Optional[Callable[[], bool]]


def extract_pdf_text(
    path: Path,
    *,
    enable_ocr: bool = True,
    min_chars_per_page: Optional[int] = None,
    dpi_scale: Optional[float] = None,
    on_progress: ProgressCb = None,
    should_continue: ContinueCb = None,
) -> tuple[str, dict]:
    """按页抽取 PDF 文本；必要时 OCR。

    返回 (text, meta)，meta 含 page_count / ocr_pages / used_ocr / ocr_engine。
    """
    import logging
    import time

    import pymupdf as fitz

    logger = logging.getLogger("bifang.ocr")
    settings = get_settings()
    min_chars = min_chars_per_page if min_chars_per_page is not None else settings.ocr_min_chars_per_page
    scale = dpi_scale if dpi_scale is not None else settings.ocr_dpi_scale
    force_all = settings.ocr_force_all_pages

    doc = fitz.open(str(path))
    page_count = doc.page_count
    parts: list[str] = []
    ocr_pages = 0
    used_ocr = False
    engine_name = ""

    try:
        # 提前加载模型，避免「卡在第 1 页」其实是在下/载模型
        if enable_ocr:
            if on_progress:
                on_progress(0, page_count, "loading")
            t0 = time.perf_counter()
            _, engine_name = _get_engine()
            logger.info(
                "OCR engine ready name=%s path=%s pages=%s load_s=%.1f",
                engine_name,
                path.name,
                page_count,
                time.perf_counter() - t0,
            )

        for i in range(page_count):
            if should_continue and not should_continue():
                raise InterruptedError("用户停止")
            page = doc.load_page(i)
            native = page.get_text("text") or ""
            page_text = native.strip()
            do_ocr = enable_ocr and (force_all or _page_needs_ocr(page, native, min_chars))
            if do_ocr:
                if on_progress:
                    on_progress(i + 1, page_count, "ocr")
                try:
                    t1 = time.perf_counter()
                    mat = fitz.Matrix(scale, scale)
                    pix = page.get_pixmap(matrix=mat, alpha=False)
                    png = pix.tobytes("png")
                    ocr_text = ocr_image_bytes(png)
                    if not engine_name:
                        _, engine_name = _get_engine()
                    page_text = _merge_page_text(native, ocr_text)
                    ocr_pages += 1
                    used_ocr = True
                    logger.info(
                        "OCR page %s/%s done chars=%s elapsed_s=%.1f file=%s",
                        i + 1,
                        page_count,
                        len(page_text),
                        time.perf_counter() - t1,
                        path.name,
                    )
                except Exception as e:  # noqa: BLE001
                    # OCR 失败时回退文字层，不中断整份文档
                    logger.exception("OCR page %s/%s failed: %s", i + 1, page_count, e)
                    if not page_text:
                        page_text = f"[第{i + 1}页OCR失败: {e}]"
                if on_progress:
                    on_progress(i + 1, page_count, "ocr_done")
            else:
                if on_progress:
                    on_progress(i + 1, page_count, "text")

            if page_text:
                parts.append(f"[第{i + 1}页]\n{page_text}")
    finally:
        doc.close()

    text = "\n\n".join(parts).strip()
    meta = {
        "page_count": page_count,
        "ocr_pages": ocr_pages,
        "used_ocr": used_ocr,
        "ocr_engine": engine_name or (settings.ocr_engine or ""),
        "ocr_vl_pipeline_version": settings.ocr_vl_pipeline_version
        if (engine_name or settings.ocr_engine or "").startswith("paddleocr")
        else "",
        "ocr_vl_engine": settings.ocr_vl_engine
        if (engine_name or settings.ocr_engine or "").startswith("paddleocr")
        else "",
        "ocr_dpi_scale_used": scale,
    }
    return text, meta


def extract_image_text(path: Path) -> str:
    data = path.read_bytes()
    return ocr_image_bytes(data)
