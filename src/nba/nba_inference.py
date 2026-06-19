"""
Backward-compatible entry point for NBA inference.

Prefer: python -m src.nba.inference
"""

from src.nba.inference.inference import (
    ACTION_LABELS,
    DEFAULT_CANDIDATES,
    load_demo_situation,
    main,
    recommend,
    score_situation,
)

__all__ = [
    "ACTION_LABELS",
    "DEFAULT_CANDIDATES",
    "load_demo_situation",
    "main",
    "recommend",
    "score_situation",
]

if __name__ == "__main__":
    raise SystemExit(main())
