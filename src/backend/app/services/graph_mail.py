"""
Send email via Microsoft Graph using MSAL client-credentials flow.
Secrets must be supplied via environment variables (see Settings).
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import httpx
from msal import ConfidentialClientApplication

from src.backend.app.config import settings

logger = logging.getLogger(__name__)

GRAPH_SCOPE = ["https://graph.microsoft.com/.default"]


def _send_mail_url(mailbox: str) -> str:
    return f"https://graph.microsoft.com/v1.0/users/{quote(mailbox, safe='')}/sendMail"


def graph_configured() -> bool:
    return bool(
        (settings.graph_tenant_id or "").strip()
        and (settings.graph_client_id or "").strip()
        and (settings.graph_client_secret or "").strip()
        and (settings.graph_mailbox_upn or "").strip()
    )


def _acquire_token() -> str:
    app = ConfidentialClientApplication(
        settings.graph_client_id,
        authority=f"https://login.microsoftonline.com/{settings.graph_tenant_id}",
        client_credential=settings.graph_client_secret,
    )
    result = app.acquire_token_for_client(scopes=GRAPH_SCOPE)
    if not result or "access_token" not in result:
        err = result.get("error_description") or result.get("error") or "unknown"
        logger.error("MSAL token error: %s", err)
        raise RuntimeError(f"Microsoft Graph authentication failed: {err}")
    return result["access_token"]


def send_work_order_notification(
    *,
    to_address: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> dict[str, Any]:
    """
    POST /users/{id}/sendMail — sends as the configured mailbox
    (application must have Mail.Send application permission.
    """
    if not graph_configured():
        raise RuntimeError(
            "Graph mail is not configured. Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, "
            "GRAPH_CLIENT_SECRET, GRAPH_MAILBOX_UPN in the backend environment."
        )

    token = _acquire_token()
    mailbox = settings.graph_mailbox_upn.strip()
    url = _send_mail_url(mailbox)

    content = (
        {"contentType": "HTML", "content": body_html}
        if body_html
        else {"contentType": "Text", "content": body_text}
    )

    payload: dict[str, Any] = {
        "message": {
            "subject": subject[:250],
            "body": content,
            "toRecipients": [{"emailAddress": {"address": to_address.strip()}}],
        },
        "saveToSentItems": True,
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=60.0) as client:
        r = client.post(url, headers=headers, json=payload)

    if r.status_code not in (202, 200):
        logger.error("Graph sendMail failed: %s %s", r.status_code, r.text)
        raise RuntimeError(f"Graph sendMail failed ({r.status_code}): {r.text[:500]}")

    return {"status": "sent", "graph_status": r.status_code}
