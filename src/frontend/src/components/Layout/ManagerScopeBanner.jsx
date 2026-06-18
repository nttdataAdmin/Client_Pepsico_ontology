import React from 'react';
import './ManagerScopeBanner.css';

/** Short context for regional supervisor login — aligned with executive summary and site selection. */
export default function ManagerScopeBanner() {
  return (
    <div className="manager-scope-banner" role="note">
      <p className="manager-scope-banner-text">
        <strong>Regional supervisor · Grade 2.</strong> What you see here follows the same site and period as Executive
        summary, with emphasis on production stoppages and the next actions that matter for your steering cadence.
      </p>
    </div>
  );
}
