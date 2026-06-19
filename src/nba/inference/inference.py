"""
Score candidate remediation actions for a live situation using the trained NBA model.

Reads artifacts from `src/nba/model/output/` (produced by `nba_training.py`):
  - final_model.cbm
  - nba_metrics.json  (model family + feature metadata)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from src.backend.app.services.nba_features import build_full_feature_row
from src.nba.model_functions import _cast_categoricals, _model_predict

NBA_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = NBA_DIR / "model"
OUTPUT_DIR = MODEL_DIR / "output"
DEMO_SITUATION_PATH = Path(__file__).resolve().parent / "demo_situation.json"

DEFAULT_CANDIDATES = [0, 1, 2, 3, 4, 5, 6, 7]

ACTION_LABELS: dict[int, str] = {
    0: "Continue monitoring",
    1: "Schedule preventive maintenance",
    2: "Immediate inspection + isolation",
    3: "Replace / repair component",
    4: "Adjust process parameters",
    5: "Clean / lubricate / calibrate",
    6: "Reduce speed / throttle output",
    7: "Escalate to specialist team",
}


def _load_artifacts() -> tuple[Any, str, list[str], list[str]]:
    metrics_path = OUTPUT_DIR / "nba_metrics.json"
    model_path = OUTPUT_DIR / "final_model.cbm"

    if not metrics_path.is_file():
        raise FileNotFoundError(f"Missing metrics file: {metrics_path}")
    if not model_path.is_file():
        raise FileNotFoundError(f"Missing model file: {model_path}. Run nba_training.py first.")

    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    model_family = str(metrics["selected_model_family"])
    feature_order = list(metrics["feature_order"])
    cat_feature_names = list(metrics["cat_feature_names"])

    if model_family == "catboost":
        from catboost import CatBoostRegressor

        model = CatBoostRegressor()
        model.load_model(str(model_path))
    elif model_family == "xgboost":
        import xgboost as xgb

        model = xgb.XGBRegressor()
        model.load_model(str(model_path))
    else:
        raise ValueError(f"Unsupported model family: {model_family}")

    return model, model_family, feature_order, cat_feature_names


def score_situation(
    situation: Mapping[str, Any],
    candidate_action_ids: list[int] | None = None,
    action_history: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return ranked predictions for each candidate action on one situation."""
    model, model_family, feature_order, cat_feature_names = _load_artifacts()
    candidates = candidate_action_ids or list(DEFAULT_CANDIDATES)

    rows: list[dict[str, Any]] = []
    for action_id in candidates:
        row = build_full_feature_row(situation, action_id, action_history)
        rows.append(row)

    df = pd.DataFrame(rows)[feature_order]
    df = _cast_categoricals(df, model_family, cat_feature_names)

    if model_family == "catboost":
        cat_idx = [feature_order.index(c) for c in cat_feature_names if c in feature_order]
    else:
        cat_idx = None

    preds = _model_predict(model_family, model, df, cat_features=cat_idx)

    scored: list[dict[str, Any]] = []
    for action_id, pred in zip(candidates, preds, strict=True):
        scored.append(
            {
                "action_id": int(action_id),
                "title": ACTION_LABELS.get(int(action_id), f"Action {action_id}"),
                "predicted_weighted_kpi_impact": round(float(pred), 4),
            }
        )

    scored.sort(key=lambda item: item["predicted_weighted_kpi_impact"], reverse=True)
    return scored


def recommend(
    situation: Mapping[str, Any],
    candidate_action_ids: list[int] | None = None,
    action_history: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Pick the best action and return the full ranked list."""
    ranked = score_situation(situation, candidate_action_ids, action_history)
    winner = ranked[0]
    return {
        "recommended_action_id": winner["action_id"],
        "recommended_title": winner["title"],
        "predicted_weighted_kpi_impact": winner["predicted_weighted_kpi_impact"],
        "ranked_actions": ranked,
        "situation_summary": {
            "status": situation.get("status"),
            "criticality": situation.get("criticality"),
            "asset_type": situation.get("asset_type"),
            "plant": situation.get("plant"),
            "state": situation.get("state"),
        },
    }


def load_demo_situation() -> dict[str, Any]:
    """Default demo situation (training event EV-00008)."""
    return json.loads(DEMO_SITUATION_PATH.read_text(encoding="utf-8"))


def _print_results(result: dict[str, Any]) -> None:
    summary = result["situation_summary"]
    print("=== NBA Inference ===")
    print(
        f"Situation: {summary['status']} | {summary['criticality']} criticality | "
        f"{summary['asset_type']} @ {summary['plant']}, {summary['state']}"
    )
    print(
        f"\nRecommended: Action {result['recommended_action_id']} - "
        f"{result['recommended_title']}"
    )
    print(
        f"Predicted weighted KPI impact: {result['predicted_weighted_kpi_impact']:.4f}  "
        "(0-1, higher is better)"
    )
    print("\nAll candidate actions (ranked):")
    print(f"{'Rank':<5} {'Action':<7} {'Score':<8} Title")
    print("-" * 60)
    for rank, row in enumerate(result["ranked_actions"], start=1):
        marker = " <-- BEST" if rank == 1 else ""
        print(
            f"{rank:<5} {row['action_id']:<7} {row['predicted_weighted_kpi_impact']:<8.4f} "
            f"{row['title']}{marker}"
        )


def main() -> int:
    try:
        result = recommend(load_demo_situation())
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    _print_results(result)
    return 0
