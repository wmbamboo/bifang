"""PDF/图片 OCR：用于扫描件与图表文字混排文档。

依赖：pymupdf（渲染页面）+ rapidocr-onnxruntime（中英 OCR）。
按页判断：原生文字过少或页面含图时再 OCR，并与文字层合并。
"""
from __future__ import annotations

import io
import threading
from pathlib import Path
from typing import Callable, Optional

from app.config import get_settings

_ocr_lock = threading.Lock()
_ocr_engine = None
_ocr_init_error: Optional[str] = None


def _get_engine():
    global _ocr_engine, _ocr_init_error
    if _ocr_engine is not None:
        return _ocr_engine
    if _ocr_init_error:
        raise RuntimeError(_ocr_init_error)
    with _ocr_lock:
        if _ocr_engine is not None:
            return _ocr_engine
        try:
            from rapidocr_onnxruntime import RapidOCR

            _ocr_engine = RapidOCR()
            return _ocr_engine
        except Exception as e:  # noqa: BLE001
            _ocr_init_error = f"OCR 引擎初始化失败: {e}"
            raise RuntimeError(_ocr_init_error) from e


def ocr_image_bytes(image_bytes: bytes) -> str:
    """对 PNG/JPEG 字节做 OCR，返回纯文本。"""
    import numpy as np
    from PIL import Image

    engine = _get_engine()
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)
    result, _ = engine(arr)
    if not result:
        return ""
    # RapidOCR: list of [box, text, score]
    lines = []
    for item in result:
        if not item or len(item) < 2:
            continue
        text = str(item[1]).strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


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
        # OCR 更长则优先 OCR（常见于扫描页文字层为空/乱码）
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

    返回 (text, meta)，meta 含 page_count / ocr_pages / used_ocr。
    """
    import pymupdf as fitz

    settings = get_settings()
    min_chars = min_chars_per_page if min_chars_per_page is not None else settings.ocr_min_chars_per_page
    scale = dpi_scale if dpi_scale is not None else settings.ocr_dpi_scale
    force_all = settings.ocr_force_all_pages

    doc = fitz.open(str(path))
    page_count = doc.page_count
    parts: list[str] = []
    ocr_pages = 0
    used_ocr = False

    try:
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
                    mat = fitz.Matrix(scale, scale)
                    pix = page.get_pixmap(matrix=mat, alpha=False)
                    png = pix.tobytes("png")
                    ocr_text = ocr_image_bytes(png)
                    page_text = _merge_page_text(native, ocr_text)
                    ocr_pages += 1
                    used_ocr = True
                except Exception as e:  # noqa: BLE001
                    # OCR 失败时回退文字层，不中断整份文档
                    if not page_text:
                        page_text = f"[第{i + 1}页OCR失败: {e}]"
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
    }
    return text, meta


def extract_image_text(path: Path) -> str:
    data = path.read_bytes()
    return ocr_image_bytes(data)
