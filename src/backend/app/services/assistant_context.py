"""Compact JSON snapshots for the in-app assistant (grounding in backend data)."""

import json
from typing import Any

from src.backend.app.services.data_loader import DataLoader


def _status_breakdown(rows: list[dict[str, Any]]) -> dict[str, int]:
    out = {"working": 0, "failure_predicted": 0, "under_maintenance": 0, "breakdown": 0, "other": 0}
    for a in rows:
        s = str(a.get("status", "")).lower()
        if s == "working":
            out["working"] += 1
        elif s == "failure predicted":
            out["failure_predicted"] += 1
        elif s == "under maintenance":
            out["under_maintenance"] += 1
        elif s == "breakdown":
            out["breakdown"] += 1
        else:
            out["other"] += 1
    return out


def _processing_lens_snapshot() -> str:
    """Server CSV/JSON match packaging mock; UI uses separate processing
    dataset — avoid contradicting the client."""
    pack = {
        "operator_lens": "processing",
        "assistant_instruction": (
            "This session is PROCESSING line operator lens. The browser shows an embedded "
            "processing-specific dataset (assets, anomalies, RCA, recommendations, maintenance) "
            "that differs from packaging. The KNOWLEDGE BASE block titled 'Current screen data "
            "(live)' is authoritative for every fact about what the user sees — asset IDs, "
            "statuses, RUL, anomaly samples, work orders, and root-cause causes. Do not invent "
            "packaging-line narratives (palletizer, case sealer) when the screen data describes "
            "fryer, thermal oil, seasoning train, etc."
        ),
    }
    return json.dumps(pack, indent=2)


def build_executive_assistant_snapshot(
    data_loader: DataLoader,
    ui_context: dict[str, Any] | None,
    client_route: str = "",
) -> str:
    ctx = ui_context or {}
    op_role = str(ctx.get("operatorRole") or "packaging").strip().lower()
    if op_role == "processing":
        return _processing_lens_snapshot()

    filters = ctx.get("filters") or {}
    state = filters.get("state")
    plant = filters.get("plant")
    asset_id = filters.get("asset_id")

    summary_all = data_loader.get_asset_summary()
    filtered_assets = data_loader.get_assets_filtered(state=state, plant=plant, asset_id=asset_id)
    filtered_ids = {a.get("asset_id") for a in filtered_assets if a.get("asset_id")}

    anomalies = data_loader.load_anomalies()
    if filtered_ids:
        anomalies_scoped = [r for r in anomalies if r.get("asset_id") in filtered_ids]
    else:
        anomalies_scoped = anomalies

    recommendations = data_loader.load_recommendations()
    maintenance = data_loader.load_maintenance()
    root = data_loader.load_root_causes()
    root_keys = list(root.keys()) if isinstance(root, dict) else None

    pack: dict[str, Any] = {
        "app": "PepsiCo Management System demo",
        "operator_lens": "packaging",
        "client_route": client_route,
        "data_sources": (
            "backend/data: assets.json, anomalies.csv, recommendations.csv, "
            "maintenance.csv, root_causes.json"
        ),
        "period_ui": {"month": ctx.get("selectedMonth"), "year": ctx.get("selectedYear")},
        "filters": {"state": state, "plant": plant, "asset_id": asset_id},
        "fleet_summary_unfiltered": summary_all,
        "filtered_asset_count": len(filtered_assets),
        "filtered_status_breakdown": _status_breakdown(filtered_assets),
        "filtered_assets": filtered_assets[:60],
        "anomaly_rows_scoped_sample": anomalies_scoped[:100],
        "anomaly_rows_total_in_dataset": len(anomalies),
        "recommendations_sample": recommendations[:60],
        "maintenance_sample": maintenance[:60],
        "root_causes_json_top_level_keys": root_keys,
    }

    raw = json.dumps(pack, indent=2, default=str)
    return raw[:100000]
