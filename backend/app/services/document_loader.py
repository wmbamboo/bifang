from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional


ProgressCb = Optional[Callable[[int, int, str], None]]
ContinueCb = Optional[Callable[[], bool]]


def load_file_text(
    path: Path,
    *,
    enable_ocr: bool = False,
    on_progress: ProgressCb = None,
    should_continue: ContinueCb = None,
) -> str:
    """加载文件正文。enable_ocr=True 时对 PDF/图片走 OCR 增强（图文混排/扫描件）。"""
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".json", ".log"}:
        return _read_text(path)
    if suffix == ".docx":
        return _read_docx(path)
    if suffix == ".pdf":
        return _read_pdf(
            path,
            enable_ocr=enable_ocr,
            on_progress=on_progress,
            should_continue=should_continue,
        )
    if suffix in {".pptx", ".ppt"}:
        return _read_pptx(path)
    if suffix in {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}:
        if enable_ocr:
            from app.services.ocr_service import extract_image_text

            return extract_image_text(path)
        return ""
    return _read_text(path)


def _read_text(path: Path) -> str:
    for enc in ("utf-8", "gb18030", "latin-1"):
        try:
            return path.read_text(encoding=enc)
        except Exception:
            continue
    return path.read_bytes().decode("utf-8", errors="ignore")


def _read_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    parts = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text and c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def _read_pdf_pypdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n".join([(p.extract_text() or "") for p in reader.pages])


def _read_pdf(
    path: Path,
    *,
    enable_ocr: bool = False,
    on_progress: ProgressCb = None,
    should_continue: ContinueCb = None,
) -> str:
    # 优先 PyMuPDF（文字层更稳）；需要 OCR 或 pymupdf 不可用时再分支
    if enable_ocr:
        from app.services.ocr_service import extract_pdf_text

        text, _meta = extract_pdf_text(
            path,
            enable_ocr=True,
            on_progress=on_progress,
            should_continue=should_continue,
        )
        return text

    try:
        import pymupdf as fitz

        doc = fitz.open(str(path))
        try:
            parts = []
            for i in range(doc.page_count):
                t = (doc.load_page(i).get_text("text") or "").strip()
                if t:
                    parts.append(t)
            return "\n\n".join(parts)
        finally:
            doc.close()
    except Exception:
        return _read_pdf_pypdf(path)


def _read_pptx(path: Path) -> str:
    from pptx import Presentation

    prs = Presentation(str(path))
    parts = []
    for idx, slide in enumerate(prs.slides, start=1):
        slide_texts = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text:
                t = shape.text.strip()
                if t:
                    slide_texts.append(t)
        if slide_texts:
            parts.append(f"[幻灯片{idx}]\n" + "\n".join(slide_texts))
    return "\n\n".join(parts)


def split_text(text: str, chunk_size: int = 500, chunk_overlap: int = 80) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    paragraphs = [p.strip() for p in text.replace("\r\n", "\n").split("\n") if p.strip()]
    chunks: list[str] = []
    buf = ""
    for p in paragraphs:
        if len(buf) + len(p) + 1 <= chunk_size:
            buf = f"{buf}\n{p}".strip() if buf else p
            continue
        if buf:
            chunks.append(buf)
        if len(p) <= chunk_size:
            if chunks and chunk_overlap > 0:
                prev = chunks[-1]
                overlap = prev[-chunk_overlap:]
                buf = f"{overlap}\n{p}".strip()
            else:
                buf = p
        else:
            start = 0
            while start < len(p):
                end = start + chunk_size
                chunks.append(p[start:end])
                start = max(end - chunk_overlap, end)
            buf = ""
    if buf:
        chunks.append(buf)
    return chunks
