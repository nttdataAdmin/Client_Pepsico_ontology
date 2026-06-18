import math

import numpy as np
import pandas as pd
import xgboost as xgb
from catboost import CatBoostRegressor, Pool
from sklearn.metrics import (
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    mean_squared_log_error,
    r2_score,
)


def _training_basis_text(model_family: str, n_rows: int, n_features: int) -> str:
    return (
        f"PepsiCo NBA {model_family} regressor trained on {n_rows} "
        "(situation x candidate-action) rows "
        f"with {n_features} features. Target is `weighted_kpi_impact`, the same convex combination "
        "of 11 operational sub-KPIs used by the CatBoost model. Categoricals (status, criticality, "
        "asset_type, plant, state, action_id) are passed via XGBoost's native categorical path "
        "(enable_categorical=True, tree_method='hist'). Hyperparameter groups (basic/medium/high) "
        "mirror the CatBoost trainer's sweep philosophy mapped to XGBoost-native arg names; the "
        "lowest hold-out RMSE wins. Same sequential hold-out by event_seq as the CatBoost trainer, "
        "so the two models are directly comparable. Synthetic data for the demo — replace with "
        "real work-order outcomes + engineered context features when moving to production."
    )


def _weighted_mape_mae(y: np.ndarray, y_pred: np.ndarray) -> tuple[float, float]:
    y = y.astype(float)
    y_pred = y_pred.astype(float)
    abs_err = np.abs(y - y_pred)
    weights = np.where(y > 0, y, 1e-6)
    wmape = (
        float(np.sum(weights * abs_err / weights) / np.sum(weights)) if np.sum(weights) > 0 else 0.0
    )
    wmae = float(np.sum(weights * abs_err) / np.sum(weights)) if np.sum(weights) > 0 else 0.0
    return wmape, wmae


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mse = float(mean_squared_error(y_true, y_pred))
    rmse = float(math.sqrt(mse))
    mae = float(mean_absolute_error(y_true, y_pred))
    mape = float(mean_absolute_percentage_error(np.where(y_true == 0, 1e-6, y_true), y_pred))
    msle = float(mean_squared_log_error(np.clip(y_true, 0, None), np.clip(y_pred, 0, None)))
    r2 = float(r2_score(y_true, y_pred))
    wmape, wmae = _weighted_mape_mae(y_true, y_pred)
    return {
        "MSE": mse,
        "RMSE": rmse,
        "MAE": mae,
        "MAPE": mape,
        "MSLE": msle,
        "R2": r2,
        "WMAPE": wmape,
        "WMAE": wmae,
    }


def _sequential_split(
    df: pd.DataFrame, time_col: str, test_frac: float = 0.25
) -> tuple[pd.DataFrame, pd.DataFrame]:
    seqs = sorted(df[time_col].unique())
    split_idx = int(len(seqs) * (1.0 - test_frac))
    if split_idx <= 0 or split_idx >= len(seqs):
        split_idx = max(1, len(seqs) - 1)
    split_seq = seqs[split_idx]
    train = df[df[time_col] < split_seq].copy()
    test = df[df[time_col] >= split_seq].copy()
    if test.empty:
        # fall back to last 20% rows
        n = max(1, int(len(df) * test_frac))
        train = df.iloc[:-n].copy()
        test = df.iloc[-n:].copy()
    return train, test


def _cast_categoricals(
    df: pd.DataFrame, model_family: str, cat_feature_names: list[str]
) -> pd.DataFrame:
    out = df.copy()
    if model_family == "catboost":
        # cast categoricals to string (CatBoost requirement when using cat_features)
        for c in cat_feature_names:
            if c in out.columns:
                out[c] = out[c].astype(str)
        return out
    else:
        for c in cat_feature_names:
            if c in out.columns:
                out[c] = out[c].astype(str).astype("category")
        return out


def _model_family_fit(model_family, params, cat_idx, X_train, y_train, X_test=None, y_test=None):
    if model_family == "catboost":
        model = CatBoostRegressor(
            loss_function="RMSE",
            random_seed=42,
            early_stopping_rounds=80,
            **params,
        )
        if X_test is None or y_test is None:
            model.set_params(early_stopping_rounds=None)
            model.fit(
                Pool(X_train, y_train, cat_features=cat_idx),
                use_best_model=True,
                verbose=False,
            )
        else:
            model.fit(
                Pool(X_train, y_train, cat_features=cat_idx),
                eval_set=Pool(X_test, y_test, cat_features=cat_idx),
                use_best_model=True,
                verbose=False,
            )

    elif model_family == "xgboost":
        model = xgb.XGBRegressor(
            objective="reg:squarederror",
            tree_method="hist",
            enable_categorical=True,
            random_state=42,
            n_jobs=-1,
            early_stopping_rounds=80,
            eval_metric="rmse",
            **params,
        )
        if X_test is None or y_test is None:
            model.set_params(early_stopping_rounds=None)
            model.fit(
                X_train,
                y_train,
                verbose=False,
            )
        else:
            model.fit(
                X_train,
                y_train,
                eval_set=[(X_test, y_test)],
                verbose=False,
            )

    else:
        raise ValueError("no compatible model family")

    return model


def _model_best_iter(model_family, model):
    if model_family == "catboost":
        best_iter = int(getattr(model, "tree_count_", 0))
    elif model_family == "xgboost":
        # XGBoost's best_iteration is 0-indexed; tree count is best_iter + 1
        best_iter = int(getattr(model, "best_iteration", 0) or 0) + 1
    else:
        raise ValueError("no compatible model family")

    return best_iter


def _model_predict(model_family, model, X, cat_features):
    if model_family == "catboost":
        return model.predict(Pool(X, cat_features=cat_features))
    elif model_family == "xgboost":
        return model.predict(X)
    else:
        raise ValueError("no compatible model family")


def _model_importances(model_family, model):
    if model_family == "catboost":
        importances = list(zip(model.feature_names_, model.get_feature_importance(), strict=False))
        importances.sort(key=lambda x: -x[1])
    elif model_family == "xgboost":
        # Feature importance — gain-based, matches what stakeholders expect from an XGBoost run.
        booster = model.get_booster()
        gain_map: dict[str, float] = booster.get_score(importance_type="gain")
        features = gain_map.keys()
        # XGBoost gives back only features that produced at least one split;
        # pad zero-importance ones.
        importances = [(f, float(gain_map.get(f, 0.0))) for f in features]
        importances.sort(key=lambda x: -x[1])
    else:
        raise ValueError("no compatible model family")

    return importances


def _best_params(model_family_hyper_parameters, best_model_family, best_name, best_iter):
    # Final fit on ALL rows with the winning params (matches PepsiCo's promotion step)
    best_params = dict(model_family_hyper_parameters[best_model_family][best_name])
    if best_iter > 0:
        if best_model_family == "catboost":
            best_params["iterations"] = best_iter  # avoid retraining for 10k when we picked
        elif best_model_family == "xgboost":
            best_params["n_estimators"] = best_iter  # avoid retraining 10k when we picked 800
    else:
        raise ValueError("no compatible model family")

    return best_params
