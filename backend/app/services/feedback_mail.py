"""反馈闭环邮件通知：仅 fixed / resolved；异步、失败不阻断主流程。"""
from __future__ import annotations

import logging
import re
import smtplib
import threading
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def smtp_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host and s.smtp_user and s.smtp_pass)


def valid_email(addr: str) -> bool:
    return bool(addr and _EMAIL_RE.match(addr.strip()))


def _send_sync(to_addr: str, subject: str, body: str) -> None:
    s = get_settings()
    host = (s.smtp_host or "").strip()
    port = int(s.smtp_port or 465)
    use_ssl = bool(s.smtp_ssl)
    user = (s.smtp_user or "").strip()
    password = s.smtp_pass or ""
    from_addr = (s.smtp_from or user).strip()

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr(("毕方反馈", from_addr))
    msg["To"] = to_addr

    if use_ssl or port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
            smtp.login(user, password)
            smtp.sendmail(from_addr, [to_addr], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.sendmail(from_addr, [to_addr], msg.as_string())


def build_mail(
    feedback_id: str,
    title: str,
    new_status: str,
    reply_summary: str,
) -> tuple[str, str]:
    s = get_settings()
    base = (s.feedback_site_base or "http://localhost:8000").rstrip("/")
    link = f"{base}/admin/feedback?id={feedback_id}"
    status_label = {
        "fixed": "待你确认是否已修复",
        "resolved": "已关闭",
    }.get(new_status, new_status)
    subject = f"[毕方反馈] {feedback_id[:8]} · {status_label}"
    body = (
        f"反馈编号：{feedback_id}\n"
        f"标题/摘要：{(title or '')[:40]}\n"
        f"新状态：{new_status}（{status_label}）\n"
        f"处理人回复：{(reply_summary or '')[:200] or '（无）'}\n"
        f"直达链接：{link}\n"
        f"（若为 localhost 链接，需在内网访问）\n"
    )
    return subject, body


def schedule_notify(
    *,
    feedback_id: str,
    to_email: str,
    title: str,
    new_status: str,
    reply_summary: str,
    on_done,  # Callable[[str, Optional[str]], None]  status, err
) -> None:
    """异步发信；on_done(notify_status, err_msg)。"""
    if new_status not in {"fixed", "resolved"}:
        on_done("skipped", "非通知事件")
        return
    if not smtp_configured():
        on_done("skipped", "未配置 SMTP")
        return
    if not valid_email(to_email):
        on_done("no_email", "提交人未填邮箱")
        return

    subject, body = build_mail(feedback_id, title, new_status, reply_summary)

    def _run():
        try:
            _send_sync(to_email.strip(), subject, body)
            on_done("sent", None)
        except Exception as e:
            # 勿打印密码；仅简短原因
            logger.warning("feedback mail failed id=%s: %s", feedback_id[:8], type(e).__name__)
            on_done("failed", f"{type(e).__name__}: {str(e)[:120]}")

    threading.Thread(target=_run, daemon=True).start()
