import React, { useEffect, useRef } from 'react';
import './FormProcessingOverlay.css';

export const PROCESSING_STEPS = [
  { id: 'mfg', label: 'MFG Pro+ · Scheduler sync' },
  { id: 'load', label: 'Loading document & job slot…' },
  { id: 'extract', label: 'Extract text (OCR / layout)…' },
  { id: 'classify', label: 'Classify Go / No-Go…' },
];

export default function FormProcessingOverlay({ active, currentStepIndex, waitingOnApi, logLines = [] }) {
  const logEndRef = useRef(null);

  useEffect(() => {
    if (!active || !logEndRef.current) return;
    logEndRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active, logLines.length]);

  if (!active) return null;

  const progressPct = Math.min(
    98,
    ((currentStepIndex + 1) / PROCESSING_STEPS.length) * 80 + (waitingOnApi ? 18 : 0)
  );

  return (
    <div className="mfg-overlay" role="status" aria-live="polite">
      <div className="mfg-panel mfg-panel--with-log">
        <div className="mfg-brand">
          <span className="mfg-brand-mark">MFG</span>
          <span className="mfg-brand-sub">Pro+ · Document pipeline</span>
        </div>
        <div className="mfg-progress-outer">
          <div className="mfg-progress-inner" style={{ width: `${progressPct}%` }} />
        </div>
        <ul className="mfg-steps">
          {PROCESSING_STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`mfg-step ${i < currentStepIndex ? 'done' : ''} ${i === currentStepIndex ? 'active' : ''}`}
            >
              <span className="mfg-step-dot">{i < currentStepIndex ? '✓' : i === currentStepIndex ? '●' : '○'}</span>
              {s.label}
            </li>
          ))}
        </ul>

        <div className="mfg-log-wrap" aria-label="Extraction log">
          <div className="mfg-log-title">Extraction console</div>
          <pre className="mfg-log" role="log">
            {logLines.map((line, idx) => (
              <span key={idx} className="mfg-log-line">
                {line}
                {'\n'}
              </span>
            ))}
            <span ref={logEndRef} />
          </pre>
        </div>

        {waitingOnApi ? (
          <p className="mfg-wait">Classifier in flight — watch the extraction stream below.</p>
        ) : null}
      </div>
    </div>
  );
}
