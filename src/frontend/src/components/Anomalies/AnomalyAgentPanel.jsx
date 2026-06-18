import React, { useEffect, useState } from 'react';
import './AnomalyAgentPanel.css';

function formatGeneratedAt(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(d);
  } catch {
    return iso;
  }
}

export default function AnomalyAgentPanel({ briefing, dataSource, onRefresh, refreshing }) {
  const [streamText, setStreamText] = useState('');
  const narrative = briefing?.narrative || '';

  useEffect(() => {
    if (!narrative) {
      setStreamText('');
      return undefined;
    }
    setStreamText('');
    const total = narrative.length;
    const targetMs = Math.min(2200, 900 + total * 12);
    const start = Date.now();
    let raf;
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / targetMs);
      const cut = Math.max(0, Math.floor(total * p));
      setStreamText(narrative.slice(0, cut));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [narrative]);

  if (!briefing && dataSource === 'mock') {
    return (
      <section className="anomaly-agent-panel anomaly-agent-panel--offline card">
        <div className="aap-header">
          <span className="aap-agent-label">
            <span className="aap-pulse aap-pulse--muted" aria-hidden />
            Condition assessment agent
          </span>
          <span className="aap-badge aap-badge--warn">Offline bundle</span>
        </div>
        <p className="aap-offline-copy">
          Telemetry is shown from the embedded demo dataset. Start the API on port 9898 to stream live historian
          rows and server-generated agent fusion for this scope.
        </p>
        {onRefresh ? (
          <button type="button" className="aap-refresh" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Reconnecting…' : 'Retry connection'}
          </button>
        ) : null}
      </section>
    );
  }

  if (!briefing) return null;

  return (
    <section className="anomaly-agent-panel card" aria-labelledby="aap-headline">
      <div className="aap-header">
        <div className="aap-header-left">
          <span className="aap-agent-label" id="aap-agent-label">
            <span className="aap-pulse" aria-hidden />
            Condition assessment agent
          </span>
          <span className={`aap-badge ${dataSource === 'api' ? 'aap-badge--live' : 'aap-badge--warn'}`}>
            {dataSource === 'api' ? 'Live fusion' : 'Demo data'}
          </span>
        </div>
        {onRefresh ? (
          <button
            type="button"
            className="aap-refresh"
            onClick={onRefresh}
            disabled={refreshing}
            aria-describedby="aap-agent-label"
          >
            {refreshing ? 'Re-running…' : 'Re-run fusion'}
          </button>
        ) : null}
      </div>

      <div className="aap-meta-row">
        <span className="aap-meta">
          Correlation <code className="aap-code">{briefing.correlation_id}</code>
        </span>
        <span className="aap-meta">
          Scope <strong>{briefing.scope_label}</strong>
        </span>
        <span className="aap-meta">
          Generated <time dateTime={briefing.generated_at}>{formatGeneratedAt(briefing.generated_at)}</time>
        </span>
      </div>

      {briefing.pipeline_stages?.length ? (
        <ol className="aap-pipeline" aria-label="Fusion pipeline">
          {briefing.pipeline_stages.map((st) => (
            <li key={st.id} className={`aap-pipeline-step aap-pipeline-step--${st.state}`}>
              <span className="aap-pipeline-dot" />
              {st.label}
            </li>
          ))}
        </ol>
      ) : null}

      <h2 id="aap-headline" className="aap-headline">
        {briefing.headline}
      </h2>

      <p className="aap-narrative" aria-live="polite">
        {streamText}
        {streamText.length < narrative.length ? <span className="aap-caret" aria-hidden /> : null}
      </p>
      <span className="sr-only">{narrative}</span>

      {briefing.stats ? (
        <dl className="aap-stats">
          <div>
            <dt>Samples</dt>
            <dd>{briefing.stats.row_count?.toLocaleString?.() ?? briefing.stats.row_count}</dd>
          </div>
          <div>
            <dt>Assets</dt>
            <dd>{briefing.stats.asset_count}</dd>
          </div>
          <div>
            <dt>Peak vibration</dt>
            <dd>{briefing.stats.max_vibration} mm/s²</dd>
          </div>
          <div>
            <dt>Peak temperature</dt>
            <dd>{briefing.stats.max_temperature} °F</dd>
          </div>
        </dl>
      ) : null}

      {briefing.signals?.length ? (
        <div className="aap-signals">
          <h3 className="aap-signals-title">Prioritized agent signals</h3>
          <ul className="aap-signal-list">
            {briefing.signals.map((sig) => (
              <li key={`${sig.asset_id}-${sig.title}`} className={`aap-signal aap-signal--${sig.severity}`}>
                <div className="aap-signal-head">
                  <span className="aap-signal-sev">{sig.severity}</span>
                  <span className="aap-signal-title">{sig.title}</span>
                </div>
                <p className="aap-signal-detail">{sig.detail}</p>
                <span className="aap-signal-plant">{sig.plant}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="aap-quiet">No threshold excursions in this window — charts reflect nominal variation.</p>
      )}

      {briefing.sources?.length ? (
        <div className="aap-sources">
          {briefing.sources.map((s) => (
            <span key={s.id} className={`aap-source-pill aap-source-pill--${s.status}`}>
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
