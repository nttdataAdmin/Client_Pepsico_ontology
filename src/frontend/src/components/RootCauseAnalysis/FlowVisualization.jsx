import React, { useMemo, useId, useState, useCallback, useEffect } from 'react';
import { deriveRcaFlowSnapshot } from './deriveRcaFlowSnapshot';
import {
  flowAiInsightFleet,
  flowAiInsightState,
  flowAiInsightPlant,
  flowAiInsightAsset,
  flowAiInsightRul,
  flowAiInsightCause,
} from './flowAiInsights';
import './FlowVisualization.css';

function FlowAiInsightDock({ insight, onClose }) {
  if (!insight) return null;
  return (
    <div className="flow-ai-overlay" onClick={onClose} role="presentation">
      <aside
        className="flow-ai-dock"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-ai-dock-title"
      >
        <header className="flow-ai-dock-head">
          <div className="flow-ai-dock-brand">
            <span className="flow-ai-dock-dot" aria-hidden />
            <span>Assessment agent</span>
          </div>
          <button type="button" className="flow-ai-dock-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <span className="flow-ai-dock-chip">{insight.tag}</span>
        <h3 id="flow-ai-dock-title" className="flow-ai-dock-title">
          {insight.headline}
        </h3>
        <p className="flow-ai-dock-summary">{insight.summary}</p>
        <ul className="flow-ai-dock-bullets">
          {insight.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
        <footer className="flow-ai-dock-foot">
          <span className="flow-ai-dock-confidence">Confidence band · {insight.confidence}</span>
        </footer>
      </aside>
    </div>
  );
}

/** Animated link between flow stages — left-to-right propagation. */
function FlowConnector({ stageIndex }) {
  const rid = useId().replace(/:/g, '');
  const delay = `${(stageIndex * 0.42).toFixed(2)}s`;

  return (
    <div className="flow-connector" aria-hidden="true">
      <svg className="flow-connector-svg" viewBox="0 0 64 32" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fcg-${rid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#005cbc" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <line
          x1="4"
          y1="16"
          x2="60"
          y2="16"
          stroke="#e2e8f0"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="4"
          y1="16"
          x2="60"
          y2="16"
          stroke={`url(#fcg-${rid})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="5 9"
          className="flow-connector-dash"
        />
        <polygon points="60,16 51,11 51,21" fill="#005cbc" className="flow-connector-head" />
      </svg>
      <span className="flow-connector-packet" style={{ animationDelay: delay }} />
    </div>
  );
}

const FlowVisualization = ({
  data,
  selectedPath,
  onPathChange,
  thresholdCrossings = [],
  scopeState = null,
  scopePlant = null,
}) => {
  const [aiInsight, setAiInsight] = useState(null);

  const openInsight = useCallback((payload) => {
    setAiInsight(payload);
  }, []);

  const closeInsight = useCallback(() => setAiInsight(null), []);

  useEffect(() => {
    if (!aiInsight) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeInsight();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aiInsight, closeInsight]);

  const flowData = useMemo(
    () => deriveRcaFlowSnapshot(data, selectedPath, thresholdCrossings, scopeState, scopePlant),
    [data, selectedPath, thresholdCrossings, scopeState, scopePlant]
  );

  if (!flowData) {
    return <div className="no-data">No data available</div>;
  }

  const getBarColor = (value, maxValue) => {
    const ratio = value / maxValue;
    if (ratio > 0.7) return 'var(--color-failure-predicted)';
    if (ratio > 0.4) return 'var(--color-under-maintenance)';
    return 'var(--color-working)';
  };

  const getMaxValue = (items) => {
    return Math.max(...Object.values(items), 1);
  };

  return (
    <div className="flow-visualization card">
      <FlowAiInsightDock insight={aiInsight} onClose={closeInsight} />
      <div className="flow-chart-caption">
        <span className="flow-chart-caption-title">Execution drill path</span>
        <span className="flow-chart-caption-hint">
          Flow advances left → right as scope narrows · click any cell for agent commentary
        </span>
      </div>
      <div className="flow-container">
        {/* Count of Asset ID Column */}
        <div className="flow-column">
          <div className="column-header">Fleet scope</div>
          <button
            type="button"
            className="column-value column-value--action"
            onClick={() => openInsight(flowAiInsightFleet(flowData.total))}
          >
            {flowData.total}
          </button>
        </div>

        <FlowConnector stageIndex={0} />

        {/* State Column */}
        <div className="flow-column">
          <div className="column-header">Region / state</div>
          {flowData.currentState && (
            <div className="column-selected">{flowData.currentState}</div>
          )}
          <div className="column-items">
            {Object.entries(flowData.states).map(([state, count]) => (
              <div
                key={state}
                className={`column-item column-item--action ${flowData.currentState === state ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onPathChange({ ...selectedPath, state });
                  openInsight(flowAiInsightState(state, count));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPathChange({ ...selectedPath, state });
                    openInsight(flowAiInsightState(state, count));
                  }
                }}
              >
                <div className="item-label">{state}</div>
                <div className="item-bar-container">
                  <div
                    className="item-bar"
                    style={{
                      width: `${(count / getMaxValue(flowData.states)) * 100}%`,
                      backgroundColor: getBarColor(count, getMaxValue(flowData.states)),
                    }}
                  ></div>
                </div>
                <div className="item-value">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <FlowConnector stageIndex={1} />

        {/* Plant Column */}
        <div className="flow-column">
          <div className="column-header">
            <span className="lock-icon">🔒</span>
            Plant
          </div>
          {flowData.currentPlant && (
            <div className="column-selected">{flowData.currentPlant}</div>
          )}
          <div className="column-items">
            {Object.entries(flowData.plants).map(([plant, count]) => (
              <div
                key={plant}
                className={`column-item column-item--action ${flowData.currentPlant === plant ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onPathChange({ ...selectedPath, plant });
                  openInsight(flowAiInsightPlant(plant, count));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPathChange({ ...selectedPath, plant });
                    openInsight(flowAiInsightPlant(plant, count));
                  }
                }}
              >
                <div className="item-label">{plant}</div>
                <div className="item-bar-container">
                  <div
                    className="item-bar"
                    style={{
                      width: `${(count / getMaxValue(flowData.plants)) * 100}%`,
                      backgroundColor: getBarColor(count, getMaxValue(flowData.plants)),
                    }}
                  ></div>
                </div>
                <div className="item-value">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <FlowConnector stageIndex={2} />

        {/* Asset ID Column */}
        <div className="flow-column">
          <div className="column-header">
            <span className="lock-icon">🔒</span>
            Asset ID
          </div>
          {flowData.currentAssetId && (
            <div className="column-selected">{flowData.currentAssetId}</div>
          )}
          <div className="column-items">
            {Object.entries(flowData.assetIds).map(([assetId, data]) => (
              <div
                key={assetId}
                className={`column-item column-item--action ${flowData.currentAssetId === assetId ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onPathChange({ ...selectedPath, asset_id: assetId, rul_threshold: data.rul_threshold });
                  openInsight(flowAiInsightAsset(assetId, data.rul_threshold));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPathChange({ ...selectedPath, asset_id: assetId, rul_threshold: data.rul_threshold });
                    openInsight(flowAiInsightAsset(assetId, data.rul_threshold));
                  }
                }}
              >
                <div className="item-label">{assetId}</div>
                <div className="item-bar-container">
                  <div
                    className="item-bar"
                    style={{
                      width: '100%',
                      backgroundColor: getBarColor(1, 1),
                    }}
                  ></div>
                </div>
                <div className="item-value">1</div>
              </div>
            ))}
          </div>
        </div>

        <FlowConnector stageIndex={3} />

        {/* RUL Threshold Column */}
        <div className="flow-column">
          <div className="column-header">
            <span className="lock-icon">🔒</span>
            RUL threshold
          </div>
          {flowData.currentRul != null && flowData.currentRul !== '' && (
            <div className="column-selected">{flowData.currentRul}</div>
          )}
          <div className="column-items">
            {flowData.currentRul != null && flowData.currentRul !== '' && (
              <div
                className="column-item column-item--action selected"
                role="button"
                tabIndex={0}
                onClick={() => openInsight(flowAiInsightRul(flowData.currentRul))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openInsight(flowAiInsightRul(flowData.currentRul));
                  }
                }}
              >
                <div className="item-label">{flowData.currentRul}</div>
                <div className="item-bar-container">
                  <div
                    className="item-bar"
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--color-failure-predicted)',
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <FlowConnector stageIndex={4} />

        {/* Root Cause Probability Column */}
        <div className="flow-column">
          <div className="column-header">
            <span className="lock-icon">🔒</span>
            Root Cause Probability
          </div>
          <div className="column-items">
            {flowData.rootCauses.map((cause, index) => (
              <div
                key={index}
                className="column-item column-item--action"
                role="button"
                tabIndex={0}
                onClick={() => openInsight(flowAiInsightCause(cause.cause, cause.probability))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openInsight(flowAiInsightCause(cause.cause, cause.probability));
                  }
                }}
              >
                <div className="item-label">{cause.cause}</div>
                <div className="item-bar-container">
                  <div
                    className="item-bar"
                    style={{
                      width: `${cause.probability * 100}%`,
                      backgroundColor: 'var(--color-failure-predicted)',
                    }}
                  ></div>
                </div>
                <div className="item-value">{Math.round(cause.probability * 100)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Past Events / Threshold Crossings Section */}
      {flowData.pastEvents && flowData.pastEvents.length > 0 && (
        <div className="past-events-section">
          <div className="section-header">
            <h3>Past events & threshold crossings</h3>
            <span className="events-count">{flowData.pastEvents.length} event(s)</span>
          </div>
          <div className="events-timeline">
            {flowData.pastEvents.map((event, idx) => (
              <div key={idx} className={`event-item ${event.threshold === 'critical' ? 'critical-event' : 'warning-event'}`}>
                <div className="event-marker">
                  <div className={`marker-dot ${event.threshold}`}></div>
                  {idx < flowData.pastEvents.length - 1 && <div className="timeline-line"></div>}
                </div>
                <div className="event-content">
                  <div className="event-header">
                    <span className="event-date">{event.date || 'Today'}</span>
                    <span className="event-time">{event.time}</span>
                    <span className={`event-badge ${event.threshold}`}>
                      {event.threshold === 'critical' ? 'Critical' : 'Warning'}
                    </span>
                    {event.source === 'historical' && (
                      <span className="source-badge">Historical</span>
                    )}
                  </div>
                  <div className="event-description">{event.description}</div>
                  <div className="event-details">
                    <span className="detail-item">
                      <strong>Type:</strong> {event.type === 'vibration' ? 'Vibration' : 'Temperature'}
                    </span>
                    <span className="detail-item">
                      <strong>Value:</strong> {event.type === 'vibration'
                        ? `${event.value.toFixed(1)} mm/s²`
                        : `${event.value.toFixed(1)}°F`}
                    </span>
                    <span className="detail-item">
                      <strong>Previous:</strong> {event.type === 'vibration'
                        ? `${event.previous.toFixed(1)} mm/s²`
                        : `${event.previous.toFixed(1)}°F`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowVisualization;
