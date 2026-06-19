import React from 'react';
import './ConstraintsCheckPopup.css';

/**
 * Pre-recommendation popup. Lists the eligibility / safety rules that fired
 * against the current situation, the actions they would remove from the
 * winner pool (with their raw model scores), and gives the operator three
 * choices:
 *   - Apply constraints (default; uses the constraint-filtered winner)
 *   - Override / Ignore        (re-fetches with apply_constraints=false)
 *   - Cancel                   (closes everything)
 */
export default function ConstraintsCheckPopup({
  open,
  constraints,
  rawWinnerOverride,
  constrainedWinner,
  assetId,
  onApply,
  onOverride,
  onCancel,
}) {
  if (!open || !constraints) return null;

  const removedActions = Array.isArray(constraints.removed_actions)
    ? constraints.removed_actions
    : [];
  const rulesFired = Array.isArray(constraints.rules_fired)
    ? constraints.rules_fired
    : [];
  const warnedIds = Array.isArray(constraints.warned_action_ids)
    ? constraints.warned_action_ids
    : [];

  const formatScore = (v) => {
    if (typeof v !== 'number' || Number.isNaN(v)) return '—';
    return v.toFixed(3);
  };

  return (
    <div
      className="constraints-overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel?.()}
    >
      <div className="constraints-popup card" role="dialog" aria-modal="true">
        <div className="constraints-header">
          <h3>Constraint check{assetId ? ` — ${assetId}` : ''}</h3>
          <button type="button" className="constraints-close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <p className="constraints-lead">
          The model scored all candidate actions. Before picking a winner, these eligibility / safety rules apply to this
          situation. Review what would be removed, then choose how to proceed.
        </p>

        {rulesFired.length === 0 ? (
          <p className="constraints-empty">
            No eligibility rules fired for this situation. You can proceed directly to the recommendation.
          </p>
        ) : (
          <div className="constraints-rules">
            <h4 className="constraints-section-title">Rules that fired</h4>
            <ul className="constraints-rules-list">
              {rulesFired.map((r) => (
                <li key={r.rule_id} className={`constraints-rule constraints-rule--${r.type}`}>
                  <div className="constraints-rule-head">
                    <span className={`constraints-pill constraints-pill--${r.type}`}>
                      {r.type === 'hard' ? 'Hard block' : 'Soft flag'}
                    </span>
                    <strong>{r.title}</strong>
                  </div>
                  <p className="constraints-rule-reason">{r.reason}</p>
                  {Array.isArray(r.blocked_action_ids) && r.blocked_action_ids.length > 0 ? (
                    <p className="constraints-rule-impact">
                      Affects action{r.blocked_action_ids.length > 1 ? 's' : ''}:{' '}
                      <code>{r.blocked_action_ids.join(', ')}</code>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {removedActions.length > 0 ? (
          <div className="constraints-removed">
            <h4 className="constraints-section-title">Actions removed by hard rules</h4>
            <div className="constraints-table-wrap">
              <table className="constraints-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Action</th>
                    <th>Raw model score</th>
                    <th>Removed by</th>
                  </tr>
                </thead>
                <tbody>
                  {removedActions.map((a) => (
                    <tr key={a.action_id}>
                      <td>{a.action_id}</td>
                      <td>{a.title}</td>
                      <td>{formatScore(a.score)}</td>
                      <td>
                        {(a.blocked_by || []).map((b) => (
                          <span key={b.rule_id} className="constraints-rule-id">
                            {b.title || b.rule_id}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {warnedIds.length > 0 ? (
          <p className="constraints-warn">
            Soft warnings on action {warnedIds.join(', ')} — these stay eligible but the operator should review them.
          </p>
        ) : null}

        <div className="constraints-comparison">
          <div className="constraints-winner constraints-winner--applied">
            <span className="constraints-winner-label">If you apply constraints</span>
            <strong>{constrainedWinner?.title || '—'}</strong>
            <small>Score: {formatScore(constrainedWinner?.score)}</small>
          </div>
          <div className="constraints-winner constraints-winner--raw">
            <span className="constraints-winner-label">If you override</span>
            <strong>{rawWinnerOverride?.title || '—'}</strong>
            <small>Score: {formatScore(rawWinnerOverride?.score)}</small>
          </div>
        </div>

        <div className="constraints-actions">
          <button
            type="button"
            className="constraints-btn constraints-btn--primary"
            onClick={onApply}
          >
            Apply constraints
          </button>
          <button
            type="button"
            className="constraints-btn constraints-btn--warn"
            onClick={onOverride}
          >
            Override / Ignore
          </button>
          <button
            type="button"
            className="constraints-btn constraints-btn--ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
