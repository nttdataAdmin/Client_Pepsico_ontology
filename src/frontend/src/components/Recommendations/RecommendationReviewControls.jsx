import React from 'react';
import './RecommendationReviewControls.css';

/**
 * Demo HITL-style controls: assign to self or workcenter role, accept / edit / decline synthesized guidance.
 */
export default function RecommendationReviewControls({
  assignee,
  assignableRoles,
  userEmail,
  decision,
  editing,
  editDraft,
  onAssigneeChange,
  onEditDraftChange,
  onAccept,
  onDecline,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onClearDecision,
}) {
  const selfLabel = userEmail ? `Self (${userEmail})` : 'Self (you)';
  const canAct = !decision;
  const assigneeLabel = assignee === '__self__' ? selfLabel : assignee;

  return (
    <div className="rec-review-controls">
      <div className="rec-review-row">
        <label className="rec-review-label" htmlFor="rec-review-assign">
          Assigned to
        </label>
        <select
          id="rec-review-assign"
          className="rec-review-select"
          value={assignee}
          onChange={(e) => onAssigneeChange(e.target.value)}
          disabled={!canAct && !editing}
        >
          <option value="__self__">{selfLabel}</option>
          {assignableRoles.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {decision ? (
        <p className={`rec-review-status rec-review-status--${decision}`}>
          {decision === 'accepted' && (
            <>
              <strong>Accepted.</strong> Assigned to {assigneeLabel}.
            </>
          )}
          {decision === 'declined' && (
            <>
              <strong>Declined.</strong> No assignment recorded for this session.
            </>
          )}
          {decision === 'edited' && (
            <>
              <strong>Edited &amp; saved.</strong> Assigned to {assigneeLabel}; amended text is shown above.
            </>
          )}
          {onClearDecision ? (
            <button type="button" className="rec-review-clear" onClick={onClearDecision}>
              Change decision
            </button>
          ) : null}
        </p>
      ) : null}

      {editing ? (
        <div className="rec-review-edit-block">
          <label className="rec-review-label" htmlFor="rec-review-edit-area">
            Edit recommendation text
          </label>
          <textarea
            id="rec-review-edit-area"
            className="rec-review-textarea"
            rows={7}
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
          />
          <div className="rec-review-actions">
            <button type="button" className="rec-review-btn rec-review-btn--primary" onClick={onSaveEdit}>
              Save edit
            </button>
            <button type="button" className="rec-review-btn" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="rec-review-actions">
          <button type="button" className="rec-review-btn rec-review-btn--primary" onClick={onAccept} disabled={!canAct}>
            Accept
          </button>
          <button type="button" className="rec-review-btn" onClick={onStartEdit} disabled={!canAct}>
            Edit
          </button>
          <button type="button" className="rec-review-btn rec-review-btn--danger" onClick={onDecline} disabled={!canAct}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
