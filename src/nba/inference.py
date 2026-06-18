"""
NBA ensemble inference — score any dynamic situation with CatBoost + XGBoost.

Flow:
  1. Load / build asset situation payload (same shape as the API/UI).
  2. Score every eligible action with BOTH engines.
  3. Pick the accuracy leader (lower hold-out RMSE; tie -> higher R2).
  4. Rank candidates and return the best action.

Programmatic use:

    from src.nba.inference import infer

    result = infer({
        "asset_id": "FL-5883",
        "status": "Breakdown",
        "criticality": "High",
        "asset_type": "Seasoning Train",
        "plant": "Vancouver",
        "state": "WA",
        "kpiDigestForAi": "OEE 63.6% Bad\\nScrap 9.7% Watch",
    })
    print(result["action_id"], result["title"])
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKEND_ROOT = _REPO_ROOT / "src" / "backend"
MODEL_DIR = _REPO_ROOT / "src" / "nba" / "model"
INPUT_DIR = MODEL_DIR / "input"
OUTPUT_DIR = MODEL_DIR / "output"
CSV_PATH = INPUT_DIR / "data" / "nba_training_data.csv"


def bootstrap_paths() -> None:
    """Make `from app.services...` work outside uvicorn."""
    for p in (_REPO_ROOT, _BACKEND_ROOT):
        if str(p) not in sys.path:
            sys.path.insert(0, str(p))


def _write_metrics_json(
    path: Path,
    *,
    engine_label: str,
    engine_kind: str,
    group_name: str,
    test_metrics: dict[str, float],
    n_train: int,
    n_test: int,
) -> None:
    payload = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "engine_kind": engine_kind,
        "engine_label": engine_label,
        "selected_hyperparam_group": group_name,
        "n_train_split": n_train,
        "n_test_split": n_test,
        "split_strategy": "sequential_holdout",
        "hyperparam_sweep": {
            group_name: {
                "test": {k: float(v) for k, v in test_metrics.items()},
            }
        },
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def ensure_model_artifacts(*, force_train: bool = False, quiet: bool = False) -> None:
    """Copy configs to output/ and train CatBoost + XGBoost if artefacts are missing."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for name in ("feature_manifest.json", "target_definition.json"):
        src = INPUT_DIR / name
        dst = OUTPUT_DIR / name
        if src.is_file() and (force_train or not dst.is_file()):
            shutil.copy2(src, dst)

    csv_dst = OUTPUT_DIR / "nba_training_data.csv"
    if CSV_PATH.is_file() and (force_train or not csv_dst.is_file()):
        shutil.copy2(CSV_PATH, csv_dst)

    cat_model = OUTPUT_DIR / "model.cbm"
    xgb_model = OUTPUT_DIR / "model_xgb.json"
    cat_metrics = OUTPUT_DIR / "nba_metrics.json"
    xgb_metrics = OUTPUT_DIR / "nba_metrics_xgb.json"

    need_cat = force_train or not cat_model.is_file() or not cat_metrics.is_file()
    need_xgb = force_train or not xgb_model.is_file() or not xgb_metrics.is_file()
    if not (need_cat or need_xgb):
        if not quiet:
            print("Model artefacts already present - skipping training.\n")
        return

    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Training CSV missing: {CSV_PATH}")

    import pandas as pd

    from src.nba.model_functions import (
        _best_params,
        _cast_categoricals,
        _metrics,
        _model_best_iter,
        _model_family_fit,
        _model_predict,
        _sequential_split,
    )

    manifest = json.loads((INPUT_DIR / "feature_manifest.json").read_text(encoding="utf-8"))
    hyper_all = json.loads((INPUT_DIR / "hyper_parameters.json").read_text(encoding="utf-8"))
    feature_order: list[str] = list(manifest["feature_order"])
    cat_feature_names: list[str] = list(manifest["cat_feature_names"])
    target_col: str = manifest["target"]
    time_col: str = manifest.get("time_column", "event_seq")
    df = pd.read_csv(CSV_PATH)
    group_name = "basic"

    def train_one(model_family: str) -> None:
        if not quiet:
            print(f"Training {model_family} ({group_name} hyperparams)...")
        params = dict(hyper_all[model_family][group_name])
        family_df = _cast_categoricals(df, model_family, cat_feature_names)
        train_df, test_df = _sequential_split(family_df, time_col, test_frac=0.22)
        X_train = train_df[feature_order]
        y_train = train_df[target_col].astype(float)
        X_test = test_df[feature_order]
        y_test = test_df[target_col].astype(float)
        cat_idx = (
            [feature_order.index(c) for c in cat_feature_names if c in feature_order]
            if model_family == "catboost"
            else None
        )

        model = _model_family_fit(model_family, params, cat_idx, X_train, y_train, X_test, y_test)
        best_iter = _model_best_iter(model_family, model)
        y_pred_test = _model_predict(model_family, model, X_test, cat_features=cat_idx)
        test_metrics = _metrics(y_test.values, y_pred_test)

        if model_family == "catboost":
            model.save_model(str(cat_model))
            _write_metrics_json(
                cat_metrics,
                engine_label="CatBoost",
                engine_kind="regressor_weighted_kpi_impact",
                group_name=group_name,
                test_metrics=test_metrics,
                n_train=len(train_df),
                n_test=len(test_df),
            )
        else:
            model.save_model(str(xgb_model))
            _write_metrics_json(
                xgb_metrics,
                engine_label="XGBoost",
                engine_kind="xgboost_regressor_weighted_kpi_impact",
                group_name=group_name,
                test_metrics=test_metrics,
                n_train=len(train_df),
                n_test=len(test_df),
            )

        full_df = _cast_categoricals(df, model_family, cat_feature_names)
        final_params = _best_params(hyper_all, model_family, group_name, best_iter)
        final_model = _model_family_fit(
            model_family,
            final_params,
            cat_idx,
            full_df[feature_order],
            full_df[target_col].astype(float),
        )
        if model_family == "catboost":
            final_model.save_model(str(cat_model))
        else:
            final_model.save_model(str(xgb_model))

        if not quiet:
            print(
                f"  {model_family}: hold-out RMSE={test_metrics['RMSE']:.4f}  "
                f"R2={test_metrics['R2']:.3f}"
            )

    if need_cat:
        train_one("catboost")
    if need_xgb:
        train_one("xgboost")
    if not quiet:
        print()


def reset_nba_services() -> None:
    """Reload model artefacts after training."""
    from app.services.nba_service import nba_service as cat_svc
    from app.services.nba_service_xgb import xgb_nba_service as xgb_svc

    for svc in (cat_svc, xgb_svc):
        svc._attempted_load = False
        svc._model = None
        svc._load_error = None
        svc._model_metrics = None


def infer(
    asset_data: Mapping[str, Any],
    *,
    ensure_models: bool = True,
    force_train: bool = False,
    quiet_train: bool = True,
) -> dict[str, Any]:
    """
    Run ensemble inference for any dynamic situation.

    Returns the full ensemble payload (action_id, title, accuracy_leader,
    top_alternatives, submodel_metrics, ...).
    """
    bootstrap_paths()
    if ensure_models:
        ensure_model_artifacts(force_train=force_train, quiet=quiet_train)
    reset_nba_services()

    from app.services.nba_ensemble import predict_ensemble

    return predict_ensemble(dict(asset_data))


def public_result(result: Mapping[str, Any]) -> dict[str, Any]:
    """API-safe subset (omit large feature_row)."""
    out = dict(result)
    out.pop("feature_row", None)
    return out


def load_situation_json(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"Situation file not found: {p}")
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Situation JSON must be a single object")
    return data


def build_situation_from_fields(**fields: Any) -> dict[str, Any]:
    """Build asset payload from CLI / programmatic field overrides."""
    asset: dict[str, Any] = {}
    key_map = {
        "asset_id": ("asset_id", "assetId"),
        "status": ("status", "Status"),
        "criticality": ("criticality", "Criticality"),
        "asset_type": ("asset_type", "assetType", "type"),
        "plant": ("plant", "Plant"),
        "state": ("state", "State"),
        "rul": ("rul", "RUL"),
        "shift_hour_at_event": ("shift_hour_at_event", "shiftHourAtEvent"),
        "kpi_digest": ("kpiDigestForAi", "kpi_digest_for_ai"),
        "recent_temp_dev_c": ("recent_temp_dev_c", "recentTempDevC"),
        "recent_vibration_mm_s": ("recent_vibration_mm_s", "recentVibrationMmS"),
        "recent_waste_kg_last_hour": ("recent_waste_kg_last_hour", "recentWasteKgLastHour"),
        "recent_oee_pct": ("recent_oee_pct", "recentOeePct"),
        "operator_skill_level": ("operator_skill_level", "operatorSkillLevel"),
        "on_hold_inventory_kg_current": ("on_hold_inventory_kg_current", "onHoldInventoryKgCurrent"),
    }
    for arg_name, json_keys in key_map.items():
        val = fields.get(arg_name)
        if val is not None and val != "":
            asset[json_keys[0]] = val

    if fields.get("qc_nogo"):
        asset["qcSignals"] = {"no_go": True, "outcome": "no_go"}

    return asset


def _hr(char: str = "=", width: int = 72) -> str:
    return char * width


def _fmt_metric_block(label: str, metrics: dict[str, Any] | None) -> list[str]:
    lines: list[str] = []
    if not metrics:
        lines.append(f"  {label}: (no hold-out metrics on disk)")
        return lines
    holdout = metrics.get("holdout") or {}
    lines.append(f"  {label}:")
    lines.append(f"    engine ........... {metrics.get('engine_label', '-')}")
    lines.append(f"    hold-out RMSE .... {holdout.get('RMSE', '-')}")
    lines.append(f"    hold-out MAE ..... {holdout.get('MAE', '-')}")
    lines.append(f"    hold-out R2 ....... {holdout.get('R2', '-')}")
    return lines


def format_inference_text(asset_data: Mapping[str, Any], result: Mapping[str, Any]) -> str:
    """Human-readable report for terminal output."""
    from app.services.nba_features import build_situation_features
    from app.services.nba_ensemble import _resolve_accuracy_leader

    sit = build_situation_features(asset_data)
    lines: list[str] = []
    lines.append(_hr())
    lines.append("SITUATION")
    lines.append(_hr())
    lines.append(f"  asset_id ........... {asset_data.get('asset_id', '-')}")
    lines.append(f"  status ............. {sit['status']}")
    lines.append(f"  criticality ........ {sit['criticality']}")
    lines.append(f"  asset_type ......... {sit['asset_type']}")
    lines.append(f"  plant / state ...... {sit['plant']} / {sit['state']}")
    lines.append(f"  kpi_score / n_bad .. {sit['kpi_score']:.1f} / {int(sit['n_kpi_bad'])}")
    lines.append("")

    sub = result.get("submodel_metrics") or {}
    engines = result.get("engines_used") or {}
    lines.append(_hr())
    lines.append("ACCURACY LEADER (best model for this run)")
    lines.append(_hr())
    for block in (
        _fmt_metric_block("CatBoost", sub.get("catboost")),
        _fmt_metric_block("XGBoost", sub.get("xgboost")),
    ):
        lines.extend(block)
        lines.append("")
    leader_key, leader_reason = _resolve_accuracy_leader(
        bool(engines.get("catboost")),
        bool(engines.get("xgboost")),
        sub.get("catboost"),
        sub.get("xgboost"),
    )
    leader_name = {"catboost": "CatBoost", "xgboost": "XGBoost"}.get(leader_key or "", "-")
    lines.append(f"  >>> LEADER: {leader_name}")
    lines.append(f"  >>> REASON: {leader_reason}")
    lines.append("")

    alts = result.get("top_alternatives") or []
    lines.append(_hr())
    lines.append("CANDIDATE RANKING")
    lines.append(_hr())
    header = (
        f"{'ID':>3}  {'CatBoost':>9}  {'XGBoost':>9}  {'Leader':>9}  "
        f"{'Final':>8}  Title"
    )
    lines.append(header)
    lines.append("-" * len(header))
    for row in alts:
        cat_s = row.get("cat_score")
        xgb_s = row.get("xgb_score")
        lines.append(
            f"{row['action_id']:>3}  "
            f"{cat_s if cat_s is not None else '-':>9}  "
            f"{xgb_s if xgb_s is not None else '-':>9}  "
            f"{row.get('model_score', 0):>9.4f}  "
            f"{row.get('final_score', 0):>8.4f}  "
            f"{row.get('title', '')[:40]}"
        )
    lines.append("")

    lines.append(_hr())
    lines.append("BEST ACTION")
    lines.append(_hr())
    lines.append(f"  action_id .......... {result.get('action_id')}")
    lines.append(f"  title .............. {result.get('title')}")
    lines.append(f"  model_score ........ {result.get('model_score')}")
    lines.append(f"  final_score ........ {result.get('final_score')}")
    lines.append(f"  accuracy_leader .... {result.get('accuracy_leader')}")
    lines.append(f"  source_label ....... {result.get('source_label', '-')}")
    return "\n".join(lines)
