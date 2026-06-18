"""
Build feature rows for the CatBoost NBA regressor.

There are two kinds of features (NOTE 2 from the NBA team feedback):

* SITUATION features describe the unexpected situation and asset/shift context.
  They are independent of which remediation we are evaluating: RUL, KPI stats,
  asset profile, shift hour, recent thermal / vibration / waste / OEE, operator
  skill, current on-hold inventory, plant / state, QC outcome.

* ACTION features describe one candidate remediation. The action_id itself is
  a categorical input. Engineered frequency features ("how often this action
  has been used for the same kind of situation in the last 2 weeks / 2 months,
  and its success rate") are passed in by the caller so the same definitions
  used at training time can be reproduced from production logs.

`build_full_feature_row` joins both halves into one dict whose keys match
`feature_manifest.json -> feature_order`.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Mapping, Optional


SHIFT_LENGTH_HOURS = 8


def _pick(d: Mapping[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d and d[k] is not None and d[k] != "":
            return d[k]
    return None


def _parse_rul(val: Any) -> float:
    if val is None:
        return -1.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    m = re.search(r"(-?\d+(?:\.\d+)?)", s)
    if m:
        return float(m.group(1))
    return -1.0


def _kpi_digest(asset_data: Mapping[str, Any]) -> str:
    t = _pick(asset_data, "kpiDigestForAi", "kpi_digest_for_ai")
    return (t or "").strip()


def _kpi_score_and_bad(digest: str) -> tuple[float, int]:
    if not digest:
        return 50.0, 0
    nums = [float(x) for x in re.findall(r"(-?\d+(?:\.\d+)?)\s*%", digest)]
    score = sum(nums) / len(nums) if nums else 50.0
    n_bad = len(re.findall(r"\bBad\b", digest, flags=re.IGNORECASE))
    return max(0.0, min(100.0, score)), n_bad


def _qc_nogo(asset_data: Mapping[str, Any]) -> int:
    qc = _pick(asset_data, "qcSignals", "qc_signals")
    if isinstance(qc, dict):
        if qc.get("no_go") is True or str(qc.get("outcome", "")).lower() == "no_go":
            return 1
        v = qc.get("isNoGo")
        if v is True:
            return 1
    return 0


def _str_cat(val: Any, default: str = "unknown") -> str:
    if val is None or val == "":
        return default
    return str(val).strip()[:128] or default


def _f(val: Any, default: float) -> float:
    if val is None or val == "":
        return float(default)
    try:
        return float(val)
    except (TypeError, ValueError):
        return float(default)


def _shift_hours_remaining(asset_data: Mapping[str, Any]) -> tuple[int, int]:
    """Returns (shift_hour_at_event, hours_remaining_in_shift). 8h shift per spec."""
    h = _pick(asset_data, "shift_hour_at_event", "shiftHourAtEvent")
    if h is None:
        h = _pick(asset_data, "shiftHour", "shift_hour")
    try:
        h = int(h) if h is not None else 0
    except (TypeError, ValueError):
        h = 0
    h = max(0, min(SHIFT_LENGTH_HOURS - 1, h))
    return h, SHIFT_LENGTH_HOURS - h


def build_situation_features(asset_data: Mapping[str, Any]) -> Dict[str, Any]:
    """All features that depend only on the situation (not on the candidate action)."""
    digest = _kpi_digest(asset_data)
    kpi_score, n_kpi_bad = _kpi_score_and_bad(digest)
    rul = _parse_rul(_pick(asset_data, "rul", "RUL", "remaining_useful_life"))
    shift_h, hours_rem = _shift_hours_remaining(asset_data)

    return {
        "shift_hour_at_event": float(shift_h),
        "hours_remaining_in_shift": float(hours_rem),
        "rul_numeric": rul,
        "kpi_score": kpi_score,
        "n_kpi_bad": float(n_kpi_bad),
        "recent_temp_dev_c": _f(_pick(asset_data, "recent_temp_dev_c", "recentTempDevC", "tempDeviationC"), 2.0),
        "recent_vibration_mm_s": _f(
            _pick(asset_data, "recent_vibration_mm_s", "recentVibrationMmS", "vibrationMmS"), 1.8
        ),
        "recent_waste_kg_last_hour": _f(
            _pick(asset_data, "recent_waste_kg_last_hour", "recentWasteKgLastHour", "wasteKgLastHour"), 15.0
        ),
        "recent_oee_pct": _f(_pick(asset_data, "recent_oee_pct", "recentOeePct", "oeePct"), 75.0),
        "operator_skill_level": _f(_pick(asset_data, "operator_skill_level", "operatorSkillLevel"), 3.0),
        "on_hold_inventory_kg_current": _f(
            _pick(asset_data, "on_hold_inventory_kg_current", "onHoldInventoryKgCurrent"), 50.0
        ),
        "status": _str_cat(_pick(asset_data, "status", "Status")),
        "criticality": _str_cat(_pick(asset_data, "criticality", "Criticality")),
        "asset_type": _str_cat(_pick(asset_data, "asset_type", "assetType", "type")),
        "qc_nogo": float(_qc_nogo(asset_data)),
        "plant": _str_cat(_pick(asset_data, "plant", "Plant")),
        "state": _str_cat(_pick(asset_data, "state", "State")),
    }


def build_action_features(
    action_id: int,
    action_history: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Features that depend on the candidate remediation action.

    `action_history` (when provided by the caller) supplies the engineered
    frequency / success-rate features computed from the work-order log over the
    last 2 weeks / 2 months for the same (asset_type, status) bucket. If absent
    we emit neutral defaults so the model still runs.
    """
    hist = action_history or {}
    freq_2w = _f(_pick(hist, "freq_2w", "frequency_2w", "action_freq_same_situation_2w"), 0.0)
    freq_2m = _f(_pick(hist, "freq_2m", "frequency_2m", "action_freq_same_situation_2m"), 0.0)
    success = _f(_pick(hist, "success_rate_2m", "successRate2m", "action_success_rate_2m"), 0.5)
    return {
        "action_freq_same_situation_2w": max(0.0, min(1.0, freq_2w)),
        "action_freq_same_situation_2m": max(0.0, min(1.0, freq_2m)),
        "action_success_rate_2m": max(0.0, min(1.0, success)),
        "action_id": str(int(action_id)),
    }


def build_full_feature_row(
    asset_data: Mapping[str, Any],
    action_id: int,
    action_history: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Combine situation + action features. Caller supplies action_id explicitly."""
    sit = build_situation_features(asset_data)
    act = build_action_features(action_id, action_history)
    return {**sit, **act}


# Backwards-compatible alias for older callers / tests. New code should use
# build_situation_features (no action) or build_full_feature_row (with action).
def build_nba_feature_row(asset_data: Mapping[str, Any]) -> Dict[str, Any]:
    """Legacy entry: returns just the situation features (no candidate action)."""
    return build_situation_features(asset_data)


def row_to_ordered_list(
    row: Mapping[str, Any],
    feature_order: List[str],
) -> List[Any]:
    return [row.get(name) for name in feature_order]
