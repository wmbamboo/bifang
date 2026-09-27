"""PDF/图片 OCR：用于扫描件与图表文字混排文档。

默认引擎：PaddleOCR-VL（版面/表格 Markdown，适合知衣类数据页）。
回退：rapidocr-onnxruntime（轻量中英 OCR）。

按页判断：原生文字过少或页面含图时再 OCR，并与文字层合并。
属性/条形图页：VL 常把 chart_box 嵌成 <img>，再用 RapidOCR 裁切补「标签+占比」。
"""
from __future__ import annotations

import io
import logging
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Callable, Optional

from app.config import get_settings

_ocr_lock = threading.Lock()
_ocr_engine = None
_ocr_engine_name: Optional[str] = None
_ocr_init_error: Optional[str] = None
_rapidocr_engine = None
_logger = logging.getLogger("bifang.ocr")

# VL Markdown 里版面检出的图块：imgs/img_in_chart_box_{x1}_{y1}_{x2}_{y2}.jpg
_CHART_BOX_RE = re.compile(
    r"img_in_chart_box_(\d+)_(\d+)_(\d+)_(\d+)\.(?:jpg|jpeg|png)",
    re.I,
)
# 商品/图鉴区：imgs/img_in_image_box_{x0}_{y0}_{x1}_{y1}.jpg（坐标=同次 get_pixmap 页图）
_IMAGE_BOX_RE = re.compile(
    r"img_in_image_box_(\d+)_(\d+)_(\d+)_(\d+)\.(?:jpg|jpeg|png)",
    re.I,
)
_ATTR_PAIR_INLINE_RE = re.compile(
    r"(?<![A-Za-z0-9])([\u4e00-\u9fffA-Za-z]{1,12})\s*"
    r"(\d+(?:\.\d+)?)\s*[%％]"
)
_LABEL_ONLY_RE = re.compile(r"^[\u4e00-\u9fffA-Za-z]{1,12}$")
_PCT_ONLY_RE = re.compile(r"^\d+(?:\.\d+)?\s*[%％]$")


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


def _get_rapidocr_engine():
    """独立 RapidOCR 实例（与主引擎并行：主引擎常为 VL）。"""
    global _rapidocr_engine
    if _rapidocr_engine is not None:
        return _rapidocr_engine
    with _ocr_lock:
        if _rapidocr_engine is None:
            _rapidocr_engine = _init_rapidocr()
    return _rapidocr_engine


def pair_label_pct_lines(text: str) -> str:
    """RapidOCR 常输出「棉\\n72.18%」分行；合成「棉 72.18%」供属性抽取。"""
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    out: list[str] = []
    i = 0
    while i < len(lines):
        cur = lines[i]
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if _LABEL_ONLY_RE.fullmatch(cur) and _PCT_ONLY_RE.fullmatch(nxt):
            out.append(f"{cur} {nxt}")
            i += 2
            continue
        out.append(cur)
        i += 1
    return "\n".join(out)


def enrich_vl_chart_boxes(md: str, page_image_bytes: bytes) -> str:
    """VL 把条形/占比图嵌成 chart_box 时，裁切后 RapidOCR 补标签+占比。

    若正文已有足够「标签+占比」对则跳过，避免重复。
    """
    if not md or not page_image_bytes:
        return md or ""
    if "img_in_chart_box_" not in md:
        return md
    if len(_ATTR_PAIR_INLINE_RE.findall(md)) >= 4:
        return md

    from PIL import Image

    try:
        page = Image.open(io.BytesIO(page_image_bytes)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        _logger.warning("chart_box enrich: open page image failed: %s", e)
        return md

    try:
        rapid = _get_rapidocr_engine()
    except Exception as e:  # noqa: BLE001
        _logger.warning("chart_box enrich: rapidocr init failed: %s", e)
        return md

    extras: list[str] = []
    seen_box: set[tuple[int, int, int, int]] = set()
    for m in _CHART_BOX_RE.finditer(md):
        box = tuple(int(m.group(i)) for i in range(1, 5))
        if box in seen_box:
            continue
        seen_box.add(box)
        x1, y1, x2, y2 = box
        x1 = max(0, min(x1, page.width))
        x2 = max(0, min(x2, page.width))
        y1 = max(0, min(y1, page.height))
        y2 = max(0, min(y2, page.height))
        if x2 - x1 < 8 or y2 - y1 < 8:
            continue
        crop = page.crop((x1, y1, x2, y2))
        buf = io.BytesIO()
        crop.save(buf, format="PNG")
        try:
            raw = _ocr_with_rapidocr(rapid, buf.getvalue())
        except Exception as e:  # noqa: BLE001
            _logger.warning("chart_box enrich OCR failed box=%s: %s", box, e)
            continue
        paired = pair_label_pct_lines(raw)
        if not paired.strip():
            continue
        if not _ATTR_PAIR_INLINE_RE.search(paired):
            continue
        extras.append(paired.strip())

    if not extras:
        return md
    block = "\n\n".join(extras)
    _logger.info(
        "chart_box enrich boxes=%s pairs=%s",
        len(extras),
        len(_ATTR_PAIR_INLINE_RE.findall(block)),
    )
    return md.rstrip() + "\n\n[图表OCR]\n" + block


def ocr_image_bytes(image_bytes: bytes) -> str:
    """对 PNG/JPEG 字节做 OCR，返回纯文本（PaddleOCR-VL 时多为 Markdown）。"""
    engine, name = _get_engine()
    if name == "paddleocr_vl":
        md = _ocr_with_paddleocr_vl(engine, image_bytes)
        return enrich_vl_chart_boxes(md, image_bytes)
    return _ocr_with_rapidocr(engine, image_bytes)


def render_page_png(
    path: Path,
    page_no: int,
    scale: Optional[float] = None,
) -> bytes:
    """按与 OCR 相同的 Matrix(scale) 渲染 PDF 单页为 PNG 字节。

    page_no 为 1-based。CLI 存量回填与流水线必须共用此函数，禁止 Image.resize 换算。
    """
    import pymupdf as fitz

    settings = get_settings()
    s = float(scale if scale is not None else settings.ocr_dpi_scale)
    doc = fitz.open(str(path))
    try:
        if page_no < 1 or page_no > doc.page_count:
            raise ValueError(f"page_no out of range: {page_no}/{doc.page_count}")
        page = doc.load_page(page_no - 1)
        pix = page.get_pixmap(matrix=fitz.Matrix(s, s), alpha=False)
        return pix.tobytes("png")
    finally:
        doc.close()


def parse_vl_box_refs(md: str) -> list[tuple[str, tuple[int, int, int, int]]]:
    """从 VL Markdown 解析 (kind, (x0,y0,x1,y1))；kind 为 image|chart。"""
    out: list[tuple[str, tuple[int, int, int, int]]] = []
    seen: set[tuple[str, int, int, int, int]] = set()
    for kind, pat in (("image", _IMAGE_BOX_RE), ("chart", _CHART_BOX_RE)):
        for m in pat.finditer(md or ""):
            box = tuple(int(m.group(i)) for i in range(1, 5))
            key = (kind, *box)
            if key in seen:
                continue
            seen.add(key)
            out.append((kind, box))  # type: ignore[arg-type]
    return out


def crop_element_assets_from_page(
    page_image_bytes: bytes,
    ocr_md: str,
    *,
    assets_dir: Path,
    file_stem: str,
    page_no: int,
    save_whole: bool = True,
) -> list[dict]:
    """用与 VL 同一次的页图裁切 image_box/chart_box，落盘 elements/（及可选 whole/）。

    返回 [{asset_id, kind, page, box, path}, ...]；asset_id 相对 assets_dir。
    """
    from PIL import Image

    assets_dir = Path(assets_dir)
    elements_dir = assets_dir / "elements"
    elements_dir.mkdir(parents=True, exist_ok=True)
    infos: list[dict] = []

    try:
        page = Image.open(io.BytesIO(page_image_bytes)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        _logger.warning("crop elements: open page failed: %s", e)
        return infos

    if save_whole:
        whole_dir = assets_dir / "whole"
        whole_dir.mkdir(parents=True, exist_ok=True)
        whole_name = f"page_{page_no}.png"
        whole_path = whole_dir / whole_name
        try:
            page.save(whole_path, format="PNG")
            infos.append(
                {
                    "asset_id": f"whole/{whole_name}",
                    "kind": "whole",
                    "page": page_no,
                    "box": (0, 0, page.width, page.height),
                    "path": str(whole_path),
                }
            )
        except Exception as e:  # noqa: BLE001
            _logger.warning("crop elements: save whole failed: %s", e)

    kind_counts: dict[str, int] = {"image": 0, "chart": 0}
    for kind, box in parse_vl_box_refs(ocr_md):
        x0, y0, x1, y1 = box
        # 坐标必须落在本页图像素内；越界说明 bbox 来自另一分辨率画布，禁止硬裁
        if (
            x0 < 0
            or y0 < 0
            or x1 > page.width + 2
            or y1 > page.height + 2
            or x1 - x0 < 8
            or y1 - y0 < 8
        ):
            _logger.warning(
                "crop skip out-of-canvas box=%s page=%sx%s kind=%s",
                box,
                page.width,
                page.height,
                kind,
            )
            continue
        x0 = max(0, min(x0, page.width))
        x1 = max(0, min(x1, page.width))
        y0 = max(0, min(y0, page.height))
        y1 = max(0, min(y1, page.height))
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
        idx = kind_counts[kind]
        short = "img" if kind == "image" else "chart"
        fname = f"{file_stem}_p{page_no}_{short}{idx}.png"
        dest = elements_dir / fname
        try:
            page.crop((x0, y0, x1, y1)).save(dest, format="PNG")
        except Exception as e:  # noqa: BLE001
            _logger.warning("crop elements: save %s failed: %s", fname, e)
            continue
        infos.append(
            {
                "asset_id": f"elements/{fname}",
                "kind": kind,
                "page": page_no,
                "box": (x0, y0, x1, y1),
                "path": str(dest),
            }
        )

    if any(k != "whole" for k in (i.get("kind") for i in infos)):
        _logger.info(
            "crop elements page=%s image=%s chart=%s stem=%s",
            page_no,
            kind_counts.get("image", 0),
            kind_counts.get("chart", 0),
            file_stem,
        )
    return infos


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
    assets_dir: Optional[Path] = None,
    file_stem: Optional[str] = None,
) -> tuple[str, dict]:
    """按页抽取 PDF 文本；必要时 OCR。

    返回 (text, meta)，meta 含 page_count / ocr_pages / used_ocr / ocr_engine /
    element_assets（若提供 assets_dir：OCR 同次页图裁切的元素图 id 列表）。
    """
    import logging
    import time

    import pymupdf as fitz

    logger = logging.getLogger("bifang.ocr")
    settings = get_settings()
    min_chars = min_chars_per_page if min_chars_per_page is not None else settings.ocr_min_chars_per_page
    scale = dpi_scale if dpi_scale is not None else settings.ocr_dpi_scale
    force_all = settings.ocr_force_all_pages
    stem = file_stem or Path(path).stem
    do_crop = assets_dir is not None

    doc = fitz.open(str(path))
    page_count = doc.page_count
    parts: list[str] = []
    ocr_pages = 0
    used_ocr = False
    engine_name = ""
    element_assets: dict[int, list[str]] = {}

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
                    # 同一次页图裁切 VL bbox → elements/ + whole/（零换算）
                    if do_crop:
                        try:
                            infos = crop_element_assets_from_page(
                                png,
                                ocr_text,
                                assets_dir=Path(assets_dir),  # type: ignore[arg-type]
                                file_stem=stem,
                                page_no=i + 1,
                                save_whole=True,
                            )
                            ids = [
                                str(x["asset_id"])
                                for x in infos
                                if x.get("kind") in ("image", "chart")
                            ]
                            if ids:
                                element_assets[i + 1] = ids
                        except Exception as crop_ex:  # noqa: BLE001
                            logger.warning(
                                "element crop page %s failed: %s",
                                i + 1,
                                crop_ex,
                            )
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
        "element_assets": element_assets,
    }
    return text, meta


def extract_image_text(path: Path) -> str:
    data = path.read_bytes()
    return ocr_image_bytes(data)
