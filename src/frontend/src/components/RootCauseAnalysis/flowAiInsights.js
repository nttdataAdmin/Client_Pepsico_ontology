/**
 * Deterministic “assessment agent” copy for flow-chart nodes (no external AI).
 */

export function flowAiInsightFleet(total) {
  return {
    tag: 'Fleet',
    headline: 'Scope aggregation',
    summary: `The drill path starts from ${total} asset(s) in view. The agent ranks exposure using criticality, open work, and recent threshold traffic—not raw counts alone.`,
    bullets: [
      'Use fleet totals to sanity-check whether the story is localized or systemic.',
      'If one region dominates anomalies, bias the next hop toward that state column.',
    ],
    confidence: 'Contextual',
  };
}

export function flowAiInsightState(state, count) {
  return {
    tag: 'Region',
    headline: `${state} · ${count} asset(s)`,
    summary: `Regional policies (spares, contractors, training) shape how fast this class of issue converts to downtime. ${state} is acting as the geographic anchor for the trace.`,
    bullets: [
      'Compare against peer states if repeat codes appear across plants.',
      'Heat and humidity profiles can accelerate bearing and lube failure modes.',
    ],
    confidence: 'Moderate',
  };
}

export function flowAiInsightPlant(plant, count) {
  return {
    tag: 'Plant',
    headline: plant,
    summary: `Line historians and MES context are fused at plant grain. ${count} asset(s) here share maintenance calendars and crew—useful for batching inspections after a crossing.`,
    bullets: [
      'Check whether the same shift pattern correlates with excursion timing.',
      'Plant-level OEE coupling explains why a single asset still gets executive airtime.',
    ],
    confidence: 'Moderate',
  };
}

export function flowAiInsightAsset(assetId, rul) {
  const rulLine =
    rul != null && rul !== ''
      ? `RUL horizon ~${rul} h (modelled) informs whether you defer to window maintenance or interrupt production.`
      : 'RUL context will tighten once the model binds this asset class.';
  return {
    tag: 'Asset',
    headline: assetId,
    summary: `This unit is the telemetry anchor: thresholds, pareto contributors, and CMMS work orders are keyed here. ${rulLine}`,
    bullets: [
      'Asset-level pareto should align with the root-cause probability column on the right.',
      'If vibration and thermal disagree, suspect sensor mounting or process load swings.',
    ],
    confidence: 'High',
  };
}

export function flowAiInsightRul(rul) {
  return {
    tag: 'RUL band',
    headline: `Threshold ${rul}`,
    summary:
      'Remaining useful life buckets route prescriptive actions: short horizons bias toward immediate inspection; longer horizons favor trend watch and lubrication verification.',
    bullets: [
      'Cross-check RUL with actual hours and last bearing change—models drift when BOM data lags.',
      'Sudden jumps in RUL often indicate a model recalibration, not a physical miracle.',
    ],
    confidence: 'Modelled',
  };
}

export function flowAiInsightCause(cause, probability) {
  const pct = Math.round((probability || 0) * 100);
  return {
    tag: 'Hypothesis',
    headline: cause,
    summary: `This hypothesis carries ~${pct}% blended weight from equipment history, similarity clusters, and threshold narratives. It is a ranked belief, not a single truth.`,
    bullets: [
      'Validate with physical inspection paths (listen, temp gun, oil sample) before major tear-down.',
      'If two hypotheses are close, run a short controlled test (speed/load) to decouple them.',
    ],
    confidence: pct >= 55 ? 'High' : pct >= 35 ? 'Moderate' : 'Exploratory',
  };
}
