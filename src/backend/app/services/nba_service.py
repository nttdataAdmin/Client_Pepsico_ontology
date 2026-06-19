"""
NBA service — thin wrapper around the inference pipeline at `src/nba/inference`.

On each request:
1. Build a `situation` dict from the asset payload sent by the UI.
2. Hand it to `src.nba.inference.recommend()`, which loads the trained model
   plus `nba_metrics.json` from `src/nba/model/output/` and scores every
   candidate remediation action.
3. Map the returned ranked list into the shape the rest of the backend already
   expects (`action_id`, `title`, `playbook`, `top_probabilities`,
   `top_alternatives`, `feature_row`, ...).

The underlying model family is intentionally NOT surfaced to API callers —
`engine_label` stays generic ("Model") so the UI never names a specific
framework.
"""
from __future__ import annotations

import logging
from typing import Any, Mapping

from src.backend.app.services.nba_features import build_full_feature_row
from src.nba.inference.inference import ACTION_LABELS, recommend

logger = logging.getLogger(__name__)


ACTION_PLAYBOOKS: dict[int, str] = {
    0: (
        "Hold setpoints and continue normal monitoring. Re-check KPIs and "
        "condition signals at the next shift handover."
    ),
    1: (
        "Schedule a preventive maintenance window within the next 24-48 hours; "
        "open a work order against the accountable CMMS workcenter and stage "
        "spares ahead of the window."
    ),
    2: (
        "Stop production on the asset and isolate it (LOTO). Dispatch the "
        "on-call maintenance crew for an immediate diagnostic walkdown before "
        "re-energising."
    ),
    3: (
        "Plan a replace / repair on the failing component during the next "
        "planned downtime. Confirm spares, labour, and any safety permits."
    ),
    4: (
        "Adjust process setpoints within OEM safe bands (temperature, dosing, "
        "feed) and watch the KPI response for one full hour before deciding "
        "next step."
    ),
    5: (
        "Run the clean / lubricate / calibrate routine per OEM intervals; "
        "verify instrumentation and recalibrate any drifted sensors."
    ),
    6: (
        "Throttle line speed or reduce output until inspection completes. "
        "Coordinate with production planning on downstream impact."
    ),
    7: (
        "Escalate to the reliability specialist team; open a priority ticket "
        "and notify operations management."
    ),
}


_SITUATION_KEYS: tuple[str, ...] = (
    "asset_id",
    "event_id",
    "status",
    "criticality",
    "asset_type",
    "plant",
    "state",
    "shift_hour_at_event",
    "rul",
    "kpiDigestForAi",
    "recent_temp_dev_c",
    "recent_vibration_mm_s",
    "recent_waste_kg_last_hour",
    "recent_oee_pct",
    "operator_skill_level",
    "on_hold_inventory_kg_current",
    "qc_nogo",
)


def _normalise_situation(asset_data: Mapping[str, Any]) -> dict[str, Any]:
    """Forward only the fields the inference module reads; drop UI noise."""
    out: dict[str, Any] = {}
    for k in _SITUATION_KEYS:
        v = asset_data.get(k)
        if v is None or v == "":
            continue
        out[k] = v
    return out


class NBAService:
    """Wraps `src.nba.inference.recommend` and shapes its output for the API."""

    engine_kind: str = "regressor_weighted_kpi_impact"
    engine_label: str = "Model"  # generic; framework name never leaves the backend

    def predict(self, asset_data: Mapping[str, Any]) -> dict[str, Any]:
        situation = _normalise_situation(asset_data)
        try:
            result = recommend(situation)
        except FileNotFoundError as exc:
            logger.warning("NBA model artifacts missing: %s", exc)
            return self._rule_fallback(situation, reason=str(exc))
        except Exception as exc:  # noqa: BLE001
            logger.exception("NBA inference failed")
            return self._rule_fallback(situation, reason=str(exc))

        ranked = list(result.get("ranked_actions") or [])
        top_probabilities = [
            {
                "action_id": int(item["action_id"]),
                "title": item["title"],
                "probability": float(item["predicted_weighted_kpi_impact"]),
            }
            for item in ranked
        ]
        top_alternatives = [
            {
                "action_id": int(item["action_id"]),
                "title": item["title"],
                "score": float(item["predicted_weighted_kpi_impact"]),
                "playbook": ACTION_PLAYBOOKS.get(int(item["action_id"]), ""),
            }
            for item in ranked
        ]

        aid = int(result["recommended_action_id"])
        title = result.get("recommended_title") or ACTION_LABELS.get(aid, f"Action {aid}")
        score = float(result.get("predicted_weighted_kpi_impact") or 0.0)

        try:
            feature_row = build_full_feature_row(situation, aid)
        except Exception:  # noqa: BLE001
            feature_row = dict(situation)

        return {
            "action_id": aid,
            "title": title,
            "playbook": ACTION_PLAYBOOKS.get(aid, ""),
            "model_ok": True,
            "score": round(score, 4),
            "top_probabilities": top_probabilities,
            "top_alternatives": top_alternatives,
            "feature_row": feature_row,
            "engine_kind": self.engine_kind,
            "engine_label": self.engine_label,
        }

    def _rule_fallback(
        self,
        situation: Mapping[str, Any],
        reason: str = "model_unavailable",
    ) -> dict[str, Any]:
        """Used only when the model artefacts cannot be loaded."""
        status = str(situation.get("status") or "").lower()
        crit = str(situation.get("criticality") or "").lower()
        qc = float(situation.get("qc_nogo") or 0)

        if qc >= 1.0 or "breakdown" in status:
            aid = 2
        elif "failure" in status or "predicted" in status:
            aid = 1
        elif crit == "high":
            aid = 3
        else:
            aid = 0
        title = ACTION_LABELS.get(aid, f"Action {aid}")
        return {
            "action_id": aid,
            "title": title,
            "playbook": ACTION_PLAYBOOKS.get(aid, ""),
            "model_ok": False,
            "reason": reason,
            "score": None,
            "top_probabilities": [
                {"action_id": aid, "title": title, "probability": 1.0}
            ],
            "top_alternatives": [
                {
                    "action_id": aid,
                    "title": title,
                    "score": None,
                    "playbook": ACTION_PLAYBOOKS.get(aid, ""),
                }
            ],
            "feature_row": dict(situation),
            "engine_kind": self.engine_kind,
            "engine_label": self.engine_label,
        }


nba_service = NBAService()
