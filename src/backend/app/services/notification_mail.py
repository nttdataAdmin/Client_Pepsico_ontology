"""Dispatch maintenance notifications via Microsoft Graph (preferred) or SMTP."""

from __future__ import annotations

from typing import Any

from src.backend.app.services import graph_mail, smtp_mail


def mail_configured() -> bool:
    return graph_mail.graph_configured() or smtp_mail.smtp_configured()


def send_work_order_notification(
    *,
    to_address: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> dict[str, Any]:
    if graph_mail.graph_configured():
        out = graph_mail.send_work_order_notification(
            to_address=to_address,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )
        out["via"] = "graph"
        return out
    if smtp_mail.smtp_configured():
        return smtp_mail.send_work_order_notification(
            to_address=to_address,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )
    raise RuntimeError(
        "No mail transport configured. Set either Microsoft Graph "
        "(GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_MAILBOX_UPN) or "
        "SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) in backend/.env."
    )
