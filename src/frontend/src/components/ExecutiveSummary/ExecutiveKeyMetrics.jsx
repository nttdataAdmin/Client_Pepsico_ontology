import React, { useMemo, useState, useCallback } from 'react';
import { buildExecutiveKpiModel } from '../../utils/executiveKpiModel';
import { getExecutiveKpiDataPreview } from '../../utils/executiveKpiDataPreview';
import './ExecutiveKeyMetrics.css';

function TableGridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z" opacity="0.92" />
    </svg>
  );
}

function KpiDataModal({ open, preview, tileLabel, onClose }) {
  if (!open || !preview) return null;
  const { title, subtitle, columns, rows } = preview;
  return (
    <div className="es-kpi-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="es-kpi-modal es-kpi-modal--data card" role="dialog" aria-modal="true" aria-labelledby="es-kpi-data-title">
        <header className="es-kpi-modal-head">
          <div className="es-kpi-modal-head-main">
            <h4 id="es-kpi-data-title">{title}</h4>
            {tileLabel ? <p className="es-kpi-modal-tile-ref">Key metric · {tileLabel}</p> : null}
            <p className="es-kpi-modal-sub">{subtitle}</p>
          </div>
          <button type="button" className="es-kpi-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {columns.length && rows.length ? (
          <div className="es-kpi-data-table-wrap">
            <table className="es-kpi-data-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {columns.map((c) => (
                      <td key={c}>{row[c] === '' || row[c] == null ? '—' : String(row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="es-kpi-modal-empty">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function KpiWhyModal({ open, title, body, onClose }) {
  if (!open) return null;
  return (
    <div className="es-kpi-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="es-kpi-modal card" role="dialog" aria-modal="true" aria-labelledby="es-kpi-modal-title">
        <header className="es-kpi-modal-head">
          <h4 id="es-kpi-modal-title">{title}</h4>
          <button type="button" className="es-kpi-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="es-kpi-modal-body">{body}</div>
      </div>
    </div>
  );
}

function BandBadge({ band }) {
  if (!band) return null;
  const cls =
    band.key === 'good' ? 'es-kpi-band--good' : band.key === 'watch' ? 'es-kpi-band--watch' : 'es-kpi-band--bad';
  return <span className={`es-kpi-band ${cls}`}>{band.label}</span>;
}

/**
 * Key metrics: fleet + historian mocks, plus integrated pipeline feeds (consumer, workforce, quality) when synchronized.
 */
export default function ExecutiveKeyMetrics({
  filters,
  operatorRole,
  qcGo,
  selectedMonth,
  selectedYear,
  excelBundle,
}) {
  const model = useMemo(
    () =>
      buildExecutiveKpiModel({
        filters,
        operatorRole,
        qcGo,
        selectedMonth,
        selectedYear,
        excelBundle: excelBundle || {},
      }),
    [filters, operatorRole, qcGo, selectedMonth, selectedYear, excelBundle]
  );

  const [why, setWhy] = useState({ open: false, title: '', body: '' });
  const openWhy = useCallback((title, body) => setWhy({ open: true, title, body }), []);
  const closeWhy = useCallback(() => setWhy((s) => ({ ...s, open: false })), []);

  const [dataModal, setDataModal] = useState({ open: false, preview: null, tileLabel: '' });
  const openDataPreview = useCallback(
    (tileId, tileLabel) => {
      const preview = getExecutiveKpiDataPreview(tileId, {
        excelBundle: excelBundle || {},
        filters,
        model,
        operatorRole,
      });
      setDataModal({ open: true, preview, tileLabel });
    },
    [excelBundle, filters, model, operatorRole]
  );
  const closeDataPreview = useCallback(() => setDataModal({ open: false, preview: null, tileLabel: '' }), []);

  const { summary, rows, assetCountInTelemetry, workingPct } = model;

  const tiles = [
    {
      id: 'wastage',
      label: 'Wastage (yield loss)',
      value: `${model.wastagePct.toFixed(1)}%`,
      band: model.bands.wastage,
      sub:
        filters.state == null
          ? 'Select a site to anchor yield loss vs fleet posture'
          : qcGo
            ? `Nominal band · ${summary.total} assets in scope`
            : `From ${summary.breakdown} down / ${summary.failure_predicted} predicted / ${summary.under_maintenance} in PM`,
      whyTitle: 'Why this % · wastage',
      whyBody: model.reasons.wastage,
    },
    {
      id: 'productivity',
      label: 'Production index',
      value: `${model.productivityPct.toFixed(1)}%`,
      band: model.bands.productivity,
      sub:
        filters.state == null
          ? 'Throughput index updates after you pick a territory'
          : qcGo
            ? `Line rate vs plan · working share ${workingPct}%`
            : `Throughput vs schedule · ${selectedMonth} ${selectedYear}`,
      whyTitle: 'Why this % · production index',
      whyBody: model.reasons.productivity,
      extraLine: model.reasons.productivity,
    },
    {
      id: 'complaints',
      label: 'Consumer complaint load',
      value: `${model.consumerComplaintLoadPct.toFixed(1)}%`,
      band: model.bands.consumerComplaints,
      sub: 'Lower is better · consumer experience pipeline (region-aware with your site)',
      whyTitle: 'Why this % · complaints',
      whyBody: model.reasons.consumerComplaints,
    },
    {
      id: 'downtime',
      label: 'Downtime index',
      value: `${model.downtimePct.toFixed(1)}%`,
      band: model.bands.downtime,
      sub: 'Stoppage pressure vs fleet (breakdown + PM weighting)',
      whyTitle: 'Why this % · downtime',
      whyBody: model.reasons.downtime,
    },
    {
      id: 'quality',
      label: 'Quality score',
      value: `${model.qualityScorePct.toFixed(1)}%`,
      band: model.bands.quality,
      sub: 'Mean batch quality score when the quality pipeline feed is synchronized',
      whyTitle: 'Why this % · quality',
      whyBody: model.reasons.quality,
    },
    {
      id: 'workerSat',
      label: 'Worker satisfaction',
      value: `${model.workerSatisfactionPct.toFixed(1)}%`,
      band: model.bands.workerSatisfaction,
      sub: 'Comfort + efficiency perception from the workforce pulse pipeline',
      whyTitle: 'Why this % · worker satisfaction',
      whyBody: model.reasons.workerSatisfaction,
    },
    {
      id: 'temp',
      label: 'Avg. temperature (telemetry)',
      value: model.avgTemp != null ? `${model.avgTemp.toFixed(1)} °C` : '—',
      band: model.bands.temperature,
      whyBtnLabel: 'Why this value',
      sub: [
        model.telemetryTempRangeLabel,
        rows.length && assetCountInTelemetry
          ? `Mean of per-asset means · ${assetCountInTelemetry} asset${assetCountInTelemetry === 1 ? '' : 's'} · ${rows.length} points`
          : filters.state
            ? 'No temperature points in this scope.'
            : 'Select a site to load historian mix.',
      ].join(' · '),
      whyTitle: 'Temperature · ranges & rollup',
      whyBody: model.reasons.tempTelemetry,
    },
    {
      id: 'vib',
      label: 'Avg. vibration (RMS)',
      value: model.avgVib != null ? `${model.avgVib.toFixed(1)} mm/s` : '—',
      band: model.bands.vibration,
      whyBtnLabel: 'Why this value',
      sub: [
        model.telemetryVibRangeLabel,
        rows.length && assetCountInTelemetry
          ? `Aligned with production signals · ${filters.plant || filters.state || 'all'}`
          : filters.state
            ? 'No vibration points in this scope.'
            : 'Select a site to load historian mix.',
      ].join(' · '),
      whyTitle: 'Vibration · ranges & rollup',
      whyBody: model.reasons.vibTelemetry,
    },
  ];

  return (
    <section className="es-key-metrics card" aria-label="Key production metrics">
      <h3 className="es-key-metrics-title">Key metrics</h3>
      <p className="es-key-metrics-lead">
        KPIs are <strong>dynamic</strong> with your <strong>location</strong> (state / plant), <strong>operator lens</strong>{' '}
        (packaging, processing, or manager roll-up), <strong>QC path</strong>, and <strong>period</strong>. Complaint load,
        quality score, and worker satisfaction draw from the <strong>integrated operational data pipeline</strong> when
        feeds are synchronized; wastage, throughput, downtime, and telemetry blend the <strong>fleet registry</strong> with
        line historian signals for the same scope. The <strong>grid</strong> icon opens backing tables for each metric.
        Use <strong>Why this %</strong> (or <strong>Why this value</strong> on temperature / vibration) for the derivation
        note.
      </p>
      <div className="es-key-metrics-grid">
        {tiles.map((it) => (
          <div key={it.id} className="es-key-metric-tile">
            <div className="es-key-metric-top">
              <span className="es-key-metric-label">{it.label}</span>
              <div className="es-key-metric-top-right">
                <button
                  type="button"
                  className="es-kpi-data-icon"
                  onClick={() => openDataPreview(it.id, it.label)}
                  aria-label={`View backing data for ${it.label}`}
                  title="Backing data"
                >
                  <TableGridIcon />
                </button>
                {it.band ? <BandBadge band={it.band} /> : null}
              </div>
            </div>
            <span className="es-key-metric-value">{it.value}</span>
            {it.id === 'productivity' && it.extraLine ? (
              <p className="es-key-metric-reason">{it.extraLine}</p>
            ) : null}
            <span className="es-key-metric-sub">{it.sub}</span>
            <button type="button" className="es-kpi-why-btn" onClick={() => openWhy(it.whyTitle, it.whyBody)}>
              {it.whyBtnLabel || 'Why this %'}
            </button>
          </div>
        ))}
      </div>
      <KpiWhyModal open={why.open} title={why.title} body={why.body} onClose={closeWhy} />
      <KpiDataModal
        open={dataModal.open}
        preview={dataModal.preview}
        tileLabel={dataModal.tileLabel}
        onClose={closeDataPreview}
      />
    </section>
  );
}
