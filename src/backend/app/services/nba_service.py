"""
NBA service — thin wrapper around the inference pipeline at `src/nba/inference`.

On each request:
1. Build a `situation` dict from the asset payload sent by the UI.
2. Hand it to `src.nba.inference.recommend()`, which loads the trained model
   plus `nba_metrics.json` from `src/nba/model/output/` and scores every
   candidate remediation action (0..7).
3. Evaluate eligibility / safety constraints against the situation features
   (`src.backend.app.services.nba_constraints`). Hard rules block actions
   outright; soft rules raise a warning. When `apply_constraints=True`
   (default), blocked actions are removed before picking the winner; when
   `apply_constraints=False`, the raw model winner is returned (used by the
   UI's "override" path).
4. Map everything into the shape the rest of the backend already expects
   (`action_id`, `title`, `playbook`, `top_probabilities`, `top_alternatives`,
   `feature_row`, …) plus a new `constraints` block describing which rules
   fired, which actions were removed (with their pre-filter scores), and
   whether the filter was actually applied to the winner.

The underlying model family is intentionally NOT surfaced to API callers —
`engine_label` stays generic ("Model") so the UI never names a specific
framework.
"""
from __future__ import annotations

import logging
from typing import Any, Mapping

from src.backend.app.services.nba_constraints import evaluate_constraints
from src.backend.app.services.nba_features import (
    build_full_feature_row,
    build_situation_features,
)
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


def _rules_per_action(rules_fired: list[dict[str, Any]]) -> dict[int, list[dict[str, str]]]:
    """Invert the rules-fired list to action_id -> [rule summaries]."""
    out: dict[int, list[dict[str, str]]] = {}
    for r in rules_fired:
        summary = {
            "rule_id": r.get("rule_id", ""),
            "type": r.get("type", "hard"),
            "title": r.get("title", ""),
            "reason": r.get("reason", ""),
        }
        for aid in r.get("blocked_action_ids", []):
            out.setdefault(int(aid), []).append(summary)
    return out


class NBAService:
    """Wraps `src.nba.inference.recommend` and shapes its output for the API."""

    engine_kind: str = "regressor_weighted_kpi_impact"
    engine_label: str = "Model"  # generic; framework name never leaves the backend

    def predict(
        self,
        asset_data: Mapping[str, Any],
        apply_constraints: bool = True,
    ) -> dict[str, Any]:
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

        # --- evaluate constraints against the normalised features ----------
        features = build_situation_features(asset_data)
        report = evaluate_constraints(features)
        blocked = set(report["blocked_action_ids"])
        warned = set(report["warned_action_ids"])
        rules_by_action = _rules_per_action(report["rules_fired"])

        # --- build the alternatives table with eligibility annotations -----
        top_alternatives: list[dict[str, Any]] = []
        for item in ranked:
            aid = int(item["action_id"])
            top_alternatives.append(
                {
                    "action_id": aid,
                    "title": item["title"],
                    "score": float(item["predicted_weighted_kpi_impact"]),
                    "playbook": ACTION_PLAYBOOKS.get(aid, ""),
                    "eligibility": (
                        "blocked"
                        if aid in blocked
                        else "warned"
                        if aid in warned
                        else "eligible"
                    ),
                    "blocked_by": rules_by_action.get(aid, []),
                }
            )

        # --- pick the winner --------------------------------------------------
        # When applying constraints, drop blocked actions from the pool. If
        # every action is blocked (shouldn't happen with sane rules), fall back
        # to the raw model winner so the UI never goes empty.
        constraints_applied_to_winner = False
        eligible_for_winner = [
            it for it in top_alternatives if it["eligibility"] != "blocked"
        ]
        if apply_constraints and eligible_for_winner:
            winner_alt = max(eligible_for_winner, key=lambda x: x["score"])
            constraints_applied_to_winner = True
        elif apply_constraints and not eligible_for_winner:
            # Degenerate situation — surface the raw winner but mark flag false.
            winner_alt = top_alternatives[0]
        else:
            winner_alt = top_alternatives[0]

        # `top_probabilities` is the legacy field the UI table reads. Keep it
        # ordered by score, but tag every row with its eligibility so the
        # frontend can dim / cross-out blocked rows.
        top_probabilities = [
            {
                "action_id": alt["action_id"],
                "title": alt["title"],
                "probability": alt["score"],
                "eligibility": alt["eligibility"],
            }
            for alt in top_alternatives
        ]

        # Pre-filter view — useful for the constraint-check popup.
        removed_actions = [
            {
                "action_id": alt["action_id"],
                "title": alt["title"],
                "score": alt["score"],
                "blocked_by": alt["blocked_by"],
            }
            for alt in top_alternatives
            if alt["eligibility"] == "blocked"
        ]

        try:
            feature_row = build_full_feature_row(situation, winner_alt["action_id"])
        except Exception:  # noqa: BLE001
            feature_row = dict(situation)

        return {
            "action_id": winner_alt["action_id"],
            "title": winner_alt["title"],
            "playbook": ACTION_PLAYBOOKS.get(winner_alt["action_id"], ""),
            "model_ok": True,
            "score": round(winner_alt["score"], 4),
            "top_probabilities": top_probabilities,
            "top_alternatives": top_alternatives,
            "feature_row": feature_row,
            "engine_kind": self.engine_kind,
            "engine_label": self.engine_label,
            "constraints": {
                "applied": constraints_applied_to_winner,
                "requested": bool(apply_constraints),
                "blocked_action_ids": sorted(blocked),
                "warned_action_ids": sorted(warned),
                "rules_fired": report["rules_fired"],
                "removed_actions": removed_actions,
                "raw_winner": {
                    "action_id": top_alternatives[0]["action_id"],
                    "title": top_alternatives[0]["title"],
                    "score": top_alternatives[0]["score"],
                }
                if top_alternatives
                else None,
            },
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
                {
                    "action_id": aid,
                    "title": title,
                    "probability": 1.0,
                    "eligibility": "eligible",
                }
            ],
            "top_alternatives": [
                {
                    "action_id": aid,
                    "title": title,
                    "score": None,
                    "playbook": ACTION_PLAYBOOKS.get(aid, ""),
                    "eligibility": "eligible",
                    "blocked_by": [],
                }
            ],
            "feature_row": dict(situation),
            "engine_kind": self.engine_kind,
            "engine_label": self.engine_label,
            "constraints": {
                "applied": False,
                "requested": False,
                "blocked_action_ids": [],
                "warned_action_ids": [],
                "rules_fired": [],
                "removed_actions": [],
                "raw_winner": {"action_id": aid, "title": title, "score": None},
            },
        }


nba_service = NBAService()
