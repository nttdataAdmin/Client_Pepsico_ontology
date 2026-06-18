import React from 'react';
import './NbaInsightBlock.css';

/**
 * Renders CatBoost NBA payload returned alongside /api/ai/recommendations (no feature row).
 */
export default function NbaInsightBlock({ nba, assetId, plant, state, heading = 'CatBoost next-best action (NBA)' }) {
  if (!nba || typeof nba !== 'object') return null;

  const probs = Array.isArray(nba.top_probabilities) ? nba.top_probabilities : [];
  const modelOk = nba.model_ok !== false;
  const loc = [plant, state].filter(Boolean).join(' · ');

  return (
    <div className="nba-insight" role="region" aria-label="CatBoost model output">
      <h4 className="nba-insight-heading">{heading}</h4>
      <p className="nba-insight-scope">
        <strong>{assetId || 'Asset'}</strong>
        {loc ? (
          <>
            {' '}
            · <span className="nba-insight-loc">{loc}</span>
          </>
        ) : null}
      </p>
      <div className={`nba-insight-badge ${modelOk ? 'nba-insight-badge--ok' : 'nba-insight-badge--warn'}`}>
        {modelOk ? 'CatBoost model' : 'Rule fallback / model unavailable'}
      </div>
      {!modelOk && nba.reason ? (
        <p className="nba-insight-note">
          <strong>Note:</strong> {nba.reason}
        </p>
      ) : null}
      <dl className="nba-insight-dl">
        <div className="nba-insight-row">
          <dt>Action ID</dt>
          <dd>{nba.action_id != null ? String(nba.action_id) : '—'}</dd>
        </div>
        <div className="nba-insight-row">
          <dt>Primary action</dt>
          <dd>{nba.title || '—'}</dd>
        </div>
        {nba.playbook ? (
          <div className="nba-insight-row nba-insight-row--block">
            <dt>Playbook</dt>
            <dd>{nba.playbook}</dd>
          </div>
        ) : null}
      </dl>
      {probs.length > 0 ? (
        <>
          <p className="nba-insight-prob-title">Top class probabilities</p>
          <div className="nba-insight-table-wrap">
            <table className="nba-insight-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Action</th>
                  <th scope="col">Prob.</th>
                </tr>
              </thead>
              <tbody>
                {probs.map((p, idx) => (
                  <tr key={`${p.action_id}-${idx}`}>
                    <td>{p.action_id != null ? p.action_id : '—'}</td>
                    <td>{p.title || '—'}</td>
                    <td>
                      {typeof p.probability === 'number'
                        ? `${(p.probability <= 1 ? p.probability * 100 : p.probability).toFixed(1)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <p className="nba-insight-foot">
        The narrative below expands this choice; it should not contradict the primary action above.
      </p>
    </div>
  );
}
