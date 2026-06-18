"""Classify QC form scans as go vs no_go (demo heuristics + optional Azure Read OCR)."""

from __future__ import annotations

import re
import time
from typing import Any

import httpx

from src.backend.app.config import settings

NO_GO_TOKENS = re.compile(
    r"(no[\s\-]?go\b|\brt\b|\bra\b|^\s*no\s*$)",
    re.IGNORECASE | re.MULTILINE,
)


def _stem_and_lower(filename: str) -> tuple[str, str, str]:
    """Return (lower_full_name, stem_without_ext, ext_or_empty)."""
    if not filename:
        return "", "", ""
    lower = filename.lower().replace("\\", "/").split("/")[-1]
    base, _dot, ext = lower.rpartition(".")
    stem = (
        base
        if ext
        in (
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
            "tif",
            "tiff",
            "pdf",
            "svg",
        )
        else lower
    )
    return lower, stem, ext


def classify_from_filename(filename: str) -> str | None:
    lower, stem, _ext = _stem_and_lower(filename)
    if not lower:
        return None
    if stem == "img7719":
        return "go"
    if stem == "img7720":
        return "no_go"
    if stem == "go":
        return "go"
    if stem == "nogo":
        return "no_go"
    if "nogo" in lower or "no_go" in lower or "no-go" in lower:
        return "no_go"
    if "handwritten_fl5883" in lower or "fl5883_handwritten" in lower:
        return "go" if "nogo" not in lower.replace("-", "") else "no_go"
    if "sample_form_go" in lower or lower.endswith("_go.svg") or lower.endswith("_go.png"):
        return "go"
    if "sample_form_nogo" in lower or lower.endswith("_nogo.svg") or lower.endswith("_nogo.png"):
        return "no_go"
    if re.search(r"(^|[^a-z])go([^a-z]|$)", lower) and "nogo" not in lower.replace("-", ""):
        if "no_go" in lower or "no-go" in lower:
            return "no_go"
        return "go"
    return None


def explain_filename_no_go_rule(filename: str) -> str:
    """Which filename demo rule fired (only meaningful when classify_from_filename is no_go)."""
    lower, stem, _ext = _stem_and_lower(filename)
    if not lower:
        return "File name was empty."
    if stem == "img7720":
        return "Demo rule: image stem «img7720» is mapped to a failed package-quality gate (No-Go)."
    if stem == "nogo":
        return (
            "Demo rule: file stem «nogo» is the shorthand No-Go sample "
            "(same as nogo.png in the repo)."
        )
    if "nogo" in lower or "no_go" in lower or "no-go" in lower:
        return (
            "Demo rule: the name contains «nogo», «no_go», or «no-go», "
            "which flags this upload as No-Go."
        )
    if ("handwritten_fl5883" in lower or "fl5883_handwritten" in lower) and "nogo" in lower.replace(
        "-", ""
    ):
        return (
            "Demo rule: FL-5883 handwritten asset path includes a No-Go variant in the file name."
        )
    if "sample_form_nogo" in lower or lower.endswith("_nogo.svg") or lower.endswith("_nogo.png"):
        return (
            "Demo rule: «sample_form_nogo» or a «_nogo» suffix marks "
            "this file as the No-Go sample form."
        )
    if (
        re.search(r"(^|[^a-z])go([^a-z]|$)", lower)
        and "nogo" not in lower.replace("-", "")
        and ("no_go" in lower or "no-go" in lower)
    ):
        return "Demo rule: file name mixes «go» with «no_go» / «no-go» — treated as No-Go."
    return (
        "Demo rule: file name matched the configured No-Go filename pattern for this environment."
    )


def _azure_endpoint_base() -> str:
    u = (settings.azure_doc_intelligence_endpoint or "").strip().rstrip("/")
    return u


def _azure_read_markdown(content: bytes, content_type: str) -> tuple[str, str | None]:
    endpoint = _azure_endpoint_base()
    key = (settings.azure_doc_intelligence_key or "").strip()
    if not endpoint or not key:
        return "", "azure_not_configured"

    # Document Intelligence 4.0 REST — prebuilt-read
    url = (
        f"{endpoint}/documentintelligence/documentModels/prebuilt-read:analyze"
        f"?api-version=2024-11-30"
    )
    headers = {"Ocp-Apim-Subscription-Key": key, "Content-Type": content_type}

    with httpx.Client(timeout=120.0) as client:
        r = client.post(url, content=content, headers=headers)
        if r.status_code not in (200, 202):
            return "", f"azure_http_{r.status_code}:{r.text[:200]}"

        op_loc = r.headers.get("operation-location") or r.headers.get("Operation-Location")
        if not op_loc:
            return "", "azure_no_operation_location"

        for _ in range(60):
            pr = client.get(op_loc, headers={"Ocp-Apim-Subscription-Key": key})
            body = pr.json() if pr.content else {}
            status = (body.get("status") or "").lower()
            if status == "succeeded":
                analyze = body.get("analyzeResult") or body
                content_md = analyze.get("content") or ""
                return content_md, None
            if status == "failed":
                err = body.get("error", {})
                return "", f"azure_failed:{err}"
            time.sleep(1)

    return "", "azure_poll_timeout"


def _reason_human(code: str) -> str:
    mapping = {
        "ocr_failure_mark_near_keyword": (
            "OCR text contains a failure or No-Go style keyword with a check"
            " / X / «checked» pattern very close to it (same row or nearby characters)."
        ),
        "repeated_failure_tokens": (
            "OCR text contains many standalone failure or No-Go tokens — more than we allow before "
            " treating the read as evidence of a bad gate."
        ),
    }
    return mapping.get(code, code.replace("_", " ").capitalize())


def _build_no_go_narrative(method: str, details: dict[str, Any], filename: str) -> dict[str, Any]:
    """
    Structured explanation for the UI: what was extracted / used,
    why that maps to No-Go, and step bullets.
    """
    fn = (details.get("filename") or filename or "").strip() or "«unknown file»"
    lines: list[str] = []
    extraction_summary = ""
    why_no_go = ""

    if method == "filename":
        extraction_summary = (
            "We did not run OCR on this path. The only signal evaluated was "
            f"the upload file name: «{fn}». "
            "Content inside the PDF or image was not parsed for this classification."
        )
        rule = explain_filename_no_go_rule(fn)
        why_no_go = (
            "Because that name matches a configured demo No-Go rule, "
            "the package-quality gate is recorded as failed so you can walk the supervisor and "
            "remediation flow (same as a real No-Go outcome in this demo)."
        )
        lines = [
            f"What we used: file name only — «{fn}».",
            f"What matched: {rule}",
            "Why No-Go: filename demo rules map this signal to a failed gate; "
            "use the breakdown below with your team.",
        ]
    elif method == "client_hint":
        extraction_summary = (
            "The server did not evaluate pixels or OCR text for this request. "
            "It honored an explicit client hint "
            "(«no_go» / «nogo») sent with the upload — typical for demos and automated tests."
        )
        why_no_go = (
            "The hint forces No-Go regardless of file content so the "
            "exception workflow can be exercised predictably."
        )
        lines = [
            "What we used: client-supplied classification hint (not document text).",
            "What matched: explicit No-Go / nogo hint on the request.",
            "Why No-Go: intentional override for demo or QA — not inferred from the form scan.",
        ]
    elif method == "azure_read_heuristic":
        ocr_n = int(details.get("ocr_char_count") or 0)
        prev = (details.get("ocr_preview") or "").strip()
        reasons = list(details.get("reasons") or [])
        extraction_summary = (
            f"We ran Azure Document Intelligence (prebuilt Read) and extracted {ocr_n} characters "
            "of text from your file. The classifier inspected the beginning of that text (the API "
            "returns roughly the first 500 characters as a preview)."
        )
        if prev:
            snippet = prev[:320].replace("\n", " ")
            if len(prev) > 320:
                snippet += "…"
            extraction_summary += f" First segment the rules saw: «{snippet}»."

        if "ocr_failure_mark_near_keyword" in reasons:
            why_no_go = (
                "That excerpt looks like a failure or No-Go column was marked "
                "(keyword plus check / X / «checked» nearby). "
                "We treat that as the line failing the package-quality gate."
            )
        elif "repeated_failure_tokens" in reasons:
            why_no_go = (
                "The read text repeats failure or No-Go language enough times that our demo "
                "threshold treats it as evidence of a bad read or a truly failed form, not a "
                "single stray header word."
            )
        else:
            why_no_go = (
                "Heuristic rules on the OCR text mapped this upload to No-Go for this environment."
            )

        lines = [
            f"What we used: {ocr_n} characters of OCR text from your document (see extraction "
            "summary for the excerpt)."
        ]
        for r in reasons:
            lines.append(f"Signal from text: {_reason_human(str(r))}")
        lines.append(
            "Why No-Go: the combination of extracted wording and marks crossed the classifier "
            "rules described above."
        )
    else:
        ocr_err = details.get("ocr_error")
        extraction_summary = (
            "The file name did not match a known demo pattern, and we did not obtain usable OCR "
            "text for heuristics (OCR may be off or Azure not configured)."
        )
        if ocr_err:
            extraction_summary += f" Technical note: {ocr_err}."
        why_no_go = (
            "This install's default for «unknown» uploads is No-Go, so the gate stays closed until "
            "a human reviews the file."
        )
        lines = [
            "What we used: no filename rule match and no OCR text passed into the heuristic.",
            "Why No-Go: configured default path for unrecognized uploads in this environment.",
        ]

    return {
        "breakdown": lines,
        "why_no_go": why_no_go,
        "extraction_summary": extraction_summary,
    }


def classify_from_ocr_text(text: str) -> tuple[str, list[str]]:
    """
    Heuristic: real forms always contain the words NO-GO in headers.
    We look for lines that suggest a mark in a failure column (very approximate).
    """
    reasons: list[str] = []
    if not text or len(text.strip()) < 20:
        return "go", reasons

    t = text
    # Strong signals: checked / X near failure keywords (best-effort)
    failure_line = re.compile(
        r".{0,40}(NO[\s\-]?GO|RTA|\bRA\b|\bNO\b).{0,40}([xX✓√■◼]|checked|selected)",
        re.IGNORECASE,
    )
    if failure_line.search(t):
        reasons.append("ocr_failure_mark_near_keyword")
        return "no_go", reasons

    # Weak: multiple standalone NO-GO tokens beyond first screen (headers repeat less in body)
    matches = list(NO_GO_TOKENS.finditer(t))
    if len(matches) >= 4:
        reasons.append("repeated_failure_tokens")
        return "no_go", reasons

    return "go", reasons


def classify_upload(
    file_bytes: bytes,
    filename: str,
    content_type: str,
    client_hint: str | None = None,
) -> dict[str, Any]:
    """
    Returns classification, method, confidence, details, and for no_go also:
    breakdown (list), why_no_go (one paragraph), extraction_summary (what was read / used).
    """
    hint = (client_hint or "").strip().lower()
    if hint in ("go", "no_go", "nogo"):
        c = "no_go" if hint == "nogo" else hint
        details = {}
        out: dict[str, Any] = {
            "classification": c,
            "method": "client_hint",
            "confidence": "high",
            "details": details,
        }
        if c == "no_go":
            narr = _build_no_go_narrative("client_hint", details, filename)
            out["breakdown"] = narr["breakdown"]
            out["why_no_go"] = narr["why_no_go"]
            out["extraction_summary"] = narr["extraction_summary"]
        else:
            out["breakdown"] = []
        return out

    by_name = classify_from_filename(filename)
    if by_name:
        details = {"filename": filename}
        out = {
            "classification": by_name,
            "method": "filename",
            "confidence": "high",
            "details": details,
        }
        if by_name == "no_go":
            narr = _build_no_go_narrative("filename", details, filename)
            out["breakdown"] = narr["breakdown"]
            out["why_no_go"] = narr["why_no_go"]
            out["extraction_summary"] = narr["extraction_summary"]
        else:
            out["breakdown"] = []
        return out

    ocr_text = ""
    ocr_err = None
    if settings.azure_doc_intelligence_use_ocr:
        ocr_text, ocr_err = _azure_read_markdown(
            file_bytes, content_type or "application/octet-stream"
        )

    if ocr_text:
        c, reasons = classify_from_ocr_text(ocr_text)
        details = {
            "ocr_error": ocr_err,
            "reasons": reasons,
            "ocr_preview": ocr_text[:500],
            "ocr_char_count": len(ocr_text),
        }
        out = {
            "classification": c,
            "method": "azure_read_heuristic",
            "confidence": "medium",
            "details": details,
        }
        if c == "no_go":
            narr = _build_no_go_narrative("azure_read_heuristic", details, filename)
            out["breakdown"] = narr["breakdown"]
            out["why_no_go"] = narr["why_no_go"]
            out["extraction_summary"] = narr["extraction_summary"]
        else:
            out["breakdown"] = []
        return out

    # No OCR / failed: safe default for demo — treat as go with low confidence (avoid false alarm)
    default = (settings.form_classify_default or "go").strip().lower()
    if default not in ("go", "no_go"):
        default = "go"
    details = {"ocr_error": ocr_err, "note": "upload_unrecognized_use_filename_or_enable_azure"}
    out = {
        "classification": default,
        "method": "default",
        "confidence": "low",
        "details": details,
    }
    if default == "no_go":
        narr = _build_no_go_narrative("default", details, filename)
        out["breakdown"] = narr["breakdown"]
        out["why_no_go"] = narr["why_no_go"]
        out["extraction_summary"] = narr["extraction_summary"]
    else:
        out["breakdown"] = []
    return out
