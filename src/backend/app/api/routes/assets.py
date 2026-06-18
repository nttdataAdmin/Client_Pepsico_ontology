from fastapi import APIRouter, Query

from src.backend.app.services.data_loader import DataLoader

router = APIRouter(prefix="/api/assets", tags=["assets"])
data_loader = DataLoader()


@router.get("")
async def get_assets(
    state: str | None = Query(None, description="Filter by state"),
    plant: str | None = Query(None, description="Filter by plant"),
    asset_id: str | None = Query(None, description="Filter by asset ID"),
):
    """Get assets with optional filters"""
    assets = data_loader.get_assets_filtered(state=state, plant=plant, asset_id=asset_id)
    return assets


@router.get("/summary")
async def get_asset_summary():
    """Get asset status summary"""
    summary = data_loader.get_asset_summary()
    return summary
