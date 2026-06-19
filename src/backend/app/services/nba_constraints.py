"""
Eligibility / safety constraints applied AFTER the model has scored every
candidate action.

* Hard rules block an action outright (`type=hard` → `blocked_action_ids` are
  removed from the winner pool when the caller asks for constraints to be
  applied).
* Soft rules raise a warning but do not eliminate the action (`type=soft` →
  the action stays eligible, the UI shows a yellow flag).

The rules read a NORMALISED feature dict (the same one used to score the
model), not the raw frontend payload, so numeric coercion + RUL parsing has
already happened in `nba_features.build_situation_features`.
"""
from __future__ import annotations

from typing import Any, Callable, Mapping, Optional


_THERMAL_ASSET_TYPES: frozenset[str] = frozenset(
    {"Fryer", "Thermal Oil", "Seasoning Train", "Oven", "Bake Oven"}
)


def _f(v: Any, default: float = 0.0) -> float:
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# --- individual rule functions ----------------------------------------------


def _rule_breakdown_blocks_passive(features: Mapping[str, Any]) -> Optional[dict]:
    status = str(features.get("status") or "").strip().lower()
    qc = _f(features.get("qc_nogo"))
    if status == "breakdown" or qc >= 1.0:
        return {
            "rule_id": "breakdown_or_qc_nogo_blocks_passive",
            "type": "hard",
            "title": "Asset is in Breakdown or QC No-Go",
            "blocked_action_ids": [0, 6],
            "reason": (
                "Continuing to monitor or throttle output is unsafe while the "
                "asset is in Breakdown or has tripped QC No-Go. Diagnostic "
                "inspection and isolation are required first."
            ),
        }
    return None


def _rule_high_crit_blocks_monitor(features: Mapping[str, Any]) -> Optional[dict]:
    crit = str(features.get("criticality") or "").strip().lower()
    n_bad = _f(features.get("n_kpi_bad"))
    if crit == "high" and n_bad >= 2:
        return {
            "rule_id": "high_criticality_multi_bad_kpi_blocks_monitor",
            "type": "hard",
            "title": "High-criticality asset with ≥2 KPIs in Bad state",
            "blocked_action_ids": [0],
            "reason": (
                "Deferring action on a high-criticality asset while multiple "
                "KPIs are in Bad state is not acceptable; a concrete "
                "intervention is required this shift."
            ),
        }
    return None


def _rule_thermal_blocks_throttle(features: Mapping[str, Any]) -> Optional[dict]:
    asset_type = str(features.get("asset_type") or "").strip()
    if asset_type in _THERMAL_ASSET_TYPES:
        return {
            "rule_id": "thermal_asset_blocks_speed_throttle",
            "type": "hard",
            "title": f"Thermal asset ({asset_type})",
            "blocked_action_ids": [6],
            "reason": (
                "Reducing line speed on a thermal asset can lead to runaway "
                "heat and scorched product; speed is not a valid lever here."
            ),
        }
    return None


def _rule_low_rul_blocks_monitor(features: Mapping[str, Any]) -> Optional[dict]:
    rul = _f(features.get("rul_numeric"), -1.0)
    if 0 <= rul < 48:
        return {
            "rule_id": "low_rul_blocks_monitor",
            "type": "hard",
            "title": f"RUL critically low ({rul:.0f}h)",
            "blocked_action_ids": [0],
            "reason": (
                "Remaining useful life is under 48 hours; passive monitoring "
                "is no longer an option — intervention must happen before the "
                "next shift."
            ),
        }
    return None


def _rule_low_skill_warns_in_place(features: Mapping[str, Any]) -> Optional[dict]:
    skill = _f(features.get("operator_skill_level"), 3.0)
    if skill <= 2.0:
        return {
            "rule_id": "low_operator_skill_warns_in_place",
            "type": "soft",
            "title": f"Operator skill level {int(skill)}",
            "blocked_action_ids": [4, 5],
            "reason": (
                "In-place adjustments (process parameters or "
                "clean/lubricate/calibrate) may need specialist supervision "
                "given this operator skill level."
            ),
        }
    return None


def _rule_short_shift_warns_long_jobs(features: Mapping[str, Any]) -> Optional[dict]:
    hours_left = _f(features.get("hours_remaining_in_shift"), 8.0)
    if 0 < hours_left < 2.0:
        return {
            "rule_id": "short_shift_warns_long_jobs",
            "type": "soft",
            "title": f"Less than {hours_left:.1f}h left in shift",
            "blocked_action_ids": [2, 3],
            "reason": (
                "Diagnostic isolation or component replacement may not finish "
                "before shift handover; coordinate with the next crew."
            ),
        }
    return None


_RULES: tuple[Callable[[Mapping[str, Any]], Optional[dict]], ...] = (
    _rule_breakdown_blocks_passive,
    _rule_high_crit_blocks_monitor,
    _rule_thermal_blocks_throttle,
    _rule_low_rul_blocks_monitor,
    _rule_low_skill_warns_in_place,
    _rule_short_shift_warns_long_jobs,
)


def evaluate_constraints(features: Mapping[str, Any]) -> dict[str, Any]:
    """Run every rule against the normalised situation features.

    Returns a structured report:
        {
            "blocked_action_ids": sorted ints (hard rules),
            "warned_action_ids": sorted ints (soft rules),
            "rules_fired": list of rule dicts (rule_id, type, title, reason,
                                               blocked_action_ids).
        }
    """
    fired: list[dict[str, Any]] = []
    blocked: set[int] = set()
    warned: set[int] = set()
    for rule in _RULES:
        try:
            res = rule(features)
        except Exception:  # noqa: BLE001
            continue
        if not res:
            continue
        fired.append(res)
        ids = [int(x) for x in res.get("blocked_action_ids", [])]
        if res.get("type") == "hard":
            blocked.update(ids)
        else:
            warned.update(ids)
    return {
        "blocked_action_ids": sorted(blocked),
        "warned_action_ids": sorted(warned),
        "rules_fired": fired,
    }
