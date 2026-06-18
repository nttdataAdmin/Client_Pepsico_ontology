import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './DashboardStepNav.css';

const TABS = [
  { path: '/executive-summary', label: 'Executive summary', short: 'Summary' },
  { path: '/anomalies', label: 'Anomalies', short: 'Anomalies' },
  { path: '/root-cause', label: 'Root cause', short: 'RCA' },
  { path: '/recommendations', label: 'Recommendations', short: 'Actions' },
  { path: '/maintenance', label: 'Planned downtime', short: 'Downtime' },
];

/**
 * Top tab navigation — same five views as before; tabs replace the numbered stepper.
 */
export default function DashboardStepNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="dashboard-tab-nav" aria-label="Assessment views">
      <div className="dashboard-tab-nav-inner" role="tablist">
        {TABS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              type="button"
              role="tab"
              aria-selected={active}
              className={`dashboard-tab ${active ? 'dashboard-tab--active' : ''}`}
              onClick={() => navigate(item.path)}
              title={item.label}
            >
              <span className="dashboard-tab-label">{item.label}</span>
              <span className="dashboard-tab-label-sm">{item.short}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
