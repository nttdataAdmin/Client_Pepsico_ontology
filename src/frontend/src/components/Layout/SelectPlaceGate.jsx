import React from 'react';
import { SITE_LOCATIONS } from '../../config/siteLocations';
import './SelectPlaceGate.css';

/**
 * Shown on workflow steps when no region is selected yet.
 */
export default function SelectPlaceGate({ filters, onFiltersChange, title, hint }) {
  return (
    <div className="place-gate card">
      <h2 className="place-gate-title">{title || 'Select a location'}</h2>
      <p className="place-gate-hint">
        {hint ||
          'Choose Beloit or Jonesboro to pull asset, telemetry, and planned downtime context for this step. You can change it anytime from Executive summary.'}
      </p>
      <div className="place-gate-states" role="group" aria-label="Select location">
        {SITE_LOCATIONS.map((state) => (
          <button
            key={state}
            type="button"
            className={`place-gate-chip ${filters.state === state ? 'active' : ''}`}
            onClick={() => {
              if (onFiltersChange) {
                onFiltersChange({
                  ...filters,
                  state: filters.state === state ? null : state,
                  plant: null,
                });
              }
            }}
          >
            {state}
          </button>
        ))}
      </div>
    </div>
  );
}
