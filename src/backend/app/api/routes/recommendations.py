from typing import Any

from fastapi import APIRouter, Query

from src.backend.app.services.data_loader import DataLoader

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])
data_loader = DataLoader()


@router.get("")
async def get_recommendations(
    state: str | None = Query(None, description="Filter by state"),
    plant: str | None = Query(None, description="Filter by plant"),
    asset_id: str | None = Query(None, description="Filter by asset ID"),
    year: int | None = Query(None, description="Filter by year"),
    month: str | None = Query(None, description="Filter by month"),
):
    """Get recommendations data"""
    rows: list[dict[str, Any]] = data_loader.load_recommendations()
    if not rows:
        return []

    def col(name: str) -> bool:
        return name in rows[0]

    out = rows
    if state and col("state"):
        out = [r for r in out if r.get("state") == state]
    if plant and col("plant"):
        out = [r for r in out if r.get("plant") == plant]
    if asset_id and col("asset_id"):
        out = [r for r in out if r.get("asset_id") == asset_id]
    if year is not None and col("year"):
        out = [r for r in out if str(r.get("year", "")) == str(year)]
    if month and col("month"):
        out = [r for r in out if r.get("month") == month]
    return out
