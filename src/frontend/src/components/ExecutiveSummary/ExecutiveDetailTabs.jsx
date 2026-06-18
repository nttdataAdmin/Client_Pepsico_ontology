import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SummaryPanel from './SummaryPanel';
import './ExecutiveDetailTabs.css';

const TABS = [
  { id: 'snapshot', label: 'Live snapshot' },
  { id: 'fleet', label: 'Fleet register' },
  { id: 'plants', label: 'By site' },
  { id: 'shortcuts', label: 'Drill-downs' },
];

function formatRefreshed(ts) {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(ts);
  } catch {
    return '';
  }
}

const ExecutiveDetailTabs = ({
  assets,
  summary,
  filters,
  onFiltersChange,
  selectedMonth,
  selectedYear,
  activeTab,
  onTabChange,
  fleetStatusFilter,
  onFleetStatusFilterChange,
  lastRefreshedAt,
}) => {
  const [fleetQuery, setFleetQuery] = useState('');

  const plantsBreakdown = useMemo(() => {
    const map = new Map();
    assets.forEach((a) => {
      const key = a.plant || 'Unknown';
      if (!map.has(key)) {
        map.set(key, {
          plant: key,
          total: 0,
          working: 0,
          failure_predicted: 0,
          under_maintenance: 0,
          breakdown: 0,
        });
      }
      const row = map.get(key);
      row.total++;
      const s = (a.status || '').toLowerCase();
      if (s === 'working') row.working++;
      else if (s === 'failure predicted') row.failure_predicted++;
      else if (s === 'under maintenance') row.under_maintenance++;
      else if (s === 'breakdown') row.breakdown++;
    });
    return [...map.values()].sort((a, b) => a.plant.localeCompare(b.plant));
  }, [assets]);

  const filteredFleet = useMemo(() => {
    let list = assets;
    if (fleetStatusFilter) {
      list = list.filter((a) => a.status === fleetStatusFilter);
    }
    const q = fleetQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          String(a.asset_id || '')
            .toLowerCase()
            .includes(q) ||
          String(a.plant || '')
            .toLowerCase()
            .includes(q) ||
          String(a.asset_type || '')
            .toLowerCase()
            .includes(q) ||
          String(a.status || '')
            .toLowerCase()
            .includes(q)
      );
    }
    return list;
  }, [assets, fleetQuery, fleetStatusFilter]);

  const handleFocusAsset = (asset) => {
    if (!onFiltersChange) return;
    onFiltersChange({
      ...filters,
      asset_id: filters.asset_id === asset.asset_id ? null : asset.asset_id,
    });
  };

  const handlePlantPick = (plant) => {
    if (!onFiltersChange) return;
    onFiltersChange({
      ...filters,
      plant: filters.plant === plant ? null : plant,
    });
    onTabChange('fleet');
  };

  const statusPillClass = (status) => {
    const key = (status || '').toLowerCase().replace(/\s+/g, '-');
    return `edt-status-pill edt-status-pill--${key}`;
  };

  return (
    <section className="executive-detail-tabs card" aria-label="Executive detail panels">
      <div className="edt-header">
        <div className="edt-header-titles">
          <h2 className="edt-title">Operational detail</h2>
          <p className="edt-subtitle">
            Tabbed views over the same live scope — click KPIs above to jump here or open another workspace.
          </p>
        </div>
        <div className="edt-live-meta" aria-live="polite">
          <span className="edt-live-dot" aria-hidden />
          <span className="edt-live-text">
            Scope updated <time dateTime={lastRefreshedAt ? new Date(lastRefreshedAt).toISOString() : undefined}>{formatRefreshed(lastRefreshedAt) || '—'}</time>
          </span>
        </div>
      </div>

      <div className="edt-tablist" role="tablist" aria-label="Detail views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`edt-tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`edt-panel-${t.id}`}
            className={`edt-tab ${activeTab === t.id ? 'edt-tab--active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        id="edt-panel-snapshot"
        role="tabpanel"
        aria-labelledby="edt-tab-snapshot"
        hidden={activeTab !== 'snapshot'}
        className={`edt-panel edt-panel--animate ${activeTab === 'snapshot' ? '' : 'edt-panel--hidden'}`}
      >
        <SummaryPanel
          assets={assets}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onSelectAsset={handleFocusAsset}
          focusedAssetId={filters.asset_id}
        />
      </div>

      <div
        id="edt-panel-fleet"
        role="tabpanel"
        aria-labelledby="edt-tab-fleet"
        hidden={activeTab !== 'fleet'}
        className={`edt-panel edt-panel--animate ${activeTab === 'fleet' ? '' : 'edt-panel--hidden'}`}
      >
        <div className="edt-fleet-toolbar">
          <input
            type="search"
            className="edt-fleet-search"
            placeholder="Search asset, plant, type, or status…"
            value={fleetQuery}
            onChange={(e) => setFleetQuery(e.target.value)}
            aria-label="Filter fleet table"
          />
          <div className="edt-fleet-filters" role="group" aria-label="Filter by status">
            <button
              type="button"
              className={`edt-chip ${!fleetStatusFilter ? 'edt-chip--active' : ''}`}
              onClick={() => onFleetStatusFilterChange && onFleetStatusFilterChange(null)}
            >
              All
            </button>
            {['Working', 'Failure Predicted', 'Under Maintenance', 'Breakdown'].map((s) => (
              <button
                key={s}
                type="button"
                className={`edt-chip ${fleetStatusFilter === s ? 'edt-chip--active' : ''}`}
                onClick={() =>
                  onFleetStatusFilterChange && onFleetStatusFilterChange(fleetStatusFilter === s ? null : s)
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="edt-table-wrap">
          <table className="edt-table">
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Plant</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Criticality</th>
                <th scope="col">RUL (h)</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredFleet.length === 0 ? (
                <tr>
                  <td colSpan={7} className="edt-table-empty">
                    No assets match this filter. Adjust search or status chips.
                  </td>
                </tr>
              ) : (
                filteredFleet.map((a) => (
                  <tr
                    key={a.asset_id}
                    className={filters.asset_id === a.asset_id ? 'edt-table-row--focused' : undefined}
                  >
                    <td>
                      <button type="button" className="edt-linkish" onClick={() => handleFocusAsset(a)}>
                        {a.asset_id}
                      </button>
                    </td>
                    <td>{a.plant}</td>
                    <td>{a.asset_type}</td>
                    <td>
                      <span className={statusPillClass(a.status)}>{a.status}</span>
                    </td>
                    <td>{a.criticality}</td>
                    <td>{a.rul != null ? a.rul : '—'}</td>
                    <td>
                      <button type="button" className="edt-row-action" onClick={() => handleFocusAsset(a)}>
                        {filters.asset_id === a.asset_id ? 'Clear map focus' : 'Focus on map'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {summary ? (
          <p className="edt-fleet-footnote">
            Showing <strong>{filteredFleet.length}</strong> of <strong>{summary.total}</strong> assets in this
            territory{filters.plant ? ` · ${filters.plant}` : ''}.
          </p>
        ) : null}
      </div>

      <div
        id="edt-panel-plants"
        role="tabpanel"
        aria-labelledby="edt-tab-plants"
        hidden={activeTab !== 'plants'}
        className={`edt-panel edt-panel--animate ${activeTab === 'plants' ? '' : 'edt-panel--hidden'}`}
      >
        <p className="edt-plants-lead">Click a site to filter the map and fleet to that plant (toggle to clear).</p>
        <div className="edt-plant-grid">
          {plantsBreakdown.map((p) => (
            <button
              key={p.plant}
              type="button"
              className={`edt-plant-card ${filters.plant === p.plant ? 'edt-plant-card--active' : ''}`}
              onClick={() => handlePlantPick(p.plant)}
            >
              <span className="edt-plant-name">{p.plant}</span>
              <span className="edt-plant-total">{p.total} assets</span>
              <ul className="edt-plant-stats">
                <li className="edt-plant-stat edt-plant-stat--ok">Working {p.working}</li>
                <li className="edt-plant-stat edt-plant-stat--fp">Failure pred. {p.failure_predicted}</li>
                <li className="edt-plant-stat edt-plant-stat--um">Maint. {p.under_maintenance}</li>
                <li className="edt-plant-stat edt-plant-stat--bd">Breakdown {p.breakdown}</li>
              </ul>
            </button>
          ))}
        </div>
      </div>

      <div
        id="edt-panel-shortcuts"
        role="tabpanel"
        aria-labelledby="edt-tab-shortcuts"
        hidden={activeTab !== 'shortcuts'}
        className={`edt-panel edt-panel--animate ${activeTab === 'shortcuts' ? '' : 'edt-panel--hidden'}`}
      >
        <div className="edt-shortcuts-grid">
          <Link className="edt-shortcut-card" to="/anomalies">
            <span className="edt-shortcut-kicker">Condition</span>
            <strong className="edt-shortcut-title">Anomalies &amp; telemetry</strong>
            <span className="edt-shortcut-body">Vibration and temperature traces for assets in scope.</span>
            <span className="edt-shortcut-cta">Open →</span>
          </Link>
          <Link className="edt-shortcut-card" to="/root-cause">
            <span className="edt-shortcut-kicker">Analysis</span>
            <strong className="edt-shortcut-title">Root cause explorer</strong>
            <span className="edt-shortcut-body">Follow probable causes linked to line and asset context.</span>
            <span className="edt-shortcut-cta">Open →</span>
          </Link>
          <Link className="edt-shortcut-card" to="/recommendations">
            <span className="edt-shortcut-kicker">Actions</span>
            <strong className="edt-shortcut-title">Recommendations</strong>
            <span className="edt-shortcut-body">Prioritized work orders and AI-assisted next steps.</span>
            <span className="edt-shortcut-cta">Open →</span>
          </Link>
          <Link className="edt-shortcut-card" to="/maintenance">
            <span className="edt-shortcut-kicker">Schedule</span>
            <strong className="edt-shortcut-title">Maintenance calendar</strong>
            <span className="edt-shortcut-body">Planned downtime, in-progress work, and notifications.</span>
            <span className="edt-shortcut-cta">Open →</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default ExecutiveDetailTabs;
