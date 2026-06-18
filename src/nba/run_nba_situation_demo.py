#!/usr/bin/env python3
"""
End-to-end NBA (Next Best Action) demo — terminal walkthrough.

Shows what the UI does behind the scenes for a *new situation*:
  1. Build situation features from asset context
  2. Enumerate eligible remediation candidates
  3. Score every candidate with CatBoost AND XGBoost
  4. Pick the accuracy leader (lower hold-out RMSE; tie → higher R²)
  5. Apply soft penalties, rank, and print the winning action

Run from the repo root:

    uv run python src/nba/run_nba_situation_demo.py
    uv run python src/nba/run_nba_situation_demo.py --scenario qc_nogo
    uv run python src/nba/run_nba_situation_demo.py --skip-train

Related source (read alongside this script):
  src/backend/app/services/nba_ensemble.py   — accuracy leader + ensemble scoring
  src/backend/app/services/nba_service.py    — CatBoost recommendation engine
  src/backend/app/services/nba_service_xgb.py  — XGBoost sister engine
  src/backend/app/services/nba_features.py   — situation / action feature builders
  src/nba/nba_training.py                      — full hyperparam sweep trainer
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Path bootstrap so `from app.services...` works outside uvicorn
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKEND_ROOT = _REPO_ROOT / "src" / "backend"
for p in (_REPO_ROOT, _BACKEND_ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

MODEL_DIR = _REPO_ROOT / "src" / "nba" / "model"
INPUT_DIR = MODEL_DIR / "input"
OUTPUT_DIR = MODEL_DIR / "output"
CSV_PATH = INPUT_DIR / "data" / "nba_training_data.csv"

# ---------------------------------------------------------------------------
# Sample "new situation" payloads (same shape the API / UI sends)
# ---------------------------------------------------------------------------
SCENARIOS: dict[str, dict[str, Any]] = {
    "breakdown": {
        "asset_id": "FL-5883",
        "status": "Breakdown",
        "criticality": "High",
        "asset_type": "Seasoning Train",
        "plant": "Vancouver",
        "state": "WA",
        "shift_hour_at_event": 1,
        "rul": "0 hours",
        "kpiDigestForAi": (
            "OEE 63.6% Bad\n"
            "Scrap 9.7% Watch\n"
            "Temp deviation 4.8C Bad\n"
            "Vibration 3.6 mm/s Watch"
        ),
        "recent_temp_dev_c": 4.84,
        "recent_vibration_mm_s": 3.64,
        "recent_waste_kg_last_hour": 9.7,
        "recent_oee_pct": 63.6,
        "operator_skill_level": 4,
        "on_hold_inventory_kg_current": 207.3,
    },
    "working": {
        "asset_id": "BM-2201",
        "status": "Working",
        "criticality": "Low",
        "asset_type": "Bag Maker",
        "plant": "Beloit",
        "state": "WI",
        "shift_hour_at_event": 6,
        "rul": "788 hours",
        "kpiDigestForAi": "OEE 74.6% Good\nScrap 4% Good",
        "recent_temp_dev_c": 1.64,
        "recent_vibration_mm_s": 1.08,
        "recent_waste_kg_last_hour": 11.3,
        "recent_oee_pct": 74.6,
        "operator_skill_level": 2,
        "on_hold_inventory_kg_current": 80.7,
    },
    "qc_nogo": {
        "asset_id": "FR-9012",
        "status": "Working",
        "criticality": "High",
        "asset_type": "Fryer",
        "plant": "Dallas",
        "state": "TX",
        "shift_hour_at_event": 3,
        "rul": "120 hours",
        "kpiDigestForAi": "Quality gate failed — hold production\nOEE 58% Bad\nScrap 12% Bad",
        "qcSignals": {"no_go": True, "outcome": "no_go"},
        "recent_temp_dev_c": 5.2,
        "recent_vibration_mm_s": 2.1,
        "recent_waste_kg_last_hour": 22.0,
        "recent_oee_pct": 58.0,
        "operator_skill_level": 3,
        "on_hold_inventory_kg_current": 145.0,
    },
}


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
    lines.append(f"    hyperparam group . {metrics.get('selected_hyperparam_group', '-')}")
    lines.append(f"    hold-out RMSE .... {holdout.get('RMSE', '-')}")
    lines.append(f"    hold-out MAE ..... {holdout.get('MAE', '-')}")
    lines.append(f"    hold-out R2 ....... {holdout.get('R2', '-')}")
    lines.append(f"    hold-out WMAPE ... {holdout.get('WMAPE', '-')}")
    return lines


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
    """Format expected by NBAService._read_metrics_summary (hyperparam_sweep key)."""
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


def ensure_model_artifacts(*, force_train: bool = False) -> None:
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
        print("Model artefacts already present - skipping training (use --train to refresh).\n")
        return

    if not CSV_PATH.is_file():
        raise SystemExit(f"Training CSV missing: {CSV_PATH}")

    import pandas as pd

    from src.nba.model_functions import (
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
    group_name = "basic"  # fast enough for demo; full sweep is in nba_training.py

    def train_one(model_family: str) -> None:
        print(f"\n--- Training {model_family} ({group_name} hyperparams) ---")
        params = dict(hyper_all[model_family][group_name])
        family_df = _cast_categoricals(df, model_family, cat_feature_names)
        train_df, test_df = _sequential_split(family_df, time_col, test_frac=0.22)
        X_train = train_df[feature_order]
        y_train = train_df[target_col].astype(float)
        X_test = test_df[feature_order]
        y_test = test_df[target_col].astype(float)

        if model_family == "catboost":
            cat_idx = [feature_order.index(c) for c in cat_feature_names if c in feature_order]
        else:
            cat_idx = None

        model = _model_family_fit(model_family, params, cat_idx, X_train, y_train, X_test, y_test)
        best_iter = _model_best_iter(model_family, model)
        y_pred_test = _model_predict(model_family, model, X_test, cat_features=cat_idx)
        test_metrics = _metrics(y_test.values, y_pred_test)
        print(
            f"  hold-out RMSE={test_metrics['RMSE']:.4f}  "
            f"MAE={test_metrics['MAE']:.4f}  R2={test_metrics['R2']:.3f}  "
            f"(stopped at iter {best_iter})"
        )

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
            print(f"  wrote {cat_model.name}, {cat_metrics.name}")
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
            print(f"  wrote {xgb_model.name}, {xgb_metrics.name}")

        # Refit on full data for deployment (same as nba_training promotion step)
        from src.nba.model_functions import _best_params

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

    if need_cat:
        train_one("catboost")
    if need_xgb:
        train_one("xgboost")

    print()


def print_situation(asset_data: dict[str, Any]) -> None:
    from app.services.nba_features import build_situation_features

    sit = build_situation_features(asset_data)
    print(_hr())
    print("STEP 1 - NEW SITUATION (asset context -> situation features)")
    print(_hr())
    print(f"  asset_id ........... {asset_data.get('asset_id', '-')}")
    print(f"  status ............. {sit['status']}")
    print(f"  criticality ........ {sit['criticality']}")
    print(f"  asset_type ......... {sit['asset_type']}")
    print(f"  plant / state ...... {sit['plant']} / {sit['state']}")
    print(f"  qc_nogo ............ {sit['qc_nogo']}")
    print(f"  kpi_score / n_bad .. {sit['kpi_score']:.1f} / {int(sit['n_kpi_bad'])}")
    print(f"  rul_numeric ........ {sit['rul_numeric']}")
    print(f"  shift hour / rem ... {int(sit['shift_hour_at_event'])}h / {int(sit['hours_remaining_in_shift'])}h left")
    print(f"  recent OEE ......... {sit['recent_oee_pct']:.1f}%")
    print(f"  recent temp dev .... {sit['recent_temp_dev_c']:.2f} C")
    print(f"  recent vibration ... {sit['recent_vibration_mm_s']:.2f} mm/s")
    print()


def print_accuracy_leader(result: dict[str, Any]) -> None:
    from app.services.nba_ensemble import _resolve_accuracy_leader

    engines = result.get("engines_used") or {}
    sub = result.get("submodel_metrics") or {}

    print(_hr())
    print("STEP 2 - HOLD-OUT ACCURACY (which engine drives this prediction?)")
    print(_hr())
    print("  Both models were trained on the same CSV with the same sequential hold-out.")
    print("  The ensemble picks the engine with LOWER hold-out RMSE (tie -> higher R2).\n")

    for block in (
        _fmt_metric_block("CatBoost", sub.get("catboost")),
        _fmt_metric_block("XGBoost", sub.get("xgboost")),
    ):
        print("\n".join(block))
        print()

    leader_key, leader_reason = _resolve_accuracy_leader(
        bool(engines.get("catboost")),
        bool(engines.get("xgboost")),
        sub.get("catboost"),
        sub.get("xgboost"),
    )
    leader_name = {"catboost": "CatBoost", "xgboost": "XGBoost"}.get(leader_key or "", "-")
    print(f"  >>> ACCURACY LEADER: {leader_name}")
    print(f"  >>> REASON: {leader_reason}")
    print(f"  >>> source_label: {result.get('source_label', '-')}")
    print()

    status = result.get("engines_status") or {}
    for eng in ("catboost", "xgboost"):
        st = status.get(eng) or {}
        if not st.get("ok"):
            print(f"  WARNING: {eng} unavailable - {st.get('reason')}")
    print()


def print_candidate_scores(result: dict[str, Any]) -> None:
    alts = result.get("top_alternatives") or []
    leader = result.get("accuracy_leader")

    print(_hr())
    print("STEP 3 - PER-CANDIDATE SCORES (both engines, leader score used for ranking)")
    print(_hr())
    if not alts:
        print("  No scored candidates (rule fallback may have been used).")
        print()
        return

    header = (
        f"{'ID':>3}  {'CatBoost':>9}  {'XGBoost':>9}  {'Leader':>9}  "
        f"{'Penalty':>8}  {'Final':>8}  {'Agree':>6}  Title"
    )
    print(header)
    print("-" * len(header))
    for row in alts:
        cat_s = row.get("cat_score")
        xgb_s = row.get("xgb_score")
        agree = row.get("engine_agreement")
        leader_score = row.get("model_score")
        print(
            f"{row['action_id']:>3}  "
            f"{cat_s if cat_s is not None else '-':>9}  "
            f"{xgb_s if xgb_s is not None else '-':>9}  "
            f"{leader_score:>9.4f}  "
            f"{row.get('soft_penalty', 0):>8.4f}  "
            f"{row.get('final_score', 0):>8.4f}  "
            f"{agree if agree is not None else '-':>6}  "
            f"{row.get('title', '')[:40]}"
        )
    print()
    print(
        f"  Leader column uses {leader or '-'} scores only (no averaging). "
        "Final = model_score - soft_penalty (clamped 0..1)."
    )
    print()


def print_winner(result: dict[str, Any]) -> None:
    print(_hr())
    print("STEP 4 - WINNING NEXT BEST ACTION")
    print(_hr())
    print(f"  action_id .......... {result.get('action_id')}")
    print(f"  title .............. {result.get('title')}")
    print(f"  model_score ........ {result.get('model_score')}")
    print(f"  final_score ........ {result.get('final_score')}")
    print(f"  engine_agreement ... {result.get('engine_agreement')}")
    if result.get("playbook"):
        pb = result["playbook"]
        print(f"  playbook ........... {pb[:200]}{'...' if len(pb) > 200 else ''}")
    print()

    probs = result.get("top_probabilities") or []
    if probs:
        print("  Normalized probabilities (final_score / sum of final_scores):")
        for p in probs:
            pct = float(p.get("probability", 0)) * 100
            print(f"    [{p.get('action_id')}] {p.get('title', '')[:50]:<50} {pct:5.1f}%")
    print()


def run_demo(scenario: str, *, skip_train: bool, force_train: bool) -> int:
    if scenario not in SCENARIOS:
        names = ", ".join(sorted(SCENARIOS))
        raise SystemExit(f"Unknown scenario {scenario!r}. Choose from: {names}")

    asset_data = SCENARIOS[scenario]

    print(_hr("*"))
    print("NBA ENSEMBLE DEMO - terminal walkthrough")
    print(f"Scenario: {scenario!r}  |  model dir: {OUTPUT_DIR}")
    print(_hr("*"))
    print()

    if not skip_train:
        ensure_model_artifacts(force_train=force_train)

    # Reset singleton load flags so freshly trained artefacts are picked up
    from app.services.nba_service import nba_service as cat_svc
    from app.services.nba_service_xgb import xgb_nba_service as xgb_svc

    for svc in (cat_svc, xgb_svc):
        svc._attempted_load = False
        svc._model = None
        svc._load_error = None
        svc._model_metrics = None

    from app.services.nba_ensemble import predict_ensemble

    print_situation(asset_data)
    result = predict_ensemble(asset_data)
    print_accuracy_leader(result)
    print_candidate_scores(result)
    print_winner(result)

    print(_hr())
    print("Done. Same logic powers the Recommendations UI via the FastAPI backend.")
    print("Key modules: nba_ensemble.py, nba_service.py, nba_service_xgb.py, nba_features.py")
    print(_hr())
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run NBA ensemble prediction for a sample situation and print the full flow."
    )
    parser.add_argument(
        "--scenario",
        choices=sorted(SCENARIOS),
        default="breakdown",
        help="Which sample situation to score (default: breakdown)",
    )
    parser.add_argument(
        "--skip-train",
        action="store_true",
        help="Do not train/copy models; fail if artefacts are missing",
    )
    parser.add_argument(
        "--train",
        action="store_true",
        help="Force re-train both CatBoost and XGBoost (basic hyperparams)",
    )
    args = parser.parse_args()
    return run_demo(args.scenario, skip_train=args.skip_train, force_train=args.train)


if __name__ == "__main__":
    raise SystemExit(main())
