#!/usr/bin/env python3
"""存量回填：按 extracts/向量正文中的 VL bbox，用与 OCR 同款 render_page_png 裁元素图。

禁止 Image.resize / 跨分辨率乘系数。坐标空间 = get_pixmap(Matrix(ocr_dpi_scale))。

用法（在 backend/ 下）:
  PYTHONPATH=. .venv/bin/python -m app.scripts.backfill_element_assets \\
    --kb 服装 --file 抖音单品爆款分析-商务男士衬衫polo衫.pdf
  PYTHONPATH=. .venv/bin/python -m app.scripts.backfill_element_assets --kb 服装 --all
"""
from __future__ import annotations

import argparse
import io
import json
import re
from pathlib import Path

from app.config import get_settings
from app.services.kb_service import (
    extract_page_assets,
    kb_assets_dir,
    kb_content_dir,
)
from app.services.ocr_service import (
    crop_element_assets_from_page,
    parse_vl_box_refs,
    render_page_png,
)


_PAGE_MARK = re.compile(r"^\[(?:第|幻灯片)?\s*(\d+)\s*页?\]\s*", re.M)


def _pages_from_extract_jsonl(path: Path) -> dict[int, str]:
    out: dict[int, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        page = r.get("page")
        if page is None:
            continue
        snip = r.get("snippet") or r.get("text") or ""
        out[int(page)] = snip
    return out


def _pages_from_full_text(text: str) -> dict[int, str]:
    out: dict[int, str] = {}
    parts = _PAGE_MARK.split(text or "")
    # split 给出 [pre, num, body, num, body, ...]
    i = 1
    while i + 1 < len(parts):
        try:
            page = int(parts[i])
        except ValueError:
            i += 2
            continue
        out[page] = parts[i + 1]
        i += 2
    return out


def _boxes_fit(refs: list, width: int, height: int) -> bool:
    for _kind, box in refs:
        x0, y0, x1, y1 = box
        if x0 < 0 or y0 < 0 or x1 > width + 2 or y1 > height + 2:
            return False
    return True


def backfill_one(kb_name: str, file_name: str, *, pages: set[int] | None = None) -> dict:
    settings = get_settings()
    scale = settings.ocr_dpi_scale
    content = kb_content_dir(kb_name) / file_name
    if not content.exists():
        return {"ok": False, "error": f"missing {content}"}
    stem = Path(file_name).stem
    assets_dir = kb_assets_dir(kb_name, file_name)
    assets_dir.mkdir(parents=True, exist_ok=True)

    extracts = get_settings().kb_root / kb_name / "extracts" / f"{stem}.jsonl"
    by_page = _pages_from_extract_jsonl(extracts)

    cropped = 0
    skipped = 0
    skipped_oob = 0
    for page, body in sorted(by_page.items()):
        if pages and page not in pages:
            continue
        refs = parse_vl_box_refs(body)
        if not refs:
            skipped += 1
            continue
        try:
            png = render_page_png(content, page, scale=scale)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"render p{page}: {e}", "cropped": cropped}

        from PIL import Image

        canvas = Image.open(io.BytesIO(png))
        # bbox 必须属于本画布；若 OCR 曾对内嵌 3840 图跑过，改用同页内嵌整页图（仍零换算）
        if not _boxes_fit(refs, canvas.width, canvas.height):
            emb = assets_dir / f"{stem}_p{page}_0.png"
            if emb.exists():
                png = emb.read_bytes()
                canvas = Image.open(io.BytesIO(png))
            if not _boxes_fit(refs, canvas.width, canvas.height):
                skipped_oob += 1
                continue

        fake_md = "\n".join(
            f'<img src="imgs/img_in_{kind}_box_{b[0]}_{b[1]}_{b[2]}_{b[3]}.jpg" />'
            for kind, b in refs
        )
        infos = crop_element_assets_from_page(
            png,
            fake_md,
            assets_dir=assets_dir,
            file_stem=stem,
            page_no=page,
            save_whole=True,
        )
        cropped += sum(1 for x in infos if x.get("kind") in ("image", "chart"))

    meta = extract_page_assets(content, kb_name, file_name)
    return {
        "ok": True,
        "file": file_name,
        "cropped": cropped,
        "pages_skipped_no_box": skipped,
        "pages_skipped_oob": skipped_oob,
        "asset_pages": len(meta),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill VL bbox element crops")
    ap.add_argument("--kb", required=True)
    ap.add_argument("--file", default="")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--pages", default="", help="comma pages, e.g. 6,9,10")
    args = ap.parse_args()
    page_set = (
        {int(x) for x in args.pages.split(",") if x.strip()}
        if args.pages
        else None
    )
    content_dir = kb_content_dir(args.kb)
    files: list[str] = []
    if args.file:
        files = [args.file]
    elif args.all:
        files = sorted(p.name for p in content_dir.glob("*.pdf"))
    else:
        ap.error("need --file or --all")

    for name in files:
        print(backfill_one(args.kb, name, pages=page_set))


if __name__ == "__main__":
    main()
