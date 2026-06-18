import React, { useState, useMemo } from 'react';
import './DatabaseIndicator.css';

/** Stable column order: first-seen keys across all preview rows (headers align with values). */
export function buildPreviewColumnOrder(rows) {
  if (!rows?.length) return [];
  const order = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    Object.keys(row).forEach((k) => {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    });
  }
  return order;
}

/** Reusable tabular preview (same layout as the database popup table). */
export function DatabasePreviewTable({ data = [], emptyLabel = 'No preview rows' }) {
  const previewColumns = useMemo(() => buildPreviewColumnOrder(data), [data]);

  return (
    <div className="database-preview-scroll">
      <table className="database-preview-table">
        <thead>
          <tr>
            {previewColumns.length ? (
              previewColumns.map((col) => (
                <th key={col} scope="col">
                  {col}
                </th>
              ))
            ) : (
              <th scope="col">—</th>
            )}
          </tr>
        </thead>
        <tbody>
          {!data.length ? (
            <tr>
              <td colSpan={Math.max(previewColumns.length, 1)} className="database-preview-empty">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr key={idx}>
                {(previewColumns.length ? previewColumns : ['']).map((col) => (
                  <td key={col || idx}>
                    {col && row[col] != null && String(row[col]).trim() !== '' ? String(row[col]) : '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const DatabaseIndicator = ({
  source,
  status = 'active',
  dataPreview = null,
  subtitle = null,
  onToggle = null,
  selected = false,
}) => {
  const [showPopup, setShowPopup] = useState(false);

  // Generate mock data preview if not provided
  const getMockData = () => {
    if (dataPreview) return dataPreview;

    const mockDataMap = {
      'Asset Database': {
        records: 145,
        lastSync: '2 seconds ago',
        data: [
          { id: 'BEL-PUMP-001', status: 'Failure Predicted', location: 'Beloit' },
          { id: 'JON-GEN-001', status: 'Breakdown', location: 'Jonesboro' },
          { id: 'JON-FAN-004', status: 'Working', location: 'Jonesboro' }
        ]
      },
      'Condition Monitoring': {
        records: 1240,
        lastSync: '1 second ago',
        data: [
          { sensor: 'Vibration-001', value: '102.5 mm/s²', threshold: '100 mm/s²', status: 'Warning' },
          { sensor: 'Temp-002', value: '175.8°F', threshold: '170°F', status: 'Warning' },
          { sensor: 'Vibration-003', value: '45.2 mm/s²', threshold: '100 mm/s²', status: 'Normal' }
        ]
      },
      'Maintenance Records': {
        records: 89,
        lastSync: '5 seconds ago',
        data: [
          { asset: 'BEL-GEN-003', type: 'Preventive', date: '2023-02-15', status: 'In Progress' },
          { asset: 'JON-GEN-001', type: 'Emergency', date: '2023-02-20', status: 'Scheduled' },
          { asset: 'BEL-PUMP-001', type: 'Preventive', date: '2023-03-05', status: 'Scheduled' }
        ]
      },
      'Sensor Data Stream': {
        records: 3456,
        lastSync: 'Real-time',
        data: [
          { timestamp: '14:32:15', sensor: 'Vib-001', value: '98.5 mm/s²' },
          { timestamp: '14:32:14', sensor: 'Temp-002', value: '172.1°F' },
          { timestamp: '14:32:13', sensor: 'Vib-003', value: '45.8 mm/s²' }
        ]
      },
      'Vibration Sensors': {
        records: 28,
        lastSync: 'Real-time',
        data: [
          { sensor: 'Vib-001', location: 'P01-Bel', value: '58.3 mm/s²', status: 'Warning' },
          { sensor: 'Vib-002', location: 'P01-Jon', value: '118.3 mm/s²', status: 'Critical' },
          { sensor: 'Vib-003', location: 'P01-Bel', value: '35.2 mm/s²', status: 'Normal' }
        ]
      },
      'Temperature Sensors': {
        records: 28,
        lastSync: 'Real-time',
        data: [
          { sensor: 'Temp-001', location: 'P01-Bel', value: '152.7°F', status: 'Warning' },
          { sensor: 'Temp-002', location: 'P01-Jon', value: '181.2°F', status: 'Critical' },
          { sensor: 'Temp-003', location: 'P01-Bel', value: '140.2°F', status: 'Normal' }
        ]
      }
    };

    return mockDataMap[source] || {
      records: 0,
      lastSync: 'Unknown',
      data: []
    };
  };

  const mockData = getMockData();

  const handleCardClick = () => {
    if (onToggle) {
      onToggle();
      return;
    }
    setShowPopup(true);
  };

  const Root = onToggle ? 'button' : 'div';
  const rootProps = onToggle ? { type: 'button' } : {};

  return (
    <>
      <Root
        {...rootProps}
        className={`database-indicator ${status} clickable ${selected ? 'database-indicator--selected' : ''} ${
          onToggle ? 'database-indicator--toggle' : ''
        }`}
        onClick={handleCardClick}
        title={onToggle ? 'Show or hide details below' : 'Click to view data preview'}
      >
        <div className="database-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="18" height="4" rx="1" fill="currentColor" opacity="0.3"/>
            <rect x="3" y="10" width="18" height="4" rx="1" fill="currentColor" opacity="0.2"/>
            <rect x="3" y="16" width="18" height="4" rx="1" fill="currentColor" opacity="0.1"/>
            <circle className="pulse-dot" cx="20" cy="6" r="3" fill="currentColor"/>
          </svg>
        </div>
        <div className="database-info">
          <span className="database-source">{source}</span>
          <span
            className={`database-status ${subtitle ? 'database-status--live-data' : ''}`}
            title={subtitle || undefined}
          >
            {subtitle || (status === 'active' ? 'Syncing...' : 'Connected')}
          </span>
        </div>
        <div className="data-stream">
          <div className="stream-line"></div>
          <div className="stream-line"></div>
          <div className="stream-line"></div>
        </div>
      </Root>

      {showPopup && (
        <div className="database-popup-overlay" onClick={() => setShowPopup(false)}>
          <div className="database-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3>{source}</h3>
              <button className="popup-close" onClick={() => setShowPopup(false)}>×</button>
            </div>
            <div className="popup-content">
              <div className="popup-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Records:</span>
                  <span className="stat-value">{mockData.records.toLocaleString()}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Last Sync:</span>
                  <span className="stat-value">{mockData.lastSync}</span>
                </div>
              </div>
              <div className="popup-data-preview">
                <h4>Recent data preview</h4>
                <DatabasePreviewTable data={mockData.data} emptyLabel="No preview rows" />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DatabaseIndicator;
