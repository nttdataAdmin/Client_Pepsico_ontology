import React, { useMemo } from 'react';
import { deriveRcaFlowSnapshot } from './deriveRcaFlowSnapshot';
import './RcaTraceGraphic.css';

function latestSignalLabel(crossings, pastEvents, rootCauses) {
  const sorted = crossings?.length
    ? [...crossings].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    : [];
  const c = sorted[sorted.length - 1];
  if (c) {
    const unit = c.type === 'vibration' ? 'mm/s²' : '°F';
    return `${c.type === 'vibration' ? 'Vibration' : 'Thermal'} · ${c.threshold} @ ${c.time} · ${c.value?.toFixed?.(1) ?? c.value} ${unit}`;
  }
  const e = pastEvents?.[pastEvents.length - 1];
  if (e?.description) return e.description;
  if (e?.type && e?.time) return `${e.type} · ${e.time}${e.threshold ? ` · ${e.threshold}` : ''}`;
  if (rootCauses?.length) {
    const top = [...rootCauses].sort((a, b) => (b.probability || 0) - (a.probability || 0))[0];
    return `No crossing in current window · dominant model factor: ${top.cause} (${Math.round((top.probability || 0) * 100)}%).`;
  }
  return 'Bind anomaly telemetry or select an asset with historian events to anchor this line.';
}

/**
 * Executive-style scope strip + causal findings (muted visuals, minimal motion).
 */
export default function RcaTraceGraphic({
  data,
  selectedPath,
  thresholdCrossings = [],
  scopeState = null,
  scopePlant = null,
}) {
  const snap = useMemo(
    () => deriveRcaFlowSnapshot(data, selectedPath, thresholdCrossings, scopeState, scopePlant),
    [data, selectedPath, thresholdCrossings, scopeState, scopePlant]
  );

  const whySteps = useMemo(() => {
    if (!snap) return [];
    const signal = latestSignalLabel(snap.crossingsForAsset, snap.pastEvents, snap.rootCauses);
    const causes = [...(snap.rootCauses || [])].sort((a, b) => (b.probability || 0) - (a.probability || 0));
    const steps = [
      {
        key: 'symptom',
        step: '00',
        role: 'Observation',
        title: 'Condition signal',
        body: signal,
      },
    ];
    causes.slice(0, 4).forEach((c, i) => {
      steps.push({
        key: `why-${i}`,
        step: String(i + 1).padStart(2, '0'),
        role: `Hypothesis ${i + 1}`,
        title: c.cause,
        body:
          c.probability != null
            ? `Weighted contribution ${Math.round((c.probability || 0) * 100)}% · reconcile with pareto, maintenance history, and threshold log.`
            : 'Evaluate against equipment tree and prior work orders.',
      });
    });
    if (steps.length === 1) {
      steps.push({
        key: 'why-generic',
        step: '01',
        role: 'Hypothesis 1',
        title: 'Degradation / misalignment',
        body: 'Narrow with line walk-down and sensor correlation from the anomalies view.',
      });
    }
    return steps;
  }, [snap]);

  if (!snap) return null;

  const whereSteps = [
    { key: 'fleet', n: '01', label: 'Fleet', value: String(snap.total), hint: 'assets in scope' },
    { key: 'region', n: '02', label: 'Region', value: snap.currentState || '—', hint: 'geography' },
    { key: 'plant', n: '03', label: 'Plant', value: snap.currentPlant || '—', hint: 'site / line' },
    { key: 'asset', n: '04', label: 'Asset', value: snap.currentAssetId || '—', hint: 'signal source' },
  ];

  return (
    <section className="rca-trace-mature" aria-label="Scope and causal summary">
      <header className="rca-trace-mature-head">
        <h3 className="rca-trace-mature-title">Scope narrowing and causal line</h3>
        <p className="rca-trace-mature-sub">
          Analytical summary aligned to the drill path below. Scope follows fleet → asset; findings chain from the
          observed condition through ranked hypotheses.
        </p>
      </header>

      <div className="rca-trace-mature-scope">
        <div className="rca-trace-mature-scope-label">Scope</div>
        <div className="rca-trace-mature-rail" aria-hidden>
          <div className="rca-trace-mature-rail-line" />
          <div className="rca-trace-mature-rail-pulse" />
        </div>
        <ol className="rca-trace-mature-steps">
          {whereSteps.map((s) => (
            <li key={s.key} className="rca-trace-mature-step">
              <div className="rca-trace-mature-step-inner">
                <span className="rca-trace-mature-step-n">{s.n}</span>
                <div className="rca-trace-mature-step-body">
                  <span className="rca-trace-mature-step-label">{s.label}</span>
                  <strong className="rca-trace-mature-step-value">{s.value}</strong>
                  <span className="rca-trace-mature-step-hint">{s.hint}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="rca-trace-mature-causal">
        <div className="rca-trace-mature-causal-label">Causal chain</div>
        <table className="rca-trace-mature-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Role</th>
              <th scope="col">Finding</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {whySteps.map((row) => (
              <tr key={row.key}>
                <td className="rca-trace-mature-mono">{row.step}</td>
                <td>{row.role}</td>
                <td className="rca-trace-mature-em">{row.title}</td>
                <td className="rca-trace-mature-detail">{row.body}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
