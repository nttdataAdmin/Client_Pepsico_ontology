import React from 'react';
import './NbaInsightBlock.css';

/**
 * Renders the NBA payload returned alongside /api/ai/recommendations
 * (action id, primary action title, playbook, ranked action scores).
 */
export default function NbaInsightBlock({ nba, assetId, plant, state, heading = 'Next-best action (NBA)' }) {
  if (!nba || typeof nba !== 'object') return null;

  const probs = Array.isArray(nba.top_probabilities) ? nba.top_probabilities : [];
  const modelOk = nba.model_ok !== false;
  const loc = [plant, state].filter(Boolean).join(' · ');
  const primaryScore = typeof nba.score === 'number' ? nba.score : null;
  const constraints = nba.constraints || null;
  const blockedIds = new Set((constraints?.blocked_action_ids || []).map(Number));
  const warnedIds = new Set((constraints?.warned_action_ids || []).map(Number));
  const constraintsApplied = !!constraints?.applied;
  const overrideUsed = constraints && constraints.requested === false && (constraints.blocked_action_ids || []).length > 0;

  const formatScore = (v) => {
    if (typeof v !== 'number' || Number.isNaN(v)) return '—';
    return v.toFixed(3);
  };

  const rowClass = (p) => {
    // Only style blocked/warned rows when the constraints were actually
    // applied to pick the winner. If the user overrode constraints (or no
    // rules fired), all rows render plain so they don't look removed.
    if (!constraintsApplied) return '';
    const aid = Number(p.action_id);
    if (blockedIds.has(aid)) return 'nba-insight-row--blocked';
    if (warnedIds.has(aid)) return 'nba-insight-row--warned';
    return '';
  };

  return (
    <div className="nba-insight" role="region" aria-label="Model output">
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
      <div className="nba-insight-badges">
        <div className={`nba-insight-badge ${modelOk ? 'nba-insight-badge--ok' : 'nba-insight-badge--warn'}`}>
          {modelOk ? 'Model prediction' : 'Rule fallback / model unavailable'}
        </div>
        {constraintsApplied ? (
          <div className="nba-insight-badge nba-insight-badge--info">Constraints applied</div>
        ) : null}
        {overrideUsed ? (
          <div className="nba-insight-badge nba-insight-badge--warn">Constraints overridden</div>
        ) : null}
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
        {primaryScore != null ? (
          <div className="nba-insight-row">
            <dt>Predicted score</dt>
            <dd>{formatScore(primaryScore)} <small>(0–1, higher is better)</small></dd>
          </div>
        ) : null}
        {nba.playbook ? (
          <div className="nba-insight-row nba-insight-row--block">
            <dt>Playbook</dt>
            <dd>{nba.playbook}</dd>
          </div>
        ) : null}
      </dl>
      {probs.length > 0 ? (
        <>
          <p className="nba-insight-prob-title">Ranked action scores</p>
          <div className="nba-insight-table-wrap">
            <table className="nba-insight-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Action</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {probs.map((p, idx) => (
                  <tr key={`${p.action_id}-${idx}`} className={rowClass(p)}>
                    <td>{p.action_id != null ? p.action_id : '—'}</td>
                    <td>{p.title || '—'}</td>
                    <td>{formatScore(p.probability)}</td>
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
