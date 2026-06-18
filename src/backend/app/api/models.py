from typing import Any

from pydantic import BaseModel, ConfigDict


class AssetResponse(BaseModel):
    asset_id: str
    state: str
    plant: str
    asset_type: str
    status: str
    criticality: str | None = None
    location: dict[str, float] | None = None

    class Config:
        extra = "allow"  # Allow extra fields that aren't in the model


class AssetSummaryResponse(BaseModel):
    total: int
    working: int
    failure_predicted: int
    under_maintenance: int
    breakdown: int


class AnomalyDataPoint(BaseModel):
    time: str
    vibration: float | None = None
    temperature: float | None = None


class RootCauseProbability(BaseModel):
    cause: str
    probability: float


class RecommendationRequest(BaseModel):
    """
    Legacy: asset_id + state + plant + context.
    Executive NBA path: same POST body as the former browser
    prompt (kpiDigestForAi, filterContext, …) via extra="allow".
    """

    model_config = ConfigDict(extra="allow")

    asset_id: str | None = None
    state: str | None = None
    plant: str | None = None
    context: dict[str, Any] | None = None


class AnalysisRequest(BaseModel):
    asset_id: str
    historical_data: dict[str, Any] | None = None


class AIResponse(BaseModel):
    """LLM narrative plus optional CatBoost NBA summary (no raw feature row)."""

    result: str
    nba: dict[str, Any] | None = None


class AssistantChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AssistantRequest(BaseModel):
    """Multi-turn assistant with page-scoped knowledge (RAG-style context in knowledge_base)."""

    messages: list[AssistantChatMessage]
    route: str = "/"
    page_title: str | None = None
    knowledge_base: str = ""
    ui_context: dict[str, Any] | None = None
