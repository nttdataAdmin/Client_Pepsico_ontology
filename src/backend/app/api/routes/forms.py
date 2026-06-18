import asyncio

from fastapi import APIRouter, File, Form, UploadFile

from src.backend.app.services.form_classifier import classify_upload

router = APIRouter(prefix="/api/forms", tags=["forms"])


@router.post("/classify")
async def classify_form(
    file: UploadFile = None,
    client_hint: str | None = Form(None),
):
    """
    Upload a QC form image/PDF. Classification uses filename patterns for demo samples,
    optional client_hint (go|no_go), then optional Azure Document Intelligence read + heuristics.
    """
    if file is None:
        file = File(...)

    raw = await file.read()
    ct = file.content_type or "application/octet-stream"
    name = file.filename or "upload"
    # classify_upload can block on Azure OCR — run in a thread so the event loop stays responsive.
    result = await asyncio.to_thread(classify_upload, raw, name, ct, client_hint)
    return {
        "filename": name,
        "content_type": ct,
        **result,
    }
