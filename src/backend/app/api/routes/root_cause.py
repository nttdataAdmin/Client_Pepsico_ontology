from fastapi import APIRouter, Query

from src.backend.app.services.data_loader import DataLoader

router = APIRouter(prefix="/api/root-cause", tags=["root-cause"])
data_loader = DataLoader()


@router.get("")
async def get_root_cause_analysis(
    state: str | None = Query(None, description="Filter by state"),
    plant: str | None = Query(None, description="Filter by plant"),
    asset_id: str | None = Query(None, description="Filter by asset ID"),
    rul_threshold: int | None = Query(None, description="Filter by RUL threshold"),
):
    """Get root cause analysis flow data"""
    root_causes = data_loader.load_root_causes()

    # Apply filters if provided
    if state or plant or asset_id or rul_threshold:
        # Filter the flow data based on parameters
        filtered_data = root_causes.copy()

        # This is a simplified filter - in a real app, you'd have more complex filtering logic
        if "flow" in filtered_data:
            flow = filtered_data["flow"]
            if state and "state" in flow:
                flow["state"] = {k: v for k, v in flow.get("state", {}).items() if k == state}
            if plant and "plant" in flow:
                flow["plant"] = {k: v for k, v in flow.get("plant", {}).items() if k == plant}
            if asset_id and "asset_id" in flow:
                flow["asset_id"] = {
                    k: v for k, v in flow.get("asset_id", {}).items() if k == asset_id
                }
            if rul_threshold and "rul_threshold" in flow:
                flow["rul_threshold"] = {
                    k: v
                    for k, v in flow.get("rul_threshold", {}).items()
                    if str(k) == str(rul_threshold)
                }

        return filtered_data

    return root_causes
