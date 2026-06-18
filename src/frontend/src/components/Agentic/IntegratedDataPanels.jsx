import React, { useMemo, useState, useCallback } from 'react';
import { useAppFlow } from '../../context/AppFlowContext';
import {
  buildExecutiveStreams,
  buildAnomalySignals,
  buildActionItems,
  buildDowntimeEvents,
  buildScheduleDowntimeEvents,
} from '../../utils/agenticSynthesis';
import { buildRcaCorroborationPanelModel } from '../../utils/rcaCorroborationModel';
import './IntegratedDataPanels.css';

export function DataFeedHint() {
  const { excelLoading, excelError, excelBundle } = useAppFlow();
  if (excelLoading && !excelBundle) {
    return <p className="agentic-feed-hint">Synchronizing cross-system operational feeds…</p>;
  }
  if (excelError && !excelBundle) {
    return null;
  }
  return null;
}

export function ExecutiveLandingStreams() {
  const { excelBundle } = useAppFlow();
  const tables = useMemo(() => buildExecutiveStreams(excelBundle || {}), [excelBundle]);

  if (!tables.length) {
    return (
      <p className="agentic-empty">
        Supplemental workforce, process, and waste narratives will appear here as the assessment agent merges
        MES, labor, and loss signals with the map above.
      </p>
    );
  }

  return (
    <div className="agentic-stream-stack">
      {tables.map((t) => (
        <section key={t.key} className="agentic-stream agentic-stream--tabular">
          <h3>{t.title}</h3>
          <div className="agentic-table-wrap">
            <table className="agentic-data-table">
              <thead>
                <tr>
                  {t.columns.map((col) => (
                    <th key={col} scope="col">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, ri) => (
                  <tr key={ri}>
                    {t.columns.map((col) => {
                      const v = row[col];
                      const show = v != null && String(v).trim() !== '';
                      return (
                        <td key={col} className={show ? undefined : 'agentic-data-table__empty'}>
                          {show ? v : '\u00a0'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function formatFusionTime(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { timeStyle: 'short', dateStyle: 'short' }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function AnomalySignalsPanel({ fusionMeta = null, scopeFilters = null }) {
  const { excelBundle } = useAppFlow();
  const signals = useMemo(() => buildAnomalySignals(excelBundle || {}), [excelBundle]);
  const [filterTab, setFilterTab] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [query, setQuery] = useState('');

  const toggleExpand = useCallback((id) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return signals.filter((s) => {
      if (scopeFilters?.state && s.scopeState && s.scopeState !== scopeFilters.state) return false;
      if (filterTab === 'vibration' && s.signalChannel !== 'vibration') return false;
      if (filterTab === 'thermal' && s.signalChannel !== 'thermal') return false;
      if (filterTab === 'general' && s.signalChannel !== 'general') return false;
      if (q) {
        const hay = `${s.productionLine} ${s.detail || ''} ${s.kpiSignal} ${s.assetId || ''} ${s.sensorId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [signals, filterTab, query, scopeFilters]);

  const counts = useMemo(() => {
    const c = { all: signals.length, vibration: 0, thermal: 0, general: 0 };
    signals.forEach((s) => {
      if (s.signalChannel === 'vibration') c.vibration++;
      else if (s.signalChannel === 'thermal') c.thermal++;
      else c.general++;
    });
    return c;
  }, [signals]);

  if (!signals.length) {
    return (
      <p className="agentic-empty">
        Production-line stop and KPI-trigger narratives will populate when line historians and alarm metadata
        are fused for this scope. Use the live telemetry strips below for raw condition traces.
      </p>
    );
  }

  return (
    <section className="anomaly-signals-shell" aria-labelledby="anomaly-signals-heading">
      <div className="anomaly-signals-shell-header">
        <div>
          <h3 id="anomaly-signals-heading" className="anomaly-signals-shell-title">
            Fused production-line signals
          </h3>
          <p className="anomaly-signals-shell-lead">
            Parsed from operational feeds — filter by channel, expand a card for full sensor context, or search by
            asset / tag.
          </p>
        </div>
        {fusionMeta?.correlationId ? (
          <div className="anomaly-signals-fusion-strip" aria-label="Telemetry fusion link">
            <span className="anomaly-signals-fusion-dot" aria-hidden />
            <span className="anomaly-signals-fusion-text">
              Linked run <code className="anomaly-signals-fusion-code">{fusionMeta.correlationId}</code>
              {formatFusionTime(fusionMeta.generatedAt) ? (
                <>
                  {' · '}
                  <time dateTime={fusionMeta.generatedAt}>{formatFusionTime(fusionMeta.generatedAt)}</time>
                </>
              ) : null}
            </span>
          </div>
        ) : (
          <div className="anomaly-signals-fusion-strip anomaly-signals-fusion-strip--local">
            <span className="anomaly-signals-fusion-text">Excel bundle narrative (connect API for live fusion stamp)</span>
          </div>
        )}
      </div>

      <div className="anomaly-signals-toolbar">
        <div className="anomaly-signals-tabs" role="tablist" aria-label="Filter by signal type">
          {[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'vibration', label: 'Vibration', count: counts.vibration },
            { id: 'thermal', label: 'Temperature', count: counts.thermal },
            { id: 'general', label: 'Other', count: counts.general },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filterTab === tab.id}
              className={`anomaly-signals-tab ${filterTab === tab.id ? 'anomaly-signals-tab--active' : ''}`}
              onClick={() => {
                setFilterTab(tab.id);
                setExpandedId(null);
              }}
            >
              {tab.label}
              <span className="anomaly-signals-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="anomaly-signals-search"
          placeholder="Search asset, sensor, KPI…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search fused signals"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="agentic-empty anomaly-signals-empty">No signals match this filter — try another tab or clear search.</p>
      ) : (
        <div className="agentic-signals agentic-signals--interactive">
          {filtered.map((s, idx) => {
            const expanded = expandedId === s.id;
            const sev = s.severity || 'info';
            const ch = s.signalChannel || 'general';
            return (
              <article
                key={s.id}
                className={`agentic-signal-card agentic-signal-card--interactive agentic-signal-card--ch-${ch} agentic-signal-card--${sev}`}
                style={{ animationDelay: `${Math.min(idx, 12) * 0.04}s` }}
              >
                <button
                  type="button"
                  className="agentic-signal-card-hit"
                  aria-expanded={expanded}
                  onClick={() => toggleExpand(s.id)}
                >
                  <div className="agentic-signal-card-hit-main">
                    <div className="agentic-signal-kicker-row">
                      <span className="agentic-signal-kicker">Production line</span>
                      {s.sensorTypeLabel ? (
                        <span className={`agentic-signal-channel-pill agentic-signal-channel-pill--${ch}`}>
                          {s.sensorTypeLabel}
                        </span>
                      ) : null}
                      {sev !== 'info' ? (
                        <span className={`agentic-signal-sev-pill agentic-signal-sev-pill--${sev}`}>{sev}</span>
                      ) : null}
                    </div>
                    <h4 className="agentic-signal-card-title">{s.productionLine}</h4>
                    <p className="agentic-signal-body agentic-signal-body--clip">{s.stopStory}</p>
                    <dl className="agentic-signal-kv">
                      <div>
                        <dt>KPI / trigger</dt>
                        <dd>{s.kpiSignal}</dd>
                      </div>
                      <div>
                        <dt>Downstream</dt>
                        <dd>{s.recommendationHook}</dd>
                      </div>
                    </dl>
                  </div>
                  <span className="agentic-signal-chevron" aria-hidden>
                    {expanded ? '▴' : '▾'}
                  </span>
                </button>
                {expanded ? (
                  <div className="agentic-signal-expand" id={`${s.id}-detail`}>
                    {s.sensorId || s.assetId || s.unit || s.warnThresholdHigh ? (
                      <dl className="agentic-signal-expand-grid">
                        {s.sensorId ? (
                          <div>
                            <dt>Sensor</dt>
                            <dd>{s.sensorId}</dd>
                          </div>
                        ) : null}
                        {s.assetId ? (
                          <div>
                            <dt>Asset</dt>
                            <dd>{s.assetId}</dd>
                          </div>
                        ) : null}
                        {s.unit ? (
                          <div>
                            <dt>Unit</dt>
                            <dd>{s.unit}</dd>
                          </div>
                        ) : null}
                        {s.warnThresholdHigh ? (
                          <div>
                            <dt>Warning threshold (high)</dt>
                            <dd>{s.warnThresholdHigh}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                    {s.detail ? <p className="agentic-signal-expand-full">{s.detail}</p> : null}
                    <p className="agentic-signal-expand-hint">Click again to collapse · cross-check with charts below.</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function RcaCorroborationPanel({ model: modelProp = null }) {
  const { excelBundle } = useAppFlow();
  const model = useMemo(
    () => modelProp || buildRcaCorroborationPanelModel(excelBundle || {}, null),
    [modelProp, excelBundle]
  );

  const maxPareto = Math.max(...model.pareto.map((p) => p.pct), 1);

  return (
    <div className="rca-corroboration-dashboard">
      <div className="rca-corr-grid">
        <section className="rca-corr-card" aria-labelledby="rca-pareto-title">
          <h4 id="rca-pareto-title" className="rca-corr-card-title">
            Pareto · loss drivers
          </h4>
          <p className="rca-corr-card-lead">
            Ranked contributors for this scope—aligns with the probability column once you lock an asset.
          </p>
          <ul className="rca-pareto-list">
            {model.pareto.map((row) => (
              <li key={row.label} className="rca-pareto-row">
                <div className="rca-pareto-row-head">
                  <span className="rca-pareto-label">{row.label}</span>
                  <span className="rca-pareto-pct">{row.pct}%</span>
                </div>
                <div className="rca-pareto-track">
                  <div className="rca-pareto-fill" style={{ width: `${(row.pct / maxPareto) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rca-corr-card" aria-labelledby="rca-5why-title">
          <h4 id="rca-5why-title" className="rca-corr-card-title">
            Five-whys thread
          </h4>
          <p className="rca-corr-card-lead">
            Structured drill from observation to systemic barrier—merged with routed RCA rows when present.
          </p>
          <ol className="rca-fivewhys">
            {model.fiveWhys.map((w) => (
              <li key={w.i} className="rca-fivewhys-item">
                <span className="rca-fivewhys-n">{w.i}</span>
                <div className="rca-fivewhys-body">
                  <strong className="rca-fivewhys-q">{w.q}</strong>
                  <p className="rca-fivewhys-a">{w.a}</p>
                  <span className="rca-fivewhys-ev">{w.evidence}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rca-corr-card rca-corr-card--tree" aria-labelledby="rca-tree-title">
          <h4 id="rca-tree-title" className="rca-corr-card-title">
            Equipment tree
          </h4>
          <p className="rca-corr-card-lead">
            Physical hierarchy for anchoring evidence—not a substitute for the line walk.
            {model.treeHasJobAidFields
              ? ' OCR-extracted JOB AID fields (machine no., UPC / film code, packaging checks) continue the same list below.'
              : ''}
          </p>
          <ul className="rca-equip-tree">
            {model.tree.map((node, idx) => (
              <li
                key={`${node.label}-${idx}`}
                className={`rca-equip-tree-node${node.note ? ' rca-equip-tree-node--note' : ''}`}
                style={{ paddingLeft: `${node.depth * 0.85 + 0.25}rem` }}
              >
                <span className="rca-equip-tree-label">{node.label}</span>
                <span className="rca-equip-tree-meta">{node.meta}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {model.excelSteps.length > 0 && (
        <div className="rca-corr-excel">
          <h4 className="rca-corr-excel-title">Routed analysis beats (from operational feeds)</h4>
          <div className="agentic-rca-steps">
            {model.excelSteps.map((st, idx) => (
              <div key={st.id} className="agentic-rca-step">
                <div className="agentic-rca-step-num">Beat {idx + 1}</div>
                <h4>{st.step}</h4>
                <p>{st.why}</p>
                {st.evidence ? (
                  <p className="rca-corr-evidence">{st.evidence}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OperationalActionsPanel() {
  const { excelBundle } = useAppFlow();
  const actions = useMemo(() => buildActionItems(excelBundle || {}), [excelBundle]);

  if (!actions.length) {
    return (
      <p className="agentic-empty">
        Prioritized countermeasures from the recommendation agent will list here. Asset-specific guidance
        appears in the cards below.
      </p>
    );
  }

  return (
    <div className="agentic-actions-grid">
      {actions.map((a) => (
        <article key={a.id} className="agentic-action-card">
          <div className="agentic-ai-pill">Recommended action</div>
          <h4>{a.title}</h4>
          <div className="agentic-action-tags">
            {a.priority ? <span className="agentic-tag">{a.priority}</span> : null}
            {a.owner ? <span className="agentic-tag">{a.owner}</span> : null}
            {a.when ? <span className="agentic-tag">{a.when}</span> : null}
          </div>
          {a.context ? <p className="agentic-action-context">{a.context}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function DowntimeSignalsPanel({ schedule }) {
  const { excelBundle } = useAppFlow();
  const events = useMemo(() => {
    const fromSchedule = schedule?.length ? buildScheduleDowntimeEvents(schedule) : [];
    const fromExcel = buildDowntimeEvents(excelBundle || {});
    if (fromSchedule.length) return [...fromSchedule, ...fromExcel].slice(0, 30);
    return fromExcel;
  }, [excelBundle, schedule]);

  if (!events.length) {
    return (
      <p className="agentic-empty">
        Downtime and schedule deltas from CMMS and line OEE feeds will surface here as narrative events.
        Scheduled work orders below reflect the planned downtime planner view.
      </p>
    );
  }

  return (
    <div className="agentic-signals">
      {events.map((e) => (
        <article key={e.id} className="agentic-signal-card">
          <div className="agentic-signal-kicker">Availability impact</div>
          <h4>{e.headline}</h4>
          <p className="agentic-signal-meta">
            {[e.when, e.plant, e.asset, e.duration].filter(Boolean).join(' · ')}
          </p>
          {e.context ? <p className="agentic-signal-body">{e.context}</p> : null}
        </article>
      ))}
    </div>
  );
}
