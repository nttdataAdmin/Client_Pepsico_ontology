import React, { useState, useEffect, useCallback } from 'react';
import { notifyMaintenanceWorkOrder } from '../../services/api';
import { formatCmmsMaintenanceRecordLine } from '../../data/mockData';
import './MaintenanceEventCards.css';

/** Demo default recipient when env unset; override with REACT_APP_MAINTENANCE_NOTIFY_TO. */
const DEFAULT_MAINTENANCE_NOTIFY_TO =
  (process.env.REACT_APP_MAINTENANCE_NOTIFY_TO || '').trim() || 'ABC@pepsico.com';

const MaintenanceEventCards = ({ schedule }) => {
  const [selected, setSelected] = useState(null);
  const [recipient, setRecipient] = useState(() => DEFAULT_MAINTENANCE_NOTIFY_TO);
  const [includeAiSummary, setIncludeAiSummary] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const closeModal = useCallback(() => {
    setSelected(null);
    setFeedback(null);
    setSending(false);
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, closeModal]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'In Progress':
        return 'var(--color-under-maintenance)';
      case 'Scheduled':
        return 'var(--color-primary)';
      case 'Completed':
        return 'var(--color-working)';
      default:
        return '#8899a8';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Emergency':
        return 'var(--color-breakdown)';
      case 'Corrective':
        return 'var(--color-failure-predicted)';
      case 'Preventive':
        return 'var(--color-primary)';
      default:
        return '#8899a8';
    }
  };

  const openForItem = (item) => {
    setSelected(item);
    setFeedback(null);
    setRecipient(DEFAULT_MAINTENANCE_NOTIFY_TO);
  };

  const buildPayload = (item) => {
    const payload = {
      asset_id: item.asset_id,
      plant: item.plant ?? '',
      state: item.state ?? '',
      asset_type: item.asset_type ?? null,
      maintenance_type: item.maintenance_type ?? '',
      status: item.status ?? '',
      scheduled_date: item.scheduled_date != null ? String(item.scheduled_date) : '',
      month: item.month != null ? String(item.month) : null,
      day: item.day != null ? String(item.day) : null,
      year: item.year != null ? String(item.year) : null,
      estimated_duration_hours:
        item.estimated_duration_hours != null ? Number(item.estimated_duration_hours) : null,
    };
    const to = recipient.trim();
    if (to) payload.to_email = to;
    payload.use_llm = includeAiSummary;
    return payload;
  };

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    setFeedback(null);
    try {
      const data = await notifyMaintenanceWorkOrder(buildPayload(selected));
      let msg = `Notification sent to ${data.recipient || recipient || 'recipient'}.`;
      if (includeAiSummary) {
        if (data.llm_summary_included === true) msg += ' AI summary included in the email.';
        else if (data.llm_summary_included === false) {
          msg +=
            ' Email sent without AI section — configure Azure OpenAI (AZURE_*) in backend .env or check API logs.';
        }
      }
      setFeedback({ type: 'ok', message: msg });
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg || d).join(' ')
            : err.message || 'Request failed';
      setFeedback({ type: 'err', message: msg });
    } finally {
      setSending(false);
    }
  };

  if (!schedule.length) {
    return (
      <p className="maint-cards-empty">No scheduled maintenance events for this scope.</p>
    );
  }

  return (
    <>
      <div className="maint-cards-grid">
        {schedule.map((item, index) => (
          <button
            key={`${item.asset_id}-${item.scheduled_date}-${index}`}
            type="button"
            className="maint-event-card"
            onClick={() => openForItem(item)}
          >
            <div className="maint-event-header">
              <span className="maint-event-type" style={{ backgroundColor: getTypeColor(item.maintenance_type) }}>
                {item.maintenance_type}
              </span>
              <span className="maint-event-status" style={{ backgroundColor: getStatusColor(item.status) }}>
                {item.status}
              </span>
            </div>
            <h4 className="maint-event-asset">{item.asset_id}</h4>
            <p className="maint-event-meta">
              {item.plant} · {item.state} · {item.asset_type}
            </p>
            <p className="maint-event-when">
              {item.scheduled_date}
              {item.estimated_duration_hours != null ? ` · ~${item.estimated_duration_hours} h` : ''}
            </p>
            <p className="maint-event-cal">
              {item.month} {item.day}, {item.year}
            </p>
            <p className="maint-event-cmms">{formatCmmsMaintenanceRecordLine(item)}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div
          className="maint-wo-modal-backdrop"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="maint-wo-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maint-wo-modal-title"
          >
            <div className="maint-wo-modal-head">
              <h3 id="maint-wo-modal-title">Raise work-order notification</h3>
              <button type="button" className="maint-wo-modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <p className="maint-wo-modal-lead">
              Sends email via <strong>Microsoft Graph</strong> (if <code className="maint-wo-modal-code">GRAPH_*</code> is
              set) or <strong>SMTP</strong> (if <code className="maint-wo-modal-code">SMTP_HOST</code>,{' '}
              <code className="maint-wo-modal-code">SMTP_USER</code>,{' '}
              <code className="maint-wo-modal-code">SMTP_PASSWORD</code> are set) on the API host. AI summary uses{' '}
              <code className="maint-wo-modal-code">AZURE_*</code> when configured.
            </p>
            <label className="maint-wo-modal-label maint-wo-modal-label--inline">
              <input
                type="checkbox"
                checked={includeAiSummary}
                onChange={(e) => setIncludeAiSummary(e.target.checked)}
              />{' '}
              Include AI summary in email (LLM)
            </label>
            <dl className="maint-wo-modal-dl">
              <div>
                <dt>Asset</dt>
                <dd>{selected.asset_id}</dd>
              </div>
              <div>
                <dt>Site</dt>
                <dd>
                  {selected.plant} · {selected.state}
                </dd>
              </div>
              <div>
                <dt>Type / status</dt>
                <dd>
                  {selected.maintenance_type} · {selected.status}
                </dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>
                  {selected.scheduled_date}
                  {selected.estimated_duration_hours != null ? ` (~${selected.estimated_duration_hours} h)` : ''}
                </dd>
              </div>
              <div>
                <dt>CMMS record</dt>
                <dd className="maint-wo-modal-cmms">{formatCmmsMaintenanceRecordLine(selected)}</dd>
              </div>
            </dl>
            <label className="maint-wo-modal-label" htmlFor="maint-wo-recipient">
              Recipient email (optional)
            </label>
            <input
              id="maint-wo-recipient"
              type="email"
              className="maint-wo-modal-input"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={DEFAULT_MAINTENANCE_NOTIFY_TO}
              autoComplete="email"
            />
            {feedback && (
              <p className={feedback.type === 'ok' ? 'maint-wo-modal-msg maint-wo-modal-msg--ok' : 'maint-wo-modal-msg maint-wo-modal-msg--err'}>
                {feedback.message}
              </p>
            )}
            <div className="maint-wo-modal-actions">
              <button type="button" className="maint-wo-modal-btn maint-wo-modal-btn--secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="maint-wo-modal-btn maint-wo-modal-btn--primary"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? 'Sending…' : 'Send notification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MaintenanceEventCards;
