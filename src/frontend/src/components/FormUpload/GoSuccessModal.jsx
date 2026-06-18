import React from 'react';
import './GoSuccessModal.css';

/**
 * Go form: single success dialog with logout (per product flow).
 */
export default function GoSuccessModal({ open, onLogout, onUploadAnother }) {
  if (!open) return null;

  return (
    <div className="go-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="go-modal-title">
      <div className="go-modal-card">
        <div className="go-modal-icon" aria-hidden>
          <svg viewBox="0 0 64 64" width="56" height="56">
            <circle cx="32" cy="32" r="30" fill="#e8f5e9" stroke="#2e7d32" strokeWidth="2" />
            <path
              d="M18 34 L28 44 L46 22"
              fill="none"
              stroke="#1b5e20"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 id="go-modal-title" className="go-modal-title">
          Go cleared — release criteria passed
        </h2>
        <p className="go-modal-text">
          Your package quality form classified as <strong>Go</strong>. Extracted machine/code traceability and
          quality-control checks cleared policy limits, with positive KPI posture (quality, productivity, and wastage).
        </p>
        <div className="go-modal-actions">
          {onUploadAnother && (
            <button type="button" className="go-modal-btn secondary" onClick={onUploadAnother}>
              Upload another
            </button>
          )}
          <button type="button" className="go-modal-btn primary" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
