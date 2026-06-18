"""
NBA service — two-phase engine matching the PepsiCo NBA team's spec.

Phase 1: Training Engine
    The scr/nba/nba_training produces
    `model.cbm` (a CatBoostRegressor/XGboost on the composite weighted_kpi_impact
    target) plus `nba_metrics.json` and feature importances.

Phase 2: Recommendation Engine (this module)
    For an incoming unexpected situation:

    a. _generate_candidates(asset_data)
       Enumerate every remediation action whose eligibility (action_catalog.json)
       matches the situation (status, qc_nogo, asset_type, n_kpi_bad, ...).

    b. _score_candidate(asset_data, action_id)
       Build (situation features + action features), call the trained regressor,
       get the predicted weighted_kpi_impact (0..1, higher = better).

    c. _apply_constraints(...)
       Honour hard constraints (e.g. "Breakdown or qc_nogo MUST isolate",
       "High criticality blocks throttling", "Thermal assets cannot reduce
       speed", "Resolution time must fit remaining shift") and discount by soft
       constraints (operator satisfaction floor, waste cap, quality floor).

    The optimal action is returned together with the full ranked alternative
    list so the LLM narrative can quote them.

Backwards compatibility: `predict()` still returns `action_id`, `title`,
`playbook`, `top_probabilities` and `feature_row`, so the existing
ai_service / API contract is unchanged. We additionally emit `top_alternatives`
with the richer per-candidate breakdown.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Tuple

from app.config import settings
from app.services.nba_features import (
    build_full_feature_row,
    build_situation_features,
    row_to_ordered_list,
)
from app.services.nba_history import history_count_for, history_for_status

logger = logging.getLogger(__name__)
_APP_DIR = Path().resolve() / "src" / "backend" / "app"
_DEFAULT_DATA = Path().resolve() / "src" / "nba" / "model" / "output"

# legacy default if action_catalog has not been loaded yet
_FALLBACK_ACTION_IDS = [0, 1, 2, 3, 4, 5, 6, 7]


def _nba_dir() -> Path:
    raw = (settings.catboost_nba_model_dir or "").strip()
    if not raw:
        return _DEFAULT_DATA
    p = Path(raw)
    return p if p.is_absolute() else _APP_DIR.parent / p


class NBAService:
    """Regressor NBA service.
    * `_load_model(d)` — read the engine's model file from `d`. Returns
      `(model, error)` so callers can fall back gracefully.
    * `_predict_score_from_values(values, row_dict)` — given an ordered list
      of feature values (matching `feature_order`), call the loaded model and
      return one float in roughly `[0, 1]`.
    """

    # Identifies the engine in API payloads / the LLM source-of-truth block.
    engine_kind: str = "regressor_weighted_kpi_impact"
    # Human-readable label shown in the UI badges.
    engine_label: str = "CatBoost"   #WHY? WE DON?T KNOW IF ITs CATBOOST OR XGBOOST OR WHATEVER.
    # Filename of the metrics JSON the trainer writes (the XGBoost subclass overrides this).
    metrics_filename: str = "nba_metrics.json"

    def __init__(self) -> None:
        self._model = None
        self._catalog: Dict[str, Any] = {}
        self._feature_order: List[str] = []
        self._cat_indices: List[int] = []
        self._cat_names: List[str] = []
        self._target_def: Dict[str, Any] = {}
        self._constraints: Dict[str, Any] = {}
        self._load_error: Optional[str] = None
        self._attempted_load = False
        # Hold-out metrics summary read from `nba_metrics*.json`. Surfaced in the
        # API response so the UI can show "this prediction comes from the X
        # model with hold-out RMSE Y / R² Z".
        self._model_metrics: Optional[Dict[str, Any]] = None

    # ------------------------------------------------------------------ load
    def _train_from_csv(self, csv_path: Path):
        """CatBoost-only emergency trainer when no .cbm artefact is on disk.

        Subclasses (e.g. XGBoostNBAService) should NOT inherit this — they
        have their own dedicated training script; if the engine's model file
        is missing, they should surface a load error instead of silently
        training a CatBoost model.
        """
        import pandas as pd
        from catboost import CatBoostRegressor, Pool

        df = pd.read_csv(csv_path)
        target_col = self._target_def.get("target_column") or "weighted_kpi_impact"
        if target_col not in df.columns:
            raise ValueError(f"target column {target_col} missing in {csv_path}")
        for c in self._cat_names:
            if c in df.columns:
                df[c] = df[c].astype(str)
        X = df[self._feature_order]
        y = df[target_col].astype(float)
        cat_idx = [self._feature_order.index(c) for c in self._cat_names if c in self._feature_order]
        model = CatBoostRegressor(
            iterations=400, learning_rate=0.05, depth=6,
            loss_function="RMSE", random_seed=42, verbose=False,
        )
        model.fit(Pool(X, y, cat_features=cat_idx))
        self._cat_indices = cat_idx
        return model

    def _load_model(self, d: Path) -> Tuple[Any, Optional[str]]:
        """Load the CatBoost model from `model.cbm`, with CSV-train fallback.

        Returns `(model, error)`. When the .cbm file is missing but
        `nba_training_data.csv` is available, an emergency CatBoost is
        fit so the demo never goes dark.
        """
        model_path = d / "model.cbm"
        if model_path.is_file():
            from catboost import CatBoostRegressor

            m = CatBoostRegressor()
            m.load_model(str(model_path))
            return m, None

        csv_path = d / "nba_training_data.csv"
        if csv_path.is_file() and self._feature_order:
            return self._train_from_csv(csv_path), None

        return None, f"No model at {model_path} and no CSV at {csv_path}"

    def _load_artifacts(self) -> None:
        if self._attempted_load:
            return
        self._attempted_load = True
        d = _nba_dir()
        try:
            cat_path = d / "action_catalog.json"
            if cat_path.is_file():
                self._catalog = json.loads(cat_path.read_text(encoding="utf-8"))

            mf_path = d / "feature_manifest.json"
            if mf_path.is_file():
                mf = json.loads(mf_path.read_text(encoding="utf-8"))
                self._feature_order = list(mf.get("feature_order") or [])
                self._cat_names = list(mf.get("cat_feature_names") or [])
                # tolerate legacy "cat_feature_indices"
                if not self._cat_names and mf.get("cat_feature_indices"):
                    self._cat_indices = [int(x) for x in mf["cat_feature_indices"]]
                else:
                    self._cat_indices = [
                        self._feature_order.index(c)
                        for c in self._cat_names
                        if c in self._feature_order
                    ]

            tdef_path = d / "target_definition.json"
            if tdef_path.is_file():
                self._target_def = json.loads(tdef_path.read_text(encoding="utf-8"))

            con_path = d / "recommendation_constraints.json"
            if con_path.is_file():
                self._constraints = json.loads(con_path.read_text(encoding="utf-8"))

            # Hold-out metrics are read from disk regardless of whether the
            # model itself loads — useful for diagnostics in the response.
            self._model_metrics = self._read_metrics_summary(d)

            model, err = self._load_model(d)
            if model is not None:
                self._model = model
                self._load_error = None
                return
            self._load_error = err
            if err:
                logger.warning("%s model unavailable: %s", self.engine_label, err)
        except Exception as e:
            self._load_error = str(e)
            logger.warning("%s NBA load failed: %s", self.engine_label, e)

    def _read_metrics_summary(self, d: Path) -> Optional[Dict[str, Any]]:
        """Pull the selected hyper-param group's hold-out test metrics out of
        `nba_metrics*.json` and return a small UI-friendly dict.

        We deliberately surface ONLY the deployed group's hold-out numbers
        (not the full sweep) so the UI footer is concise.
        """
        p = d / self.metrics_filename
        if not p.is_file():
            return None
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to read %s: %s", p, e)
            return None
        sweep = raw.get("hyperparam_sweep") or {}
        sel = raw.get("selected_hyperparam_group")
        test = ((sweep.get(sel) or {}).get("test")) or {}

        def _f(v):
            try:
                return None if v is None else float(v)
            except (TypeError, ValueError):
                return None

        return {
            "engine_kind": self.engine_kind,
            "engine_label": self.engine_label,
            "selected_hyperparam_group": sel,
            "deployed_iterations": raw.get("deployed_iterations"),
            "n_train_split": raw.get("n_train_split"),
            "n_test_split": raw.get("n_test_split"),
            "split_strategy": raw.get("split_strategy"),
            "generated_at_utc": raw.get("generated_at_utc"),
            "holdout": {
                "RMSE": _f(test.get("RMSE")),
                "MAE": _f(test.get("MAE")),
                "MAPE": _f(test.get("MAPE")),
                "R2": _f(test.get("R2")),
                "WMAPE": _f(test.get("WMAPE")),
                "WMAE": _f(test.get("WMAE")),
            },
        }

    def available(self) -> bool:
        self._load_artifacts()
        return self._model is not None

    # --------------------------------------------------------- recommendation
    def predict(self, asset_data: Mapping[str, Any]) -> Dict[str, Any]:
        """Entry point used by ai_service / API.

        Runs Phase 2 of the engine: candidate enumeration -> scoring -> constraint
        application -> ranking.
        """
        self._load_artifacts()

        situation = build_situation_features(asset_data)
        candidates = self._generate_candidates(asset_data, situation)
        if not candidates:
            return self._rule_fallback(asset_data, situation, reason="no_eligible_candidates")

        # If the model is unavailable, fall back to a rule-based pick but still
        # return the candidate set so the LLM can talk about alternatives.
        if self._model is None or not self._feature_order:
            fb = self._rule_fallback(asset_data, situation, reason=self._load_error or "model_unavailable")
            fb["top_alternatives"] = [self._candidate_stub(aid) for aid in candidates]
            return fb

        action_history = (
            asset_data.get("nbaActionHistory")
            or asset_data.get("nba_action_history")
            or {}
        )

        scored: List[Dict[str, Any]] = []
        for aid in candidates:
            try:
                model_score = self._score_candidate(situation, aid, action_history)
            except Exception as e:
                logger.warning("score candidate %s failed: %s", aid, e)
                model_score = 0.0
            penalty, penalty_breakdown = self._soft_penalty(situation, aid)
            final_score = max(0.0, min(1.0, model_score - penalty))
            meta = self._action_meta(aid)
            scored.append({
                "action_id": int(aid),
                "title": meta["title"],
                "playbook": meta["playbook"],
                "model_score": round(float(model_score), 4),
                "soft_penalty": round(float(penalty), 4),
                "soft_penalty_breakdown": penalty_breakdown,
                "final_score": round(float(final_score), 4),
                "eligibility": meta.get("eligibility", {}),
                # Historical context: how many past situations of this status
                # were won by this action in `nba_training_data.csv`. The UI
                # uses this for the "Used before" column on the alternatives
                # table and the per-row comparison popup.
                "times_used": history_count_for(situation.get("status"), aid),
            })

        scored = self._tie_break(scored)
        winner = scored[0]
        winner_meta = self._action_meta(winner["action_id"])

        # legacy top_probabilities (used by ai_service) -> use final_score normalized
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
        return {
            "action_id": int(winner["action_id"]),
            "title": winner_meta["title"],
            "playbook": winner_meta["playbook"],
            "model_ok": True,
            "model_score": winner["model_score"],
            "final_score": winner["final_score"],
            "top_probabilities": top_probabilities,
            "top_alternatives": scored,
            "constraints_applied": self._constraints_summary(),
            "feature_row": feature_row_used,
            "engine_kind": self.engine_kind,
            "engine_label": self.engine_label,
            "model_metrics": self._model_metrics,
            # Per-status history summary: total past situations + per-action win counts.
            # UI uses it for the "Used before" denominator and the popup verdict.
            "history_for_status": history_for_status(situation.get("status")),
        }

    # ------------------------------------------------------ candidate filter
    def _generate_candidates(
        self,
        asset_data: Mapping[str, Any],
        situation: Mapping[str, Any],
    ) -> List[int]:
        if not self._catalog or not self._catalog.get("actions"):
            return list(_FALLBACK_ACTION_IDS)

        out: List[int] = []
        status = str(situation.get("status") or "")
        qc = float(situation.get("qc_nogo") or 0) >= 1.0
        asset_type = str(situation.get("asset_type") or "")
        n_bad = float(situation.get("n_kpi_bad") or 0)

        for aid_str, meta in self._catalog["actions"].items():
            try:
                aid = int(aid_str)
            except (TypeError, ValueError):
                continue
            elig = meta.get("eligibility") or {}
            allowed = elig.get("allowed_statuses")
            if allowed and status not in allowed:
                continue
            if elig.get("requires_qc_nogo") and not qc:
                continue
            if "min_n_kpi_bad" in elig and n_bad < float(elig["min_n_kpi_bad"]):
                continue
            if "max_n_kpi_bad" in elig and n_bad > float(elig["max_n_kpi_bad"]):
                continue
            blocked_types = elig.get("blocked_for_asset_types") or []
            if asset_type and asset_type in blocked_types:
                continue
            out.append(aid)

        # Hard constraint: breakdown / qc_nogo MUST have an immediate isolation
        # candidate in the set (we keep action 2 — immediate inspection + isolation —
        # available even if some eligibility flag is too strict).
        hc = (self._constraints.get("hard_constraints") or {})
        if hc.get("breakdown_or_qc_nogo_must_isolate", {}).get("enabled"):
            if status == "Breakdown" or qc:
                must_in = hc["breakdown_or_qc_nogo_must_isolate"].get("applies_to_action_ids_to_force_in") or [2]
                for aid in must_in:
                    if aid not in out and str(aid) in self._catalog.get("actions", {}):
                        out.append(int(aid))
                # ... and remove monitor / throttle which are unsafe here
                out = [a for a in out if a not in {0, 6}]

        # Hard constraint: high criticality blocks specific actions (e.g. throttle)
        hc_block = hc.get("high_criticality_blocks_non_safe_continue") or {}
        if hc_block.get("enabled") and str(situation.get("criticality") or "") == "High":
            blocked = set(hc_block.get("blocked_action_ids") or [])
            out = [a for a in out if a not in blocked]

        # Hard constraint: thermal assets block speed throttle
        ta = hc.get("thermal_assets_block_speed_throttle") or {}
        if ta.get("enabled"):
            mapping = ta.get("blocked_action_ids_for_asset_types") or {}
            blocked = set(mapping.get(asset_type) or [])
            out = [a for a in out if a not in blocked]

        # Hard constraint: must fit remaining shift
        msh = hc.get("must_have_time_in_shift") or {}
        if msh.get("enabled"):
            rem_min = int(float(situation.get("hours_remaining_in_shift") or 0)) * 60
            allowed_budget = 60 + rem_min
            filtered: List[int] = []
            for aid in out:
                elig = (self._catalog["actions"].get(str(aid)) or {}).get("eligibility", {})
                t_res = float(elig.get("expected_resolve_min") or 0)
                if rem_min == 0 and aid not in (0, 3):
                    continue
                if t_res <= allowed_budget:
                    filtered.append(aid)
            if filtered:
                out = filtered

        # de-dup and stable order
        seen: set = set()
        ordered: List[int] = []
        for aid in out:
            if aid in seen:
                continue
            seen.add(aid)
            ordered.append(aid)
        return ordered

    # ------------------------------------------------------------ scoring
    def _score_candidate(
        self,
        situation: Mapping[str, Any],
        action_id: int,
        action_history: Mapping[str, Any],
    ) -> float:
        # action_history may be a dict keyed by action_id; if so, pick that entry
        hist_for_action: Mapping[str, Any] = {}
        if isinstance(action_history, Mapping):
            entry = action_history.get(str(int(action_id))) or action_history.get(int(action_id))
            if isinstance(entry, Mapping):
                hist_for_action = entry
            elif not any(isinstance(v, Mapping) for v in action_history.values()):
                hist_for_action = action_history

        row = build_full_feature_row({**situation}, action_id, hist_for_action)
        values = row_to_ordered_list(row, self._feature_order)
        return self._predict_score_from_values(values, row)

    def _predict_score_from_values(
        self,
        values: List[Any],
        row_dict: Mapping[str, Any],
    ) -> float:
        """Run the loaded CatBoost model on one feature row.

        Subclasses override this to call a different engine. `values` is the
        list of feature values aligned to `self._feature_order`; `row_dict`
        is the same content as a name->value mapping for engines (like
        XGBoost) that prefer DataFrames.
        """
        from catboost import Pool

        cat_idx = self._cat_indices or [
            self._feature_order.index(c) for c in self._cat_names if c in self._feature_order
        ]
        pool = Pool([values], feature_names=self._feature_order, cat_features=cat_idx)
        pred = self._model.predict(pool)
        try:
            return float(pred[0])
        except (TypeError, IndexError):
            return float(pred)

    def _soft_penalty(
        self,
        situation: Mapping[str, Any],
        action_id: int,
    ) -> Tuple[float, Dict[str, float]]:
        """Apply the soft constraints from recommendation_constraints.json.

        We use the catalog's `expected_resolve_min` as a proxy for the
        predicted resolution time, plus simple heuristics on operator
        satisfaction (high-risk actions discounted when operator_skill_level is
        low) and waste (proportional to hours remaining for monitoring-only
        actions). A future iteration can swap these for per-sub-KPI heads.
        """
        sc = (self._constraints.get("soft_constraints") or {})
        if not sc:
            return 0.0, {}

        breakdown: Dict[str, float] = {}
        total = 0.0

        elig = (self._catalog.get("actions", {}).get(str(action_id)) or {}).get("eligibility", {})
        t_res = float(elig.get("expected_resolve_min") or 0)
        op_skill = float(situation.get("operator_skill_level") or 3.0)
        rem_min = float(situation.get("hours_remaining_in_shift") or 0) * 60.0
        recent_waste_hr = float(situation.get("recent_waste_kg_last_hour") or 0)

        rule = sc.get("preferred_max_time_to_restart_min")
        if rule:
            cap = float(rule["value"])
            over = max(0.0, t_res - cap)
            p = over * float(rule.get("penalty_per_min_over") or 0)
            if p > 0:
                breakdown["time_to_restart_over_cap"] = round(p, 4)
                total += p

        rule = sc.get("min_operator_satisfaction")
        if rule and action_id in (2, 5, 7):  # action types that are harder on operators
            est_sat = max(1.0, min(5.0, 2.5 + 0.4 * (op_skill - 3.0)))
            cap = float(rule["value"])
            under = max(0.0, cap - est_sat)
            p = under * float(rule.get("penalty_per_point_under") or 0)
            if p > 0:
                breakdown["operator_satisfaction_under_floor"] = round(p, 4)
                total += p

        rule = sc.get("max_waste_remaining_shift_kg")
        if rule and action_id == 0:  # monitoring lets waste accumulate
            est_waste = recent_waste_hr * (rem_min / 60.0)
            cap = float(rule["value"])
            over = max(0.0, est_waste - cap)
            p = over * float(rule.get("penalty_per_kg_over") or 0)
            if p > 0:
                breakdown["waste_over_cap"] = round(p, 4)
                total += p

        rule = sc.get("min_quality_ok_pct_remaining")
        if rule and action_id == 0 and float(situation.get("n_kpi_bad") or 0) >= 2:
            cap = float(rule["value"])
            est_qok = max(0.0, 100.0 - 5.0 * float(situation.get("n_kpi_bad") or 0))
            under = max(0.0, cap - est_qok)
            p = under * float(rule.get("penalty_per_point_under") or 0)
            if p > 0:
                breakdown["quality_under_floor"] = round(p, 4)
                total += p

        max_pen = float((self._constraints.get("scoring") or {}).get("max_total_soft_penalty", 0.5))
        total = min(total, max_pen)
        return total, breakdown

    def _tie_break(self, scored: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        order = ((self._constraints.get("scoring") or {}).get("tie_breaker_order")
                 or ["model_score", "t_resolve_min", "operator_satisfaction_1_5"])

        def key(item: Dict[str, Any]):
            t_res = float(
                (self._catalog.get("actions", {}).get(str(item["action_id"])) or {})
                .get("eligibility", {})
                .get("expected_resolve_min") or 0
            )
            # primary: final_score desc; then specified tie-breakers
            extras = []
            for tb in order:
                if tb == "t_resolve_min":
                    extras.append(t_res)
                elif tb == "operator_satisfaction_1_5":
                    extras.append(-1.0)  # already baked into penalty
                else:
                    extras.append(-float(item.get(tb) or 0))
            return (-item["final_score"], *extras)

        return sorted(scored, key=key)

    # ------------------------------------------------------------ helpers
    def _candidate_stub(self, aid: int) -> Dict[str, Any]:
        meta = self._action_meta(aid)
        return {
            "action_id": int(aid),
            "title": meta["title"],
            "playbook": meta["playbook"],
            "model_score": None,
            "soft_penalty": 0.0,
            "soft_penalty_breakdown": {},
            "final_score": None,
            "eligibility": meta.get("eligibility", {}),
        }

    def _action_meta(self, action_id: int) -> Dict[str, Any]:
        actions = (self._catalog or {}).get("actions") or {}
        block = actions.get(str(int(action_id))) or {}
        return {
            "title": block.get("title") or f"Action {action_id}",
            "playbook": block.get("playbook") or "",
            "eligibility": block.get("eligibility") or {},
        }

    def _constraints_summary(self) -> Dict[str, Any]:
        if not self._constraints:
            return {}
        return {
            "hard": [
                name for name, cfg in (self._constraints.get("hard_constraints") or {}).items()
                if cfg.get("enabled")
            ],
            "soft": list((self._constraints.get("soft_constraints") or {}).keys()),
            "scoring": self._constraints.get("scoring") or {},
        }

    def _rule_fallback(
        self,
        asset_data: Mapping[str, Any],
        situation: Mapping[str, Any],
        reason: str = "model_unavailable",
    ) -> Dict[str, Any]:
        status = str(situation.get("status") or "").lower().replace(" ", "_")
        crit = str(situation.get("criticality") or "").lower()
        n_bad = float(situation.get("n_kpi_bad") or 0)
        qc = float(situation.get("qc_nogo") or 0)
        if qc >= 1.0 or "breakdown" in status:
            aid = 2
        elif "failure" in status or "predicted" in status:
            aid = 1
        elif crit == "high" and n_bad >= 2:
            aid = 3
        elif n_bad >= 1 or "watch" in str(asset_data.get("kpiDigestForAi") or "").lower():
            aid = 4
        else:
            aid = 0
        meta = self._action_meta(aid)
        return {
            "action_id": aid,
            "title": meta["title"],
            "playbook": meta["playbook"],
            "top_probabilities": [{"action_id": aid, "probability": 1.0, "title": meta["title"]}],
            "top_alternatives": [self._candidate_stub(aid)],
            "feature_row": dict(situation),
            "model_ok": False,
            "reason": reason,
            "engine_kind": self.engine_kind,
            "engine_label": self.engine_label,
            "model_metrics": self._model_metrics,
            "history_for_status": history_for_status(situation.get("status")),
        }


nba_service = NBAService()
