import React from 'react';
import './AnomaliesLoading.css';

export default function AnomaliesLoading() {
  return (
    <div className="anomalies-loading" role="status" aria-live="polite">
      <div className="anomalies-loading-inner card">
        <div className="anomalies-loading-spinner" aria-hidden="true" />
        <p className="anomalies-loading-title">Pulling production signals…</p>
        <p className="anomalies-loading-sub">
          Correlating historian samples with line context for the selected site.
        </p>
        <div className="anomalies-loading-skeleton">
          <div className="anomalies-skel-line" />
          <div className="anomalies-skel-line short" />
          <div className="anomalies-skel-charts">
            <div className="anomalies-skel-chart" />
            <div className="anomalies-skel-chart" />
          </div>
        </div>
      </div>
    </div>
  );
}
