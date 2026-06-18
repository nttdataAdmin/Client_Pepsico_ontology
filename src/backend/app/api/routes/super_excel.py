from typing import Any

from fastapi import APIRouter, HTTPException

from src.backend.app.services.super_excel_loader import load_super_excel

router = APIRouter(prefix="/api/super-excel", tags=["super-excel"])

_cache: dict[str, Any] = {}


def _bundle() -> dict[str, Any]:
    if "bundle" not in _cache:
        _cache["bundle"] = load_super_excel()
    return _cache["bundle"]


@router.get("")
async def get_all_sheets():
    """All sheets from super_excel.xlsx as column names + row records."""
    return _bundle()


@router.post("/reload")
async def reload_excel():
    """Clear cache and reload from disk (after replacing the xlsx)."""
    _cache.clear()
    return _bundle()


@router.get("/sheets/{sheet_name}")
async def get_one_sheet(sheet_name: str):
    b = _bundle()
    sheets = b.get("sheets") or {}
    if sheet_name not in sheets:
        raise HTTPException(status_code=404, detail="sheet_not_found")
    return {"sheet_name": sheet_name, **sheets[sheet_name]}
