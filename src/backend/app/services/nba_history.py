"""
Historical action-pick counts derived from the training data.

For each unexpected-situation status (Working / Failure Predicted / Breakdown /
…), we count how many past situations were "won" by each remediation action —
i.e. for each `event_id`, the action whose `weighted_kpi_impact` was the
highest in `nba_training_data.csv`. That gives the UI a concrete "this action
has been the winner N times in M similar situations" number to show beside
each candidate, without inventing data or hardcoding values.

We deliberately do NOT just count rows by `action_id`, because the training
CSV has every action listed against every situation (situation × candidate),
so a raw count would be `total_situations` for every action. The argmax-per-
event approach is the meaningful one.

Loaded once at first call and memoised.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_APP_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_CSV = _APP_DIR / "data" / "nba" / "nba_training_data.csv"


def _csv_path() -> Path:
    return _DEFAULT_CSV


@lru_cache(maxsize=1)
def _winner_counts() -> Dict[str, Dict[int, int]]:
    """{status: {action_id: count_of_situations_won_by_this_action}}.

    Cached for the lifetime of the process.
    """
    csv = _csv_path()
    if not csv.is_file():
        return {}
    try:
        import pandas as pd

        df = pd.read_csv(csv)
    except Exception as e:  # noqa: BLE001
        logger.warning("nba_history: failed to read %s: %s", csv, e)
        return {}

    needed = {"event_id", "action_id", "weighted_kpi_impact", "status"}
    if not needed.issubset(df.columns):
        logger.warning("nba_history: training CSV missing columns %s", needed - set(df.columns))
        return {}

    # For each situation (event_id), find the row whose target is the highest;
    # that action is the historical "winner" for that situation.
    idx = df.groupby("event_id")["weighted_kpi_impact"].idxmax()
    winners = df.loc[idx, ["status", "action_id"]]

    out: Dict[str, Dict[int, int]] = {}
    for status, aid in zip(winners["status"].astype(str).tolist(), winners["action_id"].tolist()):
        try:
            aid_int = int(aid)
        except (TypeError, ValueError):
            continue
        bucket = out.setdefault(status, {})
        bucket[aid_int] = bucket.get(aid_int, 0) + 1
    return out


@lru_cache(maxsize=1)
def _total_situations_by_status() -> Dict[str, int]:
    """{status: number_of_distinct_event_ids_with_this_status}."""
    csv = _csv_path()
    if not csv.is_file():
        return {}
    try:
        import pandas as pd

        df = pd.read_csv(csv)
    except Exception as e:  # noqa: BLE001
        logger.warning("nba_history: failed to read %s: %s", csv, e)
        return {}

    if not {"event_id", "status"}.issubset(df.columns):
        return {}

    situations = df.drop_duplicates(subset=["event_id"])
    return {str(k): int(v) for k, v in situations.groupby("status").size().to_dict().items()}


def history_count_for(status: Optional[str], action_id: int) -> int:
    """How many past situations of this `status` were won by `action_id`."""
    s = str(status or "")
    return int(_winner_counts().get(s, {}).get(int(action_id), 0))


def history_for_status(status: Optional[str]) -> Dict[str, Any]:
    """UI-friendly summary for one status: total situations + per-action wins."""
    s = str(status or "")
    return {
        "status": s,
        "total_situations": int(_total_situations_by_status().get(s, 0)),
        "by_action": {int(k): int(v) for k, v in (_winner_counts().get(s, {}) or {}).items()},
    }
