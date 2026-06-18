"""
XGBoost-backed sister of `NBAService`.

Plugs into the same Recommendation-Engine machinery (candidate generation,
soft penalties, tie-break, action catalog) but scores each candidate with the
XGBoost regressor produced by `scripts/train_nba_xgboost.py`.

What changes vs the CatBoost service:

* `_load_model` looks for `model_xgb.json` (XGBoost's portable JSON format)
  instead of `model.cbm`. There is NO emergency CSV trainer here — XGBoost
  has its own dedicated training script, and silently training a CatBoost on
  this object would defeat the whole point of having two engines.
* `_predict_score_from_values` builds a 1-row pandas DataFrame, casts the
  categorical columns to pandas `Categorical` dtype (matching how the
  trainer encoded them), and calls `model.predict`.

Everything else — eligibility, hard constraints, soft penalties, ranking —
is inherited from `NBAService` so the two engines stay in lockstep.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, List, Mapping, Optional, Tuple

from app.services.nba_service import NBAService

logger = logging.getLogger(__name__)


class XGBoostNBAService(NBAService):
    """Same recommendation flow, scored by an XGBoost regressor."""

    engine_kind: str = "xgboost_regressor_weighted_kpi_impact"
    engine_label: str = "XGBoost"
    metrics_filename: str = "nba_metrics_xgb.json"

    # ------------------------------------------------------------------ load
    def _train_from_csv(self, csv_path: Path):  # noqa: ARG002
        """Disable the CatBoost CSV emergency trainer for the XGBoost service.

        If `model_xgb.json` is missing the right answer is to run
        `python scripts/train_nba_xgboost.py`, not to silently train a
        different model family.
        """
        raise NotImplementedError(
            "XGBoostNBAService has no CSV emergency trainer; "
            "run scripts/train_nba_xgboost.py to produce model_xgb.json."
        )

    def _load_model(self, d: Path) -> Tuple[Any, Optional[str]]:
        model_path = d / "model_xgb.json"
        if not model_path.is_file():
            return (
                None,
                f"No XGBoost model at {model_path} — run scripts/train_nba_xgboost.py first.",
            )
        try:
            import xgboost as xgb
        except ImportError as exc:
            return None, f"xgboost not installed: {exc}"
        m = xgb.XGBRegressor()
        m.load_model(str(model_path))
        return m, None

    # ------------------------------------------------------------ scoring
    def _predict_score_from_values(
        self,
        values: List[Any],
        row_dict: Mapping[str, Any],
    ) -> float:
        """Score one row with XGBoost.

        XGBoost's native categorical path requires pandas `Categorical` dtype,
        not raw strings. We build a 1-row DataFrame in the trained
        `feature_order` and cast each known cat column.
        """
        import pandas as pd

        # Build {col: value} from the ordered list, then DataFrame in feature_order
        # so column order matches what XGBoost saw at fit time.
        record = dict(zip(self._feature_order, values))
        df = pd.DataFrame([record], columns=self._feature_order)
        for c in self._cat_names:
            if c in df.columns:
                df[c] = df[c].astype(str).astype("category")
        pred = self._model.predict(df)
        try:
            return float(pred[0])
        except (TypeError, IndexError):
            return float(pred)


xgb_nba_service = XGBoostNBAService()
