#!/usr/bin/env python3
"""
NBA inference CLI — score any dynamic situation and pick the best action.

Examples (from repo root):

  # From a JSON file
  python src/nba/inference_main.py --json src/nba/examples/situation_breakdown.json

  # Inline JSON
  python src/nba/inference_main.py --json-inline "{\"status\":\"Breakdown\",\"criticality\":\"High\",\"asset_type\":\"Fryer\",\"plant\":\"Dallas\",\"state\":\"TX\"}"

  # Individual fields
  python src/nba/inference_main.py --status Breakdown --criticality High --asset-type "Seasoning Train" --plant Vancouver --state WA --kpi-digest "OEE 63% Bad"

  # JSON output only (for scripts / APIs)
  python src/nba/inference_main.py --json src/nba/examples/situation_breakdown.json --format json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from src.nba.inference import (
    build_situation_from_fields,
    format_inference_text,
    infer,
    load_situation_json,
    public_result,
)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="NBA ensemble inference: score a dynamic situation, pick best model, return best action."
    )
    src = p.add_mutually_exclusive_group()
    src.add_argument("--json", metavar="PATH", help="Path to situation JSON file")
    src.add_argument("--json-inline", metavar="JSON", help="Situation as inline JSON string")

    p.add_argument("--asset-id", default=None)
    p.add_argument("--status", default=None, help="Working | Breakdown | Under Maintenance | ...")
    p.add_argument("--criticality", default=None, help="Low | Medium | High")
    p.add_argument("--asset-type", dest="asset_type", default=None)
    p.add_argument("--plant", default=None)
    p.add_argument("--state", default=None)
    p.add_argument("--rul", default=None, help='e.g. "500 hours" or "0 hours"')
    p.add_argument("--kpi-digest", dest="kpi_digest", default=None, help="Multiline KPI text with Good/Bad labels")
    p.add_argument("--qc-nogo", action="store_true", help="Mark situation as QC No-Go")
    p.add_argument("--recent-oee", dest="recent_oee_pct", type=float, default=None)
    p.add_argument("--recent-temp-dev", dest="recent_temp_dev_c", type=float, default=None)
    p.add_argument("--recent-vibration", dest="recent_vibration_mm_s", type=float, default=None)
    p.add_argument("--shift-hour", dest="shift_hour_at_event", type=int, default=None)

    p.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format (default: human-readable text)",
    )
    p.add_argument("--skip-train", action="store_true", help="Do not auto-train missing models")
    p.add_argument("--train", action="store_true", help="Force re-train both engines before inference")
    return p.parse_args()


def _resolve_situation(args: argparse.Namespace) -> dict:
    if args.json:
        return load_situation_json(args.json)
    if args.json_inline:
        data = json.loads(args.json_inline)
        if not isinstance(data, dict):
            raise SystemExit("--json-inline must be a JSON object")
        return data

    fields = {
        "asset_id": args.asset_id,
        "status": args.status,
        "criticality": args.criticality,
        "asset_type": args.asset_type,
        "plant": args.plant,
        "state": args.state,
        "rul": args.rul,
        "kpi_digest": args.kpi_digest,
        "qc_nogo": args.qc_nogo,
        "recent_oee_pct": args.recent_oee_pct,
        "recent_temp_dev_c": args.recent_temp_dev_c,
        "recent_vibration_mm_s": args.recent_vibration_mm_s,
        "shift_hour_at_event": args.shift_hour_at_event,
    }
    asset = build_situation_from_fields(**fields)
    if not asset.get("status"):
        raise SystemExit(
            "Provide a situation via --json, --json-inline, or at least --status "
            "(plus criticality, asset-type, plant, state as needed)."
        )
    return asset


def main() -> int:
    args = _parse_args()
    try:
        asset_data = _resolve_situation(args)
    except (json.JSONDecodeError, ValueError, FileNotFoundError) as e:
        print(f"Error loading situation: {e}", file=sys.stderr)
        return 1

    try:
        result = infer(
            asset_data,
            ensure_models=not args.skip_train,
            force_train=args.train,
            quiet_train=args.format == "json",
        )
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if args.format == "json":
        print(json.dumps(public_result(result), indent=2))
    else:
        print(format_inference_text(asset_data, result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
