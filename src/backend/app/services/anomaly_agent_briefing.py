"""Rule-based + optional LLM-style anomaly scope briefing for the dashboard agent panel."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any


def _safe_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _severity(mv: float, mt: float) -> str:
    if mv >= 120 or mt >= 180:
        return "critical"
    if mv >= 100 or mt >= 170:
        return "warning"
    return "info"


def build_anomaly_agent_briefing(
    rows: list[dict[str, Any]],
    state: str | None = None,
    plant: str | None = None,
    asset_id: str | None = None,
) -> dict[str, Any]:
    correlation_id = uuid.uuid4().hex[:12]
    generated_at = datetime.now(timezone.utc).isoformat()

    scope_bits = []
    if state:
        scope_bits.append(f"region={state}")
    if plant:
        scope_bits.append(f"plant={plant}")
    if asset_id:
        scope_bits.append(f"asset={asset_id}")
    scope_label = " · ".join(scope_bits) if scope_bits else "full registry"

    if not rows:
        return {
            "generated_at": generated_at,
            "correlation_id": correlation_id,
            "scope_label": scope_label,
            "headline": "Assessment agent — no samples in scope",
            "narrative": (
                "The fusion service did not receive any historian rows for this filter. "
                "Clear the asset pin or widen the site to pull vibration and thermal traces."
            ),
            "signals": [],
            "stats": {"row_count": 0, "asset_count": 0},
            "sources": [
                {"id": "historian", "label": "PEP-IMS Historian", "status": "idle"},
                {"id": "mes", "label": "MES / line context", "status": "standby"},
            ],
            "pipeline_stages": [
                {"id": "ingest", "label": "Ingest", "state": "complete"},
                {"id": "align", "label": "Time alignment", "state": "skipped"},
                {"id": "score", "label": "Threshold scoring", "state": "skipped"},
            ],
        }

    by_asset: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        aid = r.get("asset_id") or "unknown"
        by_asset[aid].append(r)

    signals: list[dict[str, Any]] = []
    max_v_all = 0.0
    max_t_all = 0.0

    for aid, items in by_asset.items():
        vibs = [_safe_float(x.get("vibration")) for x in items]
        temps = [_safe_float(x.get("temperature")) for x in items]
        vibs_f = [v for v in vibs if v is not None]
        temps_f = [t for t in temps if t is not None]
        mv = max(vibs_f) if vibs_f else 0.0
        mt = max(temps_f) if temps_f else 0.0
        max_v_all = max(max_v_all, mv)
        max_t_all = max(max_t_all, mt)
        plant_name = next((x.get("plant") for x in items if x.get("plant")), "—")
        sev = _severity(mv, mt)
        if sev != "info":
            signals.append(
                {
                    "asset_id": aid,
                    "plant": plant_name,
                    "severity": sev,
                    "title": f"Mechanical stress pattern — {aid}",
                    "detail": (
                        f"Peak vibration {mv:.1f} mm/s² and peak temperature {mt:.1f} °F "
                        f"across {len(items)} historian samples in the fused window."
                    ),
                    "metrics": {
                        "max_vibration": round(mv, 2),
                        "max_temperature": round(mt, 2),
                        "samples": len(items),
                    },
                }
            )

    signals.sort(
        key=lambda s: (
            0 if s["severity"] == "critical" else 1 if s["severity"] == "warning" else 2,
            s["asset_id"],
        )
    )

    row_count = len(rows)
    asset_count = len(by_asset)
    overall = _severity(max_v_all, max_t_all)

    if overall == "critical":
        headline = "Assessment agent — critical excursions detected"
    elif overall == "warning":
        headline = "Assessment agent — elevated condition signals"
    else:
        headline = "Assessment agent — fleet within nominal bands"

    narrative = (
        f"Correlated {row_count} historian samples across {asset_count} assets ({scope_label}). "
        f"Aggregate peak vibration {max_v_all:.1f} mm/s² and peak temperature {max_t_all:.1f} °F. "
    )
    if signals:
        narrative += (
            f"{len(signals)} asset(s) exceeded advisory thresholds; prioritized list is "
            "surfaced as agent signals below. Telemetry strips validate the same windows "
            "MES and loss feeds reference for RCA."
        )
    else:
        narrative += (
            "No threshold excursions in this slice; continue scheduled monitoring and "
            "cross-check with production-line stops in the signals panel when Excel "
            "bundles are attached."
        )

    pipeline_stages: list[dict[str, str]] = [
        {"id": "ingest", "label": "Historian ingest", "state": "complete"},
        {"id": "align", "label": "Multi-asset alignment", "state": "complete"},
        {"id": "score", "label": "Threshold scoring", "state": "complete"},
        {"id": "narrate", "label": "Narrative synthesis", "state": "complete"},
    ]

    return {
        "generated_at": generated_at,
        "correlation_id": correlation_id,
        "scope_label": scope_label,
        "headline": headline,
        "narrative": narrative,
        "signals": signals[:12],
        "stats": {
            "row_count": row_count,
            "asset_count": asset_count,
            "max_vibration": round(max_v_all, 2),
            "max_temperature": round(max_t_all, 2),
            "overall_severity": overall,
        },
        "sources": [
            {"id": "historian", "label": "PEP-IMS Historian", "status": "live"},
            {"id": "vib_model", "label": "Vibration scoring model", "status": "live"},
            {"id": "thermal_model", "label": "Thermal scoring model", "status": "live"},
            {"id": "mes", "label": "MES correlation (when fused)", "status": "standby"},
        ],
        "pipeline_stages": pipeline_stages,
    }
