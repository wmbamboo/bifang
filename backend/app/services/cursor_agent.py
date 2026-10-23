"""Cursor SDK Local Agent：处理反馈包并写 RESULT.md。"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.config import get_settings
from app.services.feedback_pack import write_meta


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _prompt_for(job_dir: Path, instruction: str = "") -> str:
    brief = job_dir / "BRIEF.md"
    manifest = job_dir / "manifest.json"
    images = job_dir / "images"
    result = job_dir / "RESULT.md"
    extra = f"\n补充说明：\n{instruction.strip()}\n" if instruction.strip() else ""
    return f"""你是毕方（bifang）仓库的本地修复 Agent。请根据反馈包修复相关缺陷。

工作区：当前 cwd 即为毕方仓库根目录。
反馈包目录（绝对路径）：
- BRIEF: {brief.resolve()}
- manifest: {manifest.resolve()}
- images: {images.resolve()}
{extra}
要求：
1. 先读 BRIEF.md 与 manifest.json，必要时查看 images/ 截图。
2. 只改本仓库与这些反馈相关的代码；不要改密码策略、鉴权白名单、删除用户数据。
3. 完成后在包目录写入 RESULT.md（路径：{result.resolve()}），说明：改了哪些文件、未改原因、建议验收步骤。
4. 不要自动修改反馈系统里的反馈状态（fixed/resolved）；状态由人工推进。
5. 若无法修复，仍写 RESULT.md，写明阻塞原因。
"""


def run_cursor_agent(job_id: str, job_dir: Path, *, instruction: str = "") -> None:
    """同步调用；应在线程池中执行。成功写 RESULT.md，失败写 ERROR.md 并更新 meta。"""
    settings = get_settings()
    key = (settings.cursor_api_key or "").strip()
    if not key:
        msg = "未配置 CURSOR_API_KEY，请在 backend/.env 填写后重启服务"
        (job_dir / "ERROR.md").write_text(msg + "\n", encoding="utf-8")
        write_meta(
            job_id,
            status="error",
            error=msg,
            finished_at=_utc_now(),
        )
        return

    write_meta(job_id, status="running", started_at=_utc_now())
    repo = settings.repo_root
    model = (settings.cursor_agent_model or "composer-2.5").strip()
    prompt = _prompt_for(job_dir, instruction)

    try:
        from cursor_sdk import Agent, AgentOptions, LocalAgentOptions
    except ImportError as ex:
        msg = f"未安装 cursor-sdk：{ex}"
        (job_dir / "ERROR.md").write_text(msg + "\n", encoding="utf-8")
        write_meta(job_id, status="error", error=msg, finished_at=_utc_now())
        return

    agent_id: Optional[str] = None
    try:
        result = Agent.prompt(
            prompt,
            AgentOptions(
                api_key=key,
                model=model,
                local=LocalAgentOptions(cwd=str(repo)),
            ),
        )
        status = getattr(result, "status", None) or ""
        agent_id = getattr(result, "agent_id", None) or getattr(result, "id", None)
        text = getattr(result, "result", None) or getattr(result, "text", None) or ""
        result_path = job_dir / "RESULT.md"
        if not result_path.exists():
            body = [
                "# RESULT（SDK 回写）",
                "",
                f"- status: `{status}`",
                "",
                str(text) if text else "（Agent 未写 RESULT.md；以上为 SDK 返回摘要）",
                "",
            ]
            result_path.write_text("\n".join(body), encoding="utf-8")
        if str(status).lower() in {"error", "failed"}:
            write_meta(
                job_id,
                status="error",
                error=f"agent status={status}",
                agent_id=agent_id,
                finished_at=_utc_now(),
            )
        else:
            write_meta(
                job_id,
                status="done",
                agent_id=agent_id,
                finished_at=_utc_now(),
            )
    except Exception as ex:
        msg = f"Cursor Agent 失败：{ex}"
        (job_dir / "ERROR.md").write_text(msg + "\n", encoding="utf-8")
        write_meta(
            job_id,
            status="error",
            error=msg,
            agent_id=agent_id,
            finished_at=_utc_now(),
        )
