import React from 'react';
import './AssetStatusSummary.css';

const SEGMENT_KEYS = {
  default: 'total',
  working: 'working',
  'failure-predicted': 'failure_predicted',
  'under-maintenance': 'under_maintenance',
  breakdown: 'breakdown',
};

const AssetStatusSummary = ({ summary, layout = 'vertical', interactive, onSegmentClick, supervisorStrip }) => {
  if (!summary) return null;

  const statusItems = supervisorStrip
    ? [{ label: 'Production stopped (assets)', value: summary.total, color: 'breakdown' }]
    : [
        { label: 'No. of Assets', value: summary.total, color: 'default' },
        { label: 'Working', value: summary.working, color: 'working' },
        { label: 'Failure Predicted', value: summary.failure_predicted, color: 'failure-predicted' },
        { label: 'Under Maintenance', value: summary.under_maintenance, color: 'under-maintenance' },
        { label: 'Breakdown', value: summary.breakdown, color: 'breakdown' },
      ];

  return (
    <div
      className={`asset-status-summary ${layout === 'horizontal' ? 'asset-status-summary--horizontal' : ''} ${
        interactive ? 'asset-status-summary--interactive' : ''
      }`}
      role={interactive ? 'group' : undefined}
      aria-label={interactive ? 'Fleet KPIs — click to drill down' : undefined}
    >
      {statusItems.map((item) => {
        const segment = SEGMENT_KEYS[item.color] || 'total';
        if (interactive && onSegmentClick) {
          return (
            <button
              key={item.label}
              type="button"
              className={`status-card status-${item.color} status-card--interactive`}
              onClick={() => onSegmentClick(segment)}
            >
              <div className="status-value">{item.value}</div>
              <div className="status-label">{item.label}</div>
              <span className="status-cta">Open</span>
            </button>
          );
        }
        return (
          <div key={item.label} className={`status-card status-${item.color}`}>
            <div className="status-value">{item.value}</div>
            <div className="status-label">{item.label}</div>
          </div>
        );
      })}
    </div>
  );
};

export default AssetStatusSummary;
