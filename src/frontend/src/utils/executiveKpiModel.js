/**
 * Shared executive KPI math for Key metrics strip, tooltips, and AI recommendation context.
 * Blends fleet + historian mocks with integrated pipeline feeds (consumer, workforce, quality) when synchronized.
 */

import { getAnomalies, getAssetsFiltered, buildSummaryFromAssets } from '../data/mockData';

function mean(nums) {
  const v = nums.filter((n) => Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function scopeUnit(...parts) {
  let h = 2166136261 >>> 0;
  const s = parts.filter(Boolean).join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 10007) / 10007;
}

function perAssetFieldMean(rows, field) {
  const byAsset = new Map();
  for (const r of rows) {
    const id = r.asset_id || '_';
    if (!byAsset.has(id)) byAsset.set(id, []);
    const v = Number(r[field]);
    if (Number.isFinite(v)) byAsset.get(id).push(v);
  }
  const perAssetAvgs = [...byAsset.values()].map((arr) => mean(arr)).filter((x) => x != null);
  return mean(perAssetAvgs);
}

function wastagePercent(summary, qcGo, scopeKey, month, year) {
  const total = Math.max(summary.total, 1);
  if (qcGo) {
    const u = scopeUnit(scopeKey, 'go', month, year, String(summary.total));
    return Math.round((0.45 + u * 0.95) * 10) / 10;
  }
  const fp = summary.failure_predicted;
  const um = summary.under_maintenance;
  const bd = summary.breakdown;
  const stress = (fp * 1.15 + um * 0.85 + bd * 2.05) / total;
  const u = scopeUnit(scopeKey, 'nogo', month, String(fp), String(bd));
  return Math.round((0.85 + stress * 9.2 + u * 1.25) * 10) / 10;
}

function productivityPercent(summary, qcGo, scopeKey, month, year, wastagePct) {
  const total = Math.max(summary.total, 1);
  const wShare = summary.working / total;
  if (qcGo) {
    const u = scopeUnit(scopeKey, 'prod', month, year, 'qc');
    return Math.round((94.6 + u * 4.6 + wShare * 1.8) * 10) / 10;
  }
  const bdShare = summary.breakdown / total;
  const raw = 99.2 - wastagePct * 2.05 - bdShare * 11.5 + wShare * 4.5;
  return Math.round(Math.max(71, Math.min(98.8, raw)) * 10) / 10;
}

function downtimePercent(summary, qcGo, scopeKey, month, year) {
  const total = Math.max(summary.total, 1);
  if (qcGo) {
    const u = scopeUnit(scopeKey, 'down', month, year, 'go');
    return Math.round((0.65 + u * 0.55) * 10) / 10;
  }
  const down = summary.breakdown + summary.under_maintenance * 0.72 + summary.failure_predicted * 0.35;
  const u = scopeUnit(scopeKey, 'down2', month, String(year));
  return Math.round(Math.min(32, (down / total) * 38 + u * 5.2) * 10) / 10;
}

function bandHigherBetter(pct, goodAt, warnBelow) {
  if (pct >= goodAt) return { label: 'Good', key: 'good' };
  if (pct >= warnBelow) return { label: 'Watch', key: 'watch' };
  return { label: 'Bad', key: 'bad' };
}

function bandLowerBetter(pct, goodBelow, warnAbove) {
  if (pct <= goodBelow) return { label: 'Good', key: 'good' };
  if (pct <= warnAbove) return { label: 'Watch', key: 'watch' };
  return { label: 'Bad', key: 'bad' };
}

function excelConsumerLoadPct(rows, state) {
  if (!rows.length) return { pct: 6.2, note: 'Consumer experience pipeline not hydrated; showing nominal complaint-load index.' };
  let list = rows;
  if (state) {
    const st = String(state).toLowerCase();
    const filtered = rows.filter((r) => {
      const reg = String(r.Region || '').toLowerCase();
      if (st.includes('jonesboro') || st.includes('beloit')) return reg === 'us' || reg === '' || reg === 'north america';
      return true;
    });
    if (filtered.length) list = filtered;
  }
  const sev = (r) => {
    const s = String(r.Severity || '').toLowerCase();
    if (s === 'high') return 14;
    if (s === 'medium') return 8;
    return 4;
  };
  const score = list.reduce((a, r) => a + sev(r), 0);
  const pct = Math.min(42, Math.round((score / Math.max(list.length * 10, 1)) * 100 * 10) / 10);
  return {
    pct,
    note: `Derived from consumer experience pipeline (${list.length} record(s) in scope): severity mix × volume → complaint-load index. Higher = more escalation pressure.`,
  };
}

function excelWorkerSatPct(rows) {
  if (!rows.length) return { pct: 82.0, note: 'Workforce pulse pipeline not hydrated; nominal team pulse.' };
  const vals = [];
  for (const r of rows) {
    const a = Number(r['Comfort_New_Method(1-5)']);
    const b = Number(r['Efficiency_Perception(1-5)']);
    if (!Number.isFinite(a) && !Number.isFinite(b)) continue;
    vals.push((((Number.isFinite(a) ? a : 3) + (Number.isFinite(b) ? b : 3)) / 10) * 100);
  }
  const m = mean(vals);
  const pct = m != null ? Math.round(m * 10) / 10 : 80;
  return {
    pct,
    note: `From workforce pulse pipeline: mean of comfort + efficiency perception (1–5 each), scaled to %.`,
  };
}

function excelQualityPct(rows) {
  if (!rows.length) return { pct: 91.5, note: 'Batch quality pipeline not hydrated; nominal quality score.' };
  const nums = rows.map((r) => Number(r.QualityScore)).filter(Number.isFinite);
  if (!nums.length) return { pct: 90.0, note: 'Batch quality pipeline rows without numeric QualityScore.' };
  return {
    pct: Math.round(mean(nums) * 10) / 10,
    note: `From batch quality pipeline: average QualityScore across ${nums.length} batch record(s).`,
  };
}

/** °C — mean of per-asset means (demo historian); lower thermal stress is better. */
const TELEMETRY_TEMP_GOOD_MAX = 155;
const TELEMETRY_TEMP_WATCH_MAX = 172;

/** mm/s RMS — demo executive strip (lower vibration stress is better). */
const TELEMETRY_VIB_GOOD_MAX = 55;
const TELEMETRY_VIB_WATCH_MAX = 80;

export const TELEMETRY_TEMP_RANGE_LABEL = `Good ≤${TELEMETRY_TEMP_GOOD_MAX} °C · Watch ${(TELEMETRY_TEMP_GOOD_MAX + 0.1).toFixed(1)}–${TELEMETRY_TEMP_WATCH_MAX} °C · Bad >${TELEMETRY_TEMP_WATCH_MAX} °C`;

export const TELEMETRY_VIB_RANGE_LABEL = `Good ≤${TELEMETRY_VIB_GOOD_MAX} mm/s RMS · Watch ${(TELEMETRY_VIB_GOOD_MAX + 0.1).toFixed(1)}–${TELEMETRY_VIB_WATCH_MAX} · Bad >${TELEMETRY_VIB_WATCH_MAX}`;

function tempTelemetryBand(avgC) {
  if (avgC == null || !Number.isFinite(avgC)) return null;
  if (avgC <= TELEMETRY_TEMP_GOOD_MAX) return { label: 'Good', key: 'good' };
  if (avgC <= TELEMETRY_TEMP_WATCH_MAX) return { label: 'Watch', key: 'watch' };
  return { label: 'Bad', key: 'bad' };
}

function vibTelemetryBand(avgMmS) {
  if (avgMmS == null || !Number.isFinite(avgMmS)) return null;
  if (avgMmS <= TELEMETRY_VIB_GOOD_MAX) return { label: 'Good', key: 'good' };
  if (avgMmS <= TELEMETRY_VIB_WATCH_MAX) return { label: 'Watch', key: 'watch' };
  return { label: 'Bad', key: 'bad' };
}

function productivityReason(summary, qcGo, wastagePct, productivityPct) {
  const total = Math.max(summary.total, 1);
  const wShare = (summary.working / total) * 100;
  if (qcGo) {
    return `Nominal run: working assets ${wShare.toFixed(0)}% of fleet keeps the index high (${productivityPct}%). Wastage is only ${wastagePct}%.`;
  }
  const bd = summary.breakdown;
  const fp = summary.failure_predicted;
  return `Index at ${productivityPct}% because yield loss is ${wastagePct}% with ${bd} breakdown(s) and ${fp} failure-predicted assets in this scope — schedule drag and exception handling pull the production index down.`;
}

/**
 * @returns {object} all KPI values, bands, one-line reasons, and excel notes for tooltips / AI.
 */
export function buildExecutiveKpiModel({
  filters,
  operatorRole,
  qcGo,
  selectedMonth,
  selectedYear,
  excelBundle,
}) {
  const scopeKey = [filters.state, filters.plant, filters.asset_id, operatorRole].filter(Boolean).join('·') || 'fleet';
  const assets = getAssetsFiltered(filters, { operatorRole });
  const summary = buildSummaryFromAssets(assets);
  const rows = getAnomalies({ state: filters.state, plant: filters.plant }, { operatorRole });
  const sheets = excelBundle?.sheets || {};

  const wastagePct = wastagePercent(summary, qcGo, scopeKey, selectedMonth, selectedYear);
  const productivityPct = productivityPercent(summary, qcGo, scopeKey, selectedMonth, selectedYear, wastagePct);
  const downtimePct = downtimePercent(summary, qcGo, scopeKey, selectedMonth, selectedYear);

  const cc = excelConsumerLoadPct(sheets.Consumer_Complaints?.rows || [], filters.state);
  const wk = excelWorkerSatPct(sheets.Worker_Satisfaction?.rows || []);
  const qn = excelQualityPct(sheets.KPI_Quality?.rows || []);

  const avgTemp = perAssetFieldMean(rows, 'temperature');
  const avgVib = perAssetFieldMean(rows, 'vibration');
  const assetCountInTelemetry = new Set(rows.map((r) => r.asset_id).filter(Boolean)).size;

  const prodBand = bandHigherBetter(productivityPct, 88, 80);
  const wasteBand = bandLowerBetter(wastagePct, 3.5, 6.5);
  const downBand = bandLowerBetter(downtimePct, 4, 9);
  const ccBand = bandLowerBetter(cc.pct, 10, 18);
  const qualBand = bandHigherBetter(qn.pct, 92, 86);
  const wkBand = bandHigherBetter(wk.pct, 85, 75);

  const tempBand = avgTemp != null ? tempTelemetryBand(avgTemp) : null;
  const vibBand = avgVib != null ? vibTelemetryBand(avgVib) : null;

  const workingPct = ((summary.working / Math.max(summary.total, 1)) * 100).toFixed(0);

  return {
    scopeKey,
    summary,
    rows,
    wastagePct,
    productivityPct,
    downtimePct,
    consumerComplaintLoadPct: cc.pct,
    qualityScorePct: qn.pct,
    workerSatisfactionPct: wk.pct,
    avgTemp,
    avgVib,
    assetCountInTelemetry,
    workingPct,
    telemetryTempRangeLabel: TELEMETRY_TEMP_RANGE_LABEL,
    telemetryVibRangeLabel: TELEMETRY_VIB_RANGE_LABEL,
    bands: {
      wastage: wasteBand,
      productivity: prodBand,
      downtime: downBand,
      consumerComplaints: ccBand,
      quality: qualBand,
      workerSatisfaction: wkBand,
      temperature: tempBand,
      vibration: vibBand,
    },
    reasons: {
      wastage:
        filters.state == null
          ? 'Pick a site to anchor scrap vs fleet posture.'
          : qcGo
            ? `Nominal band with ${summary.total} assets in scope.`
            : `Elevated when breakdown / predicted-failure mix rises vs working fleet.`,
      productivity: productivityReason(summary, qcGo, wastagePct, productivityPct),
      downtime:
        filters.state == null
          ? 'Downtime index activates after site selection.'
          : `Blends breakdown + PM-heavy assets vs fleet; aligned to ${selectedMonth} ${selectedYear} scope.`,
      consumerComplaints: cc.note,
      quality: qn.note,
      workerSatisfaction: wk.note,
      tempTelemetry:
        avgTemp == null
          ? 'No temperature series in scope.'
          : `Rollup is the mean of per-asset means for assets in your filter. Bands (°C): ${TELEMETRY_TEMP_RANGE_LABEL}. Your rolled-up mean is ${avgTemp.toFixed(1)} °C → ${tempBand?.label || '—'}.`,
      vibTelemetry:
        avgVib == null
          ? 'No vibration series in scope.'
          : `Rollup is the mean of per-asset RMS-style vibration for assets in your filter. Bands (mm/s): ${TELEMETRY_VIB_RANGE_LABEL}. Your rolled-up mean is ${avgVib.toFixed(1)} mm/s → ${vibBand?.label || '—'}.`,
    },
  };
}

/** Markdown block for Azure prompt — user asked to highlight all KPIs with %. */
export function formatKpiDigestForPrompt(m) {
  if (!m) return '';
  const line = (label, pct, band) => `- **${label}:** **${typeof pct === 'number' ? pct.toFixed(1) : pct}%** (${band?.label || '—'})`;
  const parts = [
    line('Wastage (yield loss)', m.wastagePct, m.bands.wastage),
    line('Production index', m.productivityPct, m.bands.productivity),
    line('Downtime index', m.downtimePct, m.bands.downtime),
    line('Consumer complaint load', m.consumerComplaintLoadPct, m.bands.consumerComplaints),
    line('Quality score', m.qualityScorePct, m.bands.quality),
    line('Worker satisfaction', m.workerSatisfactionPct, m.bands.workerSatisfaction),
  ];
  if (m.avgTemp != null && m.bands.temperature) {
    parts.push(
      `- **Avg. temperature (telemetry):** **${m.avgTemp.toFixed(1)} °C** (${m.bands.temperature.label}) — ${m.telemetryTempRangeLabel}`
    );
  }
  if (m.avgVib != null && m.bands.vibration) {
    parts.push(
      `- **Avg. vibration (RMS):** **${m.avgVib.toFixed(1)} mm/s** (${m.bands.vibration.label}) — ${m.telemetryVibRangeLabel}`
    );
  }
  return parts.join('\n');
}
