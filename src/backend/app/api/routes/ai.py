from typing import Any

from fastapi import APIRouter

from src.backend.app.api.models import (
    AIResponse,
    AnalysisRequest,
    AssistantRequest,
    RecommendationRequest,
)
from src.backend.app.services.ai_service import AIService
from src.backend.app.services.assistant_context import build_executive_assistant_snapshot
from src.backend.app.services.data_loader import DataLoader

router = APIRouter(prefix="/api/ai", tags=["ai"])
ai_service = AIService()
data_loader = DataLoader()


def _is_executive_nba_payload(body: dict[str, Any]) -> bool:
    """Detect full Executive Summary modal payload (vs legacy asset_id/state/plant only)."""
    return (
        body.get("kpiDigestForAi")
        or body.get("timestamp")
        or body.get("filterContext") is not None
        or body.get("month") is not None
        or body.get("year") is not None
    )


@router.post("/recommendations", response_model=AIResponse)
async def get_ai_recommendations(request: RecommendationRequest):
    """CatBoost next-best-action + LLM narrative; accepts legacy or executive payload."""
    raw = request.model_dump(mode="json", exclude_none=True)
    ctx = raw.get("context")
    clean: dict[str, Any] = {k: v for k, v in raw.items() if k != "context"}

    if _is_executive_nba_payload(clean):
        asset_data: dict[str, Any] = dict(clean)
        if clean.get("asset_id"):
            rows = data_loader.get_assets_filtered(
                state=clean.get("state"),
                plant=clean.get("plant"),
                asset_id=clean.get("asset_id"),
            )
            if rows:
                asset_data = {**rows[0], **clean}
        recommendation, nba_public = ai_service.generate_recommendations(
            asset_data=asset_data,
            context=ctx if isinstance(ctx, dict) else None,
        )
        return AIResponse(result=recommendation, nba=nba_public)

    assets = data_loader.get_assets_filtered(
        state=request.state,
        plant=request.plant,
        asset_id=request.asset_id,
    )

    if not assets:
        return AIResponse(result="No assets found matching the criteria.")

    asset_data = assets[0] if len(assets) == 1 else {"assets": assets}

    recommendation, nba_public = ai_service.generate_recommendations(
        asset_data=asset_data,
        context=ctx if isinstance(ctx, dict) else None,
    )

    return AIResponse(result=recommendation, nba=nba_public)


@router.post("/analysis", response_model=AIResponse)
async def get_ai_analysis(request: AnalysisRequest):
    """Get AI-generated analysis for a specific asset"""
    # Get asset data
    assets = data_loader.get_assets_filtered(asset_id=request.asset_id)

    if not assets:
        return AIResponse(result=f"No asset found with ID: {request.asset_id}")

    asset_data = assets[0]

    anomalies = data_loader.load_anomalies()
    asset_anomalies = [r for r in anomalies if r.get("asset_id") == request.asset_id]

    historical_data = request.historical_data or {}
    if asset_anomalies:
        historical_data["anomalies"] = asset_anomalies

    # Generate analysis
    analysis = ai_service.generate_analysis(
        asset_id=request.asset_id,
        asset_data=asset_data,
        historical_data=historical_data if historical_data else None,
    )

    return AIResponse(result=analysis)


ASSISTANT_ALLOWED_ROUTES = frozenset(
    {
        "/executive-summary",
        "/anomalies",
        "/root-cause",
        "/recommendations",
        "/maintenance",
    }
)


@router.post("/assistant", response_model=AIResponse)
async def assistant_chat(request: AssistantRequest):
    """Dashboard assistant (all steps except login/upload); merges backend dataset snapshot."""
    route = (request.route or "").strip().rstrip("/") or "/"
    if route not in ASSISTANT_ALLOWED_ROUTES:
        return AIResponse(
            result=(
                "The assistant is available on dashboard steps (Executive summary, Anomalies, "
                "Root cause, Recommendations, Maintenance), not on Login or Upload."
            )
        )

    kb = (request.knowledge_base or "").strip()
    try:
        snap = build_executive_assistant_snapshot(
            data_loader, request.ui_context, client_route=route
        )
        kb = (
            f"{kb}\n\n"
            "--- Server grounding (packaging CSV/JSON snapshot, or "
            "processing-lens instruction) ---\n"
            f"{snap}"
        )
    except Exception as e:
        kb = f"{kb}\n\n(Backend data snapshot failed: {e})"

    payload = [{"role": m.role, "content": m.content} for m in request.messages]
    text = ai_service.assistant_chat(
        messages=payload,
        route=request.route,
        page_title=request.page_title,
        knowledge_base=kb,
        ui_context=request.ui_context,
    )
    return AIResponse(result=text)
