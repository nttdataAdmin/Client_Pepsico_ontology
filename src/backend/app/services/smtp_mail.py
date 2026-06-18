"""Send work-order notification email via SMTP (fallback when Microsoft Graph is not configured)."""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from src.backend.app.config import settings

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(
        (settings.smtp_host or "").strip()
        and (settings.smtp_user or "").strip()
        and (settings.smtp_password or "").strip()
    )


def _from_address() -> str:
    return (settings.smtp_from or settings.smtp_user or "").strip()


def send_work_order_notification(
    *,
    to_address: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> dict[str, Any]:
    if not smtp_configured():
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and "
            "SMTP_PASSWORD (optional SMTP_FROM) in the backend .env."
        )

    host = settings.smtp_host.strip()
    port = int(settings.smtp_port or 587)
    user = settings.smtp_user.strip()
    password = settings.smtp_password
    from_addr = _from_address()
    to_addr = to_address.strip()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject[:250]
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=60) as server:
            if settings.smtp_use_tls:
                server.starttls()
            server.login(user, password)
            server.sendmail(from_addr, [to_addr], msg.as_string())
    except OSError as e:
        logger.exception("SMTP connection failed")
        raise RuntimeError(f"SMTP connection failed: {e}") from e
    except smtplib.SMTPException as e:
        logger.exception("SMTP send failed")
        raise RuntimeError(f"SMTP send failed: {e}") from e

    return {"status": "sent", "via": "smtp"}
