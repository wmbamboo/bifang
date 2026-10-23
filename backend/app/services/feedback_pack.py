"""反馈打包：manifest / BRIEF / images / zip / meta。"""
from __future__ import annotations

import json
import shutil
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from app.config import get_settings
from app.db import get_conn


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def packs_root() -> Path:
    d = get_settings().feedback_packs_dir
    d.mkdir(parents=True, exist_ok=True)
    return d


def job_dir(job_id: str) -> Path:
    return packs_root() / job_id


def write_meta(job_id: str, **fields: Any) -> dict:
    path = job_dir(job_id) / "meta.json"
    meta: dict = {}
    if path.exists():
        try:
            meta = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            meta = {}
    meta.update(fields)
    meta["job_id"] = job_id
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def read_meta(job_id: str) -> Optional[dict]:
    path = job_dir(job_id) / "meta.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _imgs_src() -> Path:
    return get_settings().data_path / "feedback_imgs"


def _parse_images(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(x) for x in raw if x]
    if isinstance(raw, str) and raw.strip():
        try:
            v = json.loads(raw)
            return [str(x) for x in v] if isinstance(v, list) else []
        except Exception:
            return []
    return []


def load_feedback_rows(ids: list[str]) -> list[dict]:
    if not ids:
        return []
    placeholders = ",".join("?" * len(ids))
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM feedbacks WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
    by_id = {r["id"]: dict(r) for r in rows}
    # 保持请求顺序
    return [by_id[i] for i in ids if i in by_id]


def build_pack(
    ids: list[str],
    *,
    job_id: Optional[str] = None,
    created_by: str = "",
    instruction: str = "",
) -> tuple[str, Path]:
    """
    写出 job 目录 + pack.zip。返回 (job_id, job_dir)。
    """
    jid = job_id or uuid.uuid4().hex
    root = job_dir(jid)
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)
    (root / "images").mkdir()

    rows = load_feedback_rows(ids)
    items: list[dict] = []
    brief_lines = [
        "# 反馈处理包",
        "",
        f"- job_id: `{jid}`",
        f"- created_by: `{created_by}`",
        f"- created_at: `{_utc_now()}`",
        "",
    ]
    if instruction.strip():
        brief_lines.extend(["## 补充说明", "", instruction.strip(), ""])

    brief_lines.extend(["## 条目", ""])
    img_src = _imgs_src()

    for row in rows:
        fid = row["id"]
        images = _parse_images(row.get("images"))
        copied: list[str] = []
        for name in images:
            safe = Path(name).name
            src = img_src / safe
            if not src.is_file():
                continue
            dest_dir = root / "images" / fid
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / safe
            shutil.copy2(src, dest)
            copied.append(f"images/{fid}/{safe}")

        item = {
            "id": fid,
            "feedback_type": row.get("feedback_type"),
            "status": row.get("status"),
            "content": row.get("content"),
            "page": row.get("page"),
            "user": row.get("user"),
            "user_name": row.get("user_name"),
            "created_at": row.get("created_at"),
            "reply": row.get("reply"),
            "context_json": row.get("context_json"),
            "images": copied,
        }
        items.append(item)
        brief_lines.append(f"### {fid[:8]}… ({row.get('status')})")
        brief_lines.append("")
        brief_lines.append(str(row.get("content") or "").strip() or "（无正文）")
        brief_lines.append("")
        if row.get("page"):
            brief_lines.append(f"- page: `{row.get('page')}`")
        if copied:
            brief_lines.append("- images:")
            for p in copied:
                brief_lines.append(f"  - `{p}`")
        brief_lines.append("")

    manifest = {
        "job_id": jid,
        "created_by": created_by,
        "created_at": _utc_now(),
        "instruction": instruction,
        "ids": [r["id"] for r in rows],
        "missing_ids": [i for i in ids if i not in {r["id"] for r in rows}],
        "items": items,
    }
    (root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (root / "BRIEF.md").write_text("\n".join(brief_lines) + "\n", encoding="utf-8")

    zip_path = root / "pack.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in root.rglob("*"):
            if path.is_file() and path.name != "pack.zip":
                zf.write(path, path.relative_to(root).as_posix())

    write_meta(
        jid,
        status="packed",
        created_by=created_by,
        created_at=_utc_now(),
        ids=manifest["ids"],
        pack_zip="pack.zip",
    )
    return jid, root


def _read_text(path: Path, limit: int = 0) -> str:
    if not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    if limit and len(text) > limit:
        return text[:limit] + "\n\n/*truncated*/"
    return text


def _effective_status(meta: dict, root: Path) -> str:
    st = str(meta.get("status") or "")
    if (root / "RESULT.md").is_file() and st in {"", "queued", "packed", "running"}:
        return "done"
    if (root / "ERROR.md").is_file() and st in {"", "queued", "packed", "running"}:
        return "error"
    return st or "unknown"


def summarize_job(job_id: str) -> Optional[dict]:
    """列表用摘要：meta + 标志位 + 反馈要点。"""
    safe = Path(job_id).name
    root = job_dir(safe)
    if not root.is_dir():
        return None
    meta = read_meta(safe) or {"job_id": safe}
    status = _effective_status(meta, root)
    ids = list(meta.get("ids") or [])
    if not ids and (root / "manifest.json").is_file():
        try:
            man = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
            ids = list(man.get("ids") or [])
            if not meta.get("created_by"):
                meta["created_by"] = man.get("created_by")
            if not meta.get("created_at"):
                meta["created_at"] = man.get("created_at")
            if man.get("instruction") and not meta.get("instruction"):
                meta["instruction"] = man.get("instruction")
        except Exception:
            pass
    feedbacks = []
    for row in load_feedback_rows(ids):
        feedbacks.append(
            {
                "id": row.get("id"),
                "status": row.get("status"),
                "feedback_type": row.get("feedback_type"),
                "content": (row.get("content") or "")[:200],
                "user": row.get("user"),
                "user_name": row.get("user_name"),
                "page": row.get("page"),
                "created_at": row.get("created_at"),
            }
        )
    result_preview = ""
    if (root / "RESULT.md").is_file():
        result_preview = _read_text(root / "RESULT.md", limit=400)
    elif (root / "ERROR.md").is_file():
        result_preview = _read_text(root / "ERROR.md", limit=400)
    return {
        "job_id": safe,
        "status": status,
        "created_by": meta.get("created_by") or "",
        "created_at": meta.get("created_at") or "",
        "started_at": meta.get("started_at") or "",
        "finished_at": meta.get("finished_at") or "",
        "agent_id": meta.get("agent_id") or "",
        "error": meta.get("error") or "",
        "instruction": meta.get("instruction") or "",
        "ids": ids,
        "feedbacks": feedbacks,
        "has_pack": (root / "pack.zip").is_file(),
        "has_result": (root / "RESULT.md").is_file(),
        "has_error": (root / "ERROR.md").is_file(),
        "has_brief": (root / "BRIEF.md").is_file(),
        "result_preview": result_preview,
        "pack_size": (root / "pack.zip").stat().st_size
        if (root / "pack.zip").is_file()
        else 0,
    }


def list_jobs(limit: int = 100) -> list[dict]:
    root = packs_root()
    dirs = [p for p in root.iterdir() if p.is_dir()]
    dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    out: list[dict] = []
    for p in dirs[: max(1, min(limit, 500))]:
        item = summarize_job(p.name)
        if item:
            out.append(item)
    return out


def job_detail(job_id: str) -> Optional[dict]:
    """详情：摘要 + BRIEF/RESULT/ERROR 全文 + manifest。"""
    summary = summarize_job(job_id)
    if not summary:
        return None
    safe = summary["job_id"]
    root = job_dir(safe)
    manifest: Any = None
    man_path = root / "manifest.json"
    if man_path.is_file():
        try:
            manifest = json.loads(man_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = None
    # 详情里反馈用库内最新全量摘要
    ids = summary.get("ids") or []
    feedbacks_full = []
    for row in load_feedback_rows(ids):
        feedbacks_full.append(
            {
                "id": row.get("id"),
                "status": row.get("status"),
                "feedback_type": row.get("feedback_type"),
                "content": row.get("content"),
                "user": row.get("user"),
                "user_name": row.get("user_name"),
                "page": row.get("page"),
                "reply": row.get("reply"),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
                "images": _parse_images(row.get("images")),
            }
        )
    return {
        **summary,
        "feedbacks": feedbacks_full,
        "brief_md": _read_text(root / "BRIEF.md"),
        "result_md": _read_text(root / "RESULT.md"),
        "error_md": _read_text(root / "ERROR.md"),
        "manifest": manifest,
    }
