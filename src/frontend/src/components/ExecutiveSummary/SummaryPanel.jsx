import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './SummaryPanel.css';

const SummaryPanel = ({ assets, selectedMonth, selectedYear, onSelectAsset, focusedAssetId }) => {
  const [query, setQuery] = useState('');

  const chartData = useMemo(() => {
    const statusCounts = {
      Breakdown: 0,
      'Failure Predicted': 0,
      'Under Maintenance': 0,
    };

    assets.forEach((asset) => {
      if (asset.status === 'Breakdown') statusCounts.Breakdown++;
      else if (asset.status === 'Failure Predicted') statusCounts['Failure Predicted']++;
      else if (asset.status === 'Under Maintenance') statusCounts['Under Maintenance']++;
    });

    return [
      {
        name: selectedMonth,
        Breakdown: statusCounts.Breakdown,
        'Failure Predicted': statusCounts['Failure Predicted'],
        'Under Maintenance': statusCounts['Under Maintenance'],
      },
    ];
  }, [assets, selectedMonth]);

  const exceptionAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter(
        (asset) =>
          asset.status === 'Breakdown' ||
          asset.status === 'Failure Predicted' ||
          asset.status === 'Under Maintenance'
      )
      .filter((asset) => {
        if (!q) return true;
        return (
          String(asset.asset_id || '')
            .toLowerCase()
            .includes(q) ||
          String(asset.plant || '')
            .toLowerCase()
            .includes(q) ||
          String(asset.asset_type || '')
            .toLowerCase()
            .includes(q) ||
          String(asset.status || '')
            .toLowerCase()
            .includes(q)
        );
      })
      .slice(0, 12);
  }, [assets, query]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Working':
        return 'var(--color-working)';
      case 'Failure Predicted':
        return 'var(--color-failure-predicted)';
      case 'Under Maintenance':
        return 'var(--color-under-maintenance)';
      case 'Breakdown':
        return 'var(--color-breakdown)';
      default:
        return '#ccc';
    }
  };

  return (
    <div className="summary-panel">
      <div className="summary-panel-inner">
        <div className="card-title">Fleet exceptions · {selectedYear}</div>
        <p className="summary-panel-hint">Click a row to focus that asset on the map (uses header scope).</p>
        <div className="search-bar">
          <input
            type="search"
            placeholder="Filter exceptions by plant, asset, type, or status…"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter exception list"
          />
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="Breakdown" fill="var(--color-breakdown)" />
              <Bar dataKey="Failure Predicted" fill="var(--color-failure-predicted)" />
              <Bar dataKey="Under Maintenance" fill="var(--color-under-maintenance)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="exception-stack">
          {exceptionAssets.length === 0 ? (
            <p className="exception-empty">No open exceptions in this scope.</p>
          ) : (
            exceptionAssets.map((asset) => {
              const focused = focusedAssetId === asset.asset_id;
              return (
                <button
                  key={asset.asset_id}
                  type="button"
                  className={`exception-row exception-row--action ${focused ? 'exception-row--focused' : ''}`}
                  onClick={() => onSelectAsset && onSelectAsset(asset)}
                >
                  <span className="exception-status" style={{ backgroundColor: getStatusColor(asset.status) }}>
                    {asset.status}
                  </span>
                  <div className="exception-body">
                    <strong>{asset.asset_id}</strong>
                    <span className="exception-meta">
                      {asset.plant} · {asset.asset_type}
                    </span>
                  </div>
                  <span className="exception-chevron" aria-hidden>
                    {focused ? '✓' : '›'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default SummaryPanel;
