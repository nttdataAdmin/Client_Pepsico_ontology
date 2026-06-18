"""
Ensemble Recommendation Engine: CatBoost + XGBoost, "more-accurate engine wins".

Both regressors are trained on the same dataset, the same feature manifest,
the same target (`weighted_kpi_impact`), and the same sequential hold-out
split. After training, each engine reports hold-out RMSE / R² in its
`nba_metrics*.json`. The ensemble decides per request which engine is the
"accuracy leader" (lower hold-out RMSE; ties broken by higher R²) and then
uses THAT engine's score for every candidate. We do NOT average the two
engines anymore — the user wants the recommendation to be driven by the
model with the better hold-out accuracy, period.

The ensemble flow reuses the CatBoost service's helpers verbatim — there is
exactly one source of truth for:

* candidate generation (`_generate_candidates`)
* soft-penalty engine (`_soft_penalty`)
* tie-break ordering (`_tie_break`)
* hard-constraint summary (`_constraints_summary`)
* action metadata (`_action_meta`)
* rule-based fallback (`_rule_fallback`)

The only ensemble-specific step is: for each candidate, score with BOTH
engines so the UI can show what each one said, then take the score from the
accuracy leader as `model_score`, run that through the same penalty +
tie-break.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Mapping, Optional, Tuple

from app.services.nba_features import build_full_feature_row
from app.services.nba_history import history_count_for, history_for_status
from app.services.nba_service import nba_service as cat_nba_service
from app.services.nba_service_xgb import xgb_nba_service

logger = logging.getLogger(__name__)


def _per_engine_score_safe(svc, situation, action_id, action_history) -> float:
    try:
        return float(svc._score_candidate(situation, action_id, action_history))
    except Exception as e:  # noqa: BLE001 — engine errors must not kill the response
        logger.warning("Engine %s score for action %s failed: %s", type(svc).__name__, action_id, e)
        return 0.0


def _holdout_metric(metrics: Optional[Dict[str, Any]], key: str) -> Optional[float]:
    if not isinstance(metrics, dict):
        return None
    holdout = metrics.get("holdout") if isinstance(metrics.get("holdout"), dict) else None
    if not holdout:
        return None
    v = holdout.get(key)
    return float(v) if isinstance(v, (int, float)) else None


def _resolve_accuracy_leader(
    cat_ok: bool,
    xgb_ok: bool,
    cat_metrics: Optional[Dict[str, Any]],
    xgb_metrics: Optional[Dict[str, Any]],
) -> Tuple[Optional[str], str]:
    """Decide which engine's score the ensemble should use this run.

    Returns (leader_key, human_reason). `leader_key` is one of
    "catboost" / "xgboost" / None (None means neither model is available).
    """
    if cat_ok and not xgb_ok:
        return "catboost", "Only CatBoost was available for this prediction."
    if xgb_ok and not cat_ok:
        return "xgboost", "Only XGBoost was available for this prediction."
    if not (cat_ok or xgb_ok):
        return None, "Neither engine was available; falling back to rules."

    cat_rmse = _holdout_metric(cat_metrics, "RMSE")
    xgb_rmse = _holdout_metric(xgb_metrics, "RMSE")
    cat_r2 = _holdout_metric(cat_metrics, "R2")
    xgb_r2 = _holdout_metric(xgb_metrics, "R2")

    # Primary criterion: lower hold-out RMSE wins.
    if cat_rmse is not None and xgb_rmse is not None:
        if cat_rmse < xgb_rmse:
            return (
                "catboost",
                f"CatBoost has lower hold-out RMSE ({cat_rmse:.4f} vs {xgb_rmse:.4f}).",
            )
        if xgb_rmse < cat_rmse:
            return (
                "xgboost",
                f"XGBoost has lower hold-out RMSE ({xgb_rmse:.4f} vs {cat_rmse:.4f}).",
            )
        # RMSE tie → secondary criterion: higher R² wins.
        if cat_r2 is not None and xgb_r2 is not None:
            if cat_r2 > xgb_r2:
                return (
                    "catboost",
                    f"Hold-out RMSE tied at {cat_rmse:.4f}; CatBoost has higher R² "
                    f"({cat_r2:.3f} vs {xgb_r2:.3f}).",
                )
            if xgb_r2 > cat_r2:
                return (
                    "xgboost",
                    f"Hold-out RMSE tied at {cat_rmse:.4f}; XGBoost has higher R² "
                    f"({xgb_r2:.3f} vs {cat_r2:.3f}).",
                )
        return (
            "catboost",
            f"Hold-out metrics identical (RMSE {cat_rmse:.4f}); defaulting to CatBoost.",
        )

    # One side missing RMSE — prefer the side that has it.
    if cat_rmse is not None:
        return "catboost", f"CatBoost hold-out RMSE available ({cat_rmse:.4f}); XGBoost metrics missing."
    if xgb_rmse is not None:
        return "xgboost", f"XGBoost hold-out RMSE available ({xgb_rmse:.4f}); CatBoost metrics missing."

    # Neither side has metrics — default to CatBoost (it's the older, primary engine).
    return "catboost", "Hold-out metrics unavailable for both engines; defaulting to CatBoost."


def predict_ensemble(asset_data: Mapping[str, Any]) -> Dict[str, Any]:
    """Run both engines, pick the one with better hold-out accuracy, score with it.

    Returns the same shape as `NBAService.predict`, plus per-candidate
    `cat_score`, `xgb_score`, `engine_agreement`, and ensemble metadata
    (`accuracy_leader`, `accuracy_leader_reason`, `engine_kind="ensemble_accuracy_pick"`).
    If only one engine is available we degrade gracefully to that engine's
    output rather than failing the whole call.
    """
    cat_nba_service._load_artifacts()
    xgb_nba_service._load_artifacts()

    cat_ok = cat_nba_service._model is not None and bool(cat_nba_service._feature_order)
    xgb_ok = xgb_nba_service._model is not None and bool(xgb_nba_service._feature_order)

    # CatBoost service holds the canonical catalog/manifest/constraints.
    base = cat_nba_service if cat_ok else xgb_nba_service if xgb_ok else cat_nba_service

    from app.services.nba_features import build_situation_features

    situation = build_situation_features(asset_data)
    candidates = base._generate_candidates(asset_data, situation)
    if not candidates:
        return base._rule_fallback(asset_data, situation, reason="no_eligible_candidates")

    if not (cat_ok or xgb_ok):
        fb = base._rule_fallback(asset_data, situation, reason="no_engine_available")
        fb["engine_kind"] = "ensemble_accuracy_pick"
        return fb

    # Decide which engine's score we'll use for the model_score this run.
    leader_key, leader_reason = _resolve_accuracy_leader(
        cat_ok,
        xgb_ok,
        cat_nba_service._model_metrics,
        xgb_nba_service._model_metrics,
    )

    action_history = (
        asset_data.get("nbaActionHistory")
        or asset_data.get("nba_action_history")
        or {}
    )

    scored: List[Dict[str, Any]] = []
    for aid in candidates:
        cat_score = _per_engine_score_safe(cat_nba_service, situation, aid, action_history) if cat_ok else None
        xgb_score = _per_engine_score_safe(xgb_nba_service, situation, aid, action_history) if xgb_ok else None

        # Use the leader's score directly. No averaging.
        if leader_key == "catboost" and cat_score is not None:
            model_score = cat_score
        elif leader_key == "xgboost" and xgb_score is not None:
            model_score = xgb_score
        elif cat_score is not None:
            model_score = cat_score
        elif xgb_score is not None:
            model_score = xgb_score
        else:
            model_score = 0.0

        # agreement = 1 - |cat - xgb| / max(|cat|, |xgb|, eps); UI uses it
        # to flag rows where the two engines disagree most.
        if cat_score is not None and xgb_score is not None:
            denom = max(abs(cat_score), abs(xgb_score), 1e-6)
            agreement = max(0.0, 1.0 - abs(cat_score - xgb_score) / denom)
        else:
            agreement = None

        penalty, penalty_breakdown = base._soft_penalty(situation, aid)
        final_score = max(0.0, min(1.0, model_score - penalty))
        meta = base._action_meta(aid)
        scored.append(
            {
                "action_id": int(aid),
                "title": meta["title"],
                "playbook": meta["playbook"],
                "model_score": round(float(model_score), 4),
                "cat_score": round(float(cat_score), 4) if cat_score is not None else None,
                "xgb_score": round(float(xgb_score), 4) if xgb_score is not None else None,
                "engine_agreement": round(float(agreement), 4) if agreement is not None else None,
                "soft_penalty": round(float(penalty), 4),
                "soft_penalty_breakdown": penalty_breakdown,
                "final_score": round(float(final_score), 4),
                "eligibility": meta.get("eligibility", {}),
                "times_used": history_count_for(situation.get("status"), aid),
            }
        )

    scored = base._tie_break(scored)
    winner = scored[0]
    winner_meta = base._action_meta(winner["action_id"])

    total = sum(max(0.0, s["final_score"]) for s in scored) or 1.0
    top_probabilities = [
        {
            "action_id": s["action_id"],
            "probability": round(s["final_score"] / total, 4),
            "title": s["title"],
        }
        for s in scored
    ]

    feature_row_used = build_full_feature_row(asset_data, winner["action_id"], action_history)

    # Engines-status block: tells the UI exactly why a model didn't score
    # (e.g. "model_xgb.json missing — run scripts/train_nba_xgboost.py").
    engines_status = {
        "catboost": {
            "ok": cat_ok,
            "reason": None if cat_ok else cat_nba_service._load_error or "model_unavailable",
        },
        "xgboost": {
            "ok": xgb_ok,
            "reason": None if xgb_ok else xgb_nba_service._load_error or "model_unavailable",
        },
    }

    # Source label names the actual driver of the headline pick.
    if cat_ok and xgb_ok:
        leader_name = "CatBoost" if leader_key == "catboost" else "XGBoost"
        source_label = f"Ensemble (using {leader_name} — higher accuracy)"
    elif cat_ok:
        source_label = "CatBoost only (XGBoost unavailable)"
    elif xgb_ok:
        source_label = "XGBoost only (CatBoost unavailable)"
    else:
        source_label = "Rule-based fallback"

    return {
        "action_id": int(winner["action_id"]),
        "title": winner_meta["title"],
        "playbook": winner_meta["playbook"],
        "model_ok": True,
        "model_score": winner["model_score"],
        "cat_score": winner.get("cat_score"),
        "xgb_score": winner.get("xgb_score"),
        "engine_agreement": winner.get("engine_agreement"),
        "final_score": winner["final_score"],
        "top_probabilities": top_probabilities,
        "top_alternatives": scored,
        "constraints_applied": base._constraints_summary(),
        "feature_row": feature_row_used,
        "engine_kind": "ensemble_accuracy_pick",
        "engine_label": "Ensemble",
        "engines_used": {
            "catboost": cat_ok,
            "xgboost": xgb_ok,
        },
        "engines_status": engines_status,
        "source_label": source_label,
        # NEW: which engine's score the ensemble actually used and why.
        "accuracy_leader": leader_key,  # "catboost" | "xgboost" | None
        "accuracy_leader_reason": leader_reason,
        # Sub-model hold-out metrics — the UI shows these per-engine so
        # reviewers see "we picked CatBoost because RMSE 0.0188 < 0.0190".
        "submodel_metrics": {
            "catboost": cat_nba_service._model_metrics,
            "xgboost": xgb_nba_service._model_metrics,
        },
        # Per-status history summary for the "Used before" column.
        "history_for_status": history_for_status(situation.get("status")),
    }
