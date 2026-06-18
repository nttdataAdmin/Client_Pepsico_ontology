"""
Train the NBA REGRESSOR on the (situation x candidate-action) dataset.

Aligned with the methodology Cristina & Unai shared (TrainingFunctions.py /
4_MODEL_TRAINING.py):

* PepsiCo "basic / medium / high" hyperparameter groups, swept in order. We
  log every group's hold-out metrics (MSE, RMSE, MAE, MAPE, MSLE, R2, WMAPE,
  weighted MAE) and pick the lowest test RMSE as the deployed model.
* Sequential hold-out by `event_seq` (mirrors `YM_ID < split_month`), so the
  trainer never peeks at future situations during evaluation.
* Sub-KPI columns and meta columns are dropped from X (mirrors PepsiCo's
  KPI_TARGETS handling).

Outputs:
  nba/model/output/final_model.cbm                            — final model regressor
  nba/model/output/nba_hyperparam_sweep_results.csv           — all sweep results for train/test
  nba/model/output/nba_feature_importance_best_model.json     — top features for the best model
  nba/model/output/nba_holdout_predictions_best_model.csv     — holdout best model predictions
  nba/model/output/nba_metrics.json                           — full metrics + chosen hyperparams
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from src.nba.model_functions import (
    _best_params,
    _cast_categoricals,
    _metrics,
    _model_best_iter,
    _model_family_fit,
    _model_importances,
    _model_predict,
    _sequential_split,
    _training_basis_text,
)


def nba_training() -> int:
    MODEL_FOLDER = Path().resolve() / "src" / "nba" / "model"
    DATA_DIR = MODEL_FOLDER / "input" / "data"
    CSV_PATH = DATA_DIR / "nba_training_data.csv"
    HYPER_PARAMETERS = MODEL_FOLDER / "input" / "hyper_parameters.json"
    MANIFEST = MODEL_FOLDER / "input" / "feature_manifest.json"
    TARGET_DEF = MODEL_FOLDER / "input" / "target_definition.json"
    MODEL_OUTPUT = MODEL_FOLDER / "output"
    MODEL_OUTPUT.mkdir(parents=True, exist_ok=True)

    if not CSV_PATH.is_file():
        print(f"Missing {CSV_PATH}", file=sys.stderr)
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    target_def = json.loads(TARGET_DEF.read_text(encoding="utf-8"))
    model_family_hyper_parameters = json.loads(HYPER_PARAMETERS.read_text(encoding="utf-8"))

    feature_order: list[str] = list(manifest["feature_order"])
    cat_feature_names: list[str] = list(manifest["cat_feature_names"])
    target_col: str = manifest["target"]
    time_col: str = manifest.get("time_column", "event_seq")

    df = pd.read_csv(CSV_PATH)
    if target_col not in df.columns:
        print(f"Target column {target_col} not in CSV", file=sys.stderr)
        return 1

    sweep: dict[str, dict[str, dict[str, Any]]] = {}
    train_dfs: dict[str, pd.DataFrame] = {}
    test_dfs: dict[str, pd.DataFrame] = {}
    best_model_family: str = ""
    best_name: str = ""
    best_rmse = float("inf")
    best_model = None

    for model_family in model_family_hyper_parameters:
        sweep[model_family] = {}
        hyper_parameters = model_family_hyper_parameters[model_family]
        print(f"\n=== Training {model_family} regressor ===")

        # Cast categoricals BEFORE the split so train/test share the same category set.
        # Sharing the dtype across train/test/full-fit is critical for non-CatBoost models' native
        # categorical path; otherwise unseen levels at predict time raise.
        model_family_df = _cast_categoricals(df, model_family, cat_feature_names)

        # train-test split
        train_df, test_df = _sequential_split(model_family_df, time_col, test_frac=0.22)
        train_dfs[model_family] = train_df
        test_dfs[model_family] = test_df
        X_train = train_df[feature_order]
        y_train = train_df[target_col].astype(float)
        X_test = test_df[feature_order]
        y_test = test_df[target_col].astype(float)

        if model_family == "catboost":
            cat_idx = [feature_order.index(c) for c in cat_feature_names if c in feature_order]
        else:
            cat_idx = None

        for name, params in hyper_parameters.items():
            print(f"Fitting hyperparam group '{name}' with params={params} ...", flush=True)
            model = _model_family_fit(
                model_family, params, cat_idx, X_train, y_train, X_test, y_test
            )
            best_iter = _model_best_iter(model_family, model)
            print(f"  -> stopped at iteration {best_iter}", flush=True)

            y_pred_train = _model_predict(model_family, model, X_train, cat_features=cat_idx)
            y_pred_test = _model_predict(model_family, model, X_test, cat_features=cat_idx)

            metrics_train = _metrics(y_train.values, y_pred_train)
            metrics_test = _metrics(y_test.values, y_pred_test)

            sweep[model_family][name] = {
                "params": params,
                "train": metrics_train,
                "test": metrics_test,
                "best_iteration": best_iter,
            }
            if metrics_test["RMSE"] < best_rmse:
                best_model_family = model_family
                best_rmse = metrics_test["RMSE"]
                best_name = name
                best_model = model

    # SAVING ALL MODELS RESULTS
    sweep_rows = []
    for family, family_sweep in sweep.items():
        for name, info in family_sweep.items():
            sweep_rows.append(
                {
                    "model_family": family,
                    "hyperparam_group": name,
                    "best_iteration": info["best_iteration"],
                    "params": info["params"],
                    **{f"train_{key}": value for key, value in info["train"].items()},
                    **{f"test_{key}": value for key, value in info["test"].items()},
                }
            )

    sweep_df = pd.DataFrame(sweep_rows)

    SWEEP_OUTPUT = MODEL_OUTPUT / "nba_hyperparam_sweep_results.csv"
    sweep_df.to_csv(SWEEP_OUTPUT, index=False)

    # Getting the best Model Information
    assert best_model is not None
    best_iter = sweep[best_model_family][best_name]["best_iteration"]
    best_params = _best_params(
        model_family_hyper_parameters, best_model_family, best_name, best_iter
    )
    print(
        f"Best Model Family: {best_model_family}\n"
        f"Best hyperparam group: {best_name}\n"
        f"(test RMSE={best_rmse:.4f}, best_iteration={best_iter})"
    )

    # Best Model's Feature importance
    importances = _model_importances(best_model_family, best_model)
    fi_payload = {name: float(val) for name, val in importances}
    IMPORTANCE_OUTPUT = MODEL_OUTPUT / "nba_feature_importance_best_model.json"
    (IMPORTANCE_OUTPUT).write_text(json.dumps(fi_payload, indent=2), encoding="utf-8")

    # Best Model's hold-out predictions for review
    # Use the test_df from the best model's family
    holdout_df = test_dfs[best_model_family].copy()
    if best_model_family == "catboost":
        cat_idx = [feature_order.index(c) for c in cat_feature_names if c in feature_order]
    else:
        cat_idx = None

    holdout_df["y_pred"] = _model_predict(
        model_family=best_model_family,
        model=best_model,
        X=holdout_df[feature_order],
        cat_features=cat_idx,
    )
    holdout_df["abs_error"] = (holdout_df["y_pred"] - holdout_df[target_col]).abs()
    HOLDOUT_OUTPUT = MODEL_OUTPUT / "nba_holdout_predictions_best_model.csv"
    holdout_df.to_csv(HOLDOUT_OUTPUT, index=False)

    # TRAINING THE FINAL MODEL WITH THE BEST HYPERPARAMS ON THE FULL DATASET
    best_model_family_df = _cast_categoricals(df, best_model_family, cat_feature_names)
    if best_model_family == "catboost":
        cat_idx = [feature_order.index(c) for c in cat_feature_names if c in feature_order]
    else:
        cat_idx = None

    final_model = _model_family_fit(
        best_model_family,
        best_params,
        cat_idx,
        best_model_family_df[feature_order],
        best_model_family_df[target_col],
    )
    FINAL_MODEL_OUTPUT = MODEL_OUTPUT / "final_model.cbm"
    final_model.save_model(str(FINAL_MODEL_OUTPUT))

    METRICS_OUTPUT = MODEL_FOLDER / "output" / "nba_metrics.json"
    payload = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "training_basis": _training_basis_text(best_model_family, len(df), len(feature_order)),
        "data_file": str(CSV_PATH.relative_to(MODEL_FOLDER)),
        "n_samples": int(len(df)),
        "n_train_split": int(len(train_df)),
        "n_test_split": int(len(test_df)),
        "split_strategy": manifest.get("split_strategy", "sequential_holdout"),
        "target": target_col,
        "target_definition_file": str(TARGET_DEF.relative_to(MODEL_FOLDER)),
        "target_weights": {k: v["weight"] for k, v in target_def["sub_kpis"].items()},
        "feature_order": feature_order,
        "cat_feature_names": cat_feature_names,
        "selected_model_family": best_model_family,
        "selected_hyperparam_group": best_name,
        "deployed_iterations": int(best_iter),
        "top_feature_importance": dict(importances[:15]),
        "model_written": str(MODEL_OUTPUT.relative_to(MODEL_FOLDER)),
        "artifacts": {
            "metrics_json": str(METRICS_OUTPUT.relative_to(MODEL_FOLDER)),
            "feature_importance_json": str(IMPORTANCE_OUTPUT.relative_to(MODEL_FOLDER)),
            "holdout_predictions_csv": str(HOLDOUT_OUTPUT.relative_to(MODEL_FOLDER)),
            "nba_hyperparam_sweep_results_csv": str(SWEEP_OUTPUT.relative_to(MODEL_FOLDER)),
            "final_model": str(FINAL_MODEL_OUTPUT.relative_to(MODEL_FOLDER)),
        },
    }
    METRICS_OUTPUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print("=== NBA Regressors — sweep summary ===")
    for family, family_sweep in sweep.items():
        print(
            f"Model Family {family} - Samples: {len(df)} |"
            f" Train: {len(train_dfs[family])} | Test: {len(test_dfs[family])}"
        )
        for name, info in family_sweep.items():
            tr, te = info["train"], info["test"]
            print(
                f"  {name:<6} iters={info['best_iteration']:<5} "
                f"train RMSE={tr['RMSE']:.4f}  R2={tr['R2']:.3f}   |   "
                f"test RMSE={te['RMSE']:.4f}  MAE={te['MAE']:.4f}  R2={te['R2']:.3f}"
            )

    print(f"\nSelected: {best_model_family}-{best_name}")
    print("Top 10 feature importances:")
    for name, val in importances[:10]:
        print(f"  {val:7.3f}  {name}")

    print(f"\nWrote {FINAL_MODEL_OUTPUT.name}")
    print(f"Wrote {METRICS_OUTPUT.name}")
    print(f"Wrote {HOLDOUT_OUTPUT.name}")
    return 0
