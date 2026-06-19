# NBA Model — Training & Inference

## Files

| File | Role |
|------|------|
| `nba_training.py` | Orchestrates the hyperparam sweep and writes artifacts |
| `model_functions.py` | Shared helpers (split, fit, metrics, predict) |
| `inference/inference.py` | Loads the saved model and scores candidate actions |
| `inference/demo_situation.json` | Example situation input for inference demo |
| `nba_inference.py` | Backward-compatible entry point |
| `model/input/` | CSV, hyperparams, feature manifest |
| `model/output/` | Trained model + sweep results |

## Training flow (`nba_training.py`)

1. Load `nba_training_data.csv`, `hyper_parameters.json`, `feature_manifest.json`.
2. For each model family (`catboost`, `xgboost`):
   - Cast categoricals on the full dataframe.
   - Sequential hold-out split on `event_seq` (22% test — no future leakage).
   - For each hyperparam group (`basic`, `medium`, `high`):
     - Fit with early stopping on the test set.
     - Predict train + test; compute metrics.
     - If **test RMSE** is the lowest so far → mark as current best.
3. Write sweep results to CSV.
4. Retrain **one** final model on **all rows** using the winning family, group, and tree count.
5. Save `final_model.cbm` + `nba_metrics.json` (+ feature importance, holdout preds).

**6 candidates, 1 saved model.** Sweep models stay in memory only; only the global winner is persisted.

## Training helpers (`model_functions.py`)

| Function | Purpose |
|----------|---------|
| `_sequential_split` | Train = past `event_seq`, test = future |
| `_cast_categoricals` | CatBoost → string; XGBoost → pandas `category` |
| `_model_family_fit` | Fit CatBoost or XGBoost (early stop during sweep) |
| `_model_best_iter` | Tree count after early stopping |
| `_metrics` | MSE, RMSE, MAE, R², etc. (sklearn) |
| `_model_predict` | Family-specific predict |
| `_best_params` | Winning params with `iterations` / `n_estimators` capped to best tree count |

**Winner selection:** lowest `test RMSE` across all 6 runs.

**Final fit:** same params, fixed tree count, full dataset, no early stopping.

## Outputs

```
model/output/
  final_model.cbm                      ← deployed model (CatBoost or XGBoost)
  nba_metrics.json                     ← winner metadata, feature order, family
  nba_hyperparam_sweep_results.csv     ← all 6 runs compared
  nba_feature_importance_best_model.json
  nba_holdout_predictions_best_model.csv
```

Run training:

```bash
python -c "from src.nba.nba_training import nba_training; nba_training()"
```

## Inference (`inference/`)

1. Load `final_model.cbm` and `nba_metrics.json` (model family + feature order).
2. Pass a **situation dict** (see `inference/demo_situation.json`).
3. For each candidate action (default 0–7):
   - Build a feature row via `build_full_feature_row()`.
   - Cast categoricals to match training.
   - Predict `weighted_kpi_impact` (0–1, higher = better).
4. Rank actions by score; return best + full list.

**Entry points:**
- `score_situation()` — ranked predictions for one situation
- `recommend()` — best action + ranked list
- `load_demo_situation()` — load example input from JSON
- `main()` — demo on sample situation

Run inference:

```bash
python -m src.nba.inference
```

### Demo situation input

```json
{
  "status": "Failure Predicted",
  "criticality": "High",
  "asset_type": "Seasoning Train",
  "plant": "Frito-Lay-West",
  "state": "AZ",
  "shift_hour_at_event": 1,
  "rul": "186.9",
  "kpiDigestForAi": "Production Goal 43.0% Bad | True Efficiency 55.4% Bad | ...",
  "recent_temp_dev_c": 5.33,
  "recent_vibration_mm_s": 3.1,
  "recent_waste_kg_last_hour": 29.0,
  "recent_oee_pct": 55.4,
  "operator_skill_level": 4,
  "on_hold_inventory_kg_current": 15.8,
  "qc_nogo": 0
}
```

Situation fields map to 16 model features; `action_id` (0–7) is added per candidate.

## Quick diagram

```
hyper_parameters.json (6 configs)
        ↓
  sweep on hold-out → pick min test RMSE
        ↓
  retrain on full data → final_model.cbm
        ↓
  nba_inference scores actions → ranked recommendation
```
