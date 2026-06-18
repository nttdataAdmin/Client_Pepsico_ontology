import React, { useState } from 'react';
import NbaInsightBlock from './NbaInsightBlock';
import './RecommendationsTable.css';

const RecommendationsTable = ({
  recommendations,
  onGetAIRecommendation,
  loadingAI,
  aiRecommendation,
  aiNba,
  aiRecommendations,
  onClosePopup,
}) => {
  const [selectedAsset, setSelectedAsset] = useState(null);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Breakdown':
        return 'var(--color-breakdown)';
      case 'Failure Predicted':
        return 'var(--color-failure-predicted)';
      case 'Under Maintenance':
        return 'var(--color-under-maintenance)';
      default:
        return '#ccc';
    }
  };

  const handleRecommendationClick = (assetId) => {
    setSelectedAsset(assetId);
    onGetAIRecommendation(assetId);
  };

  const activeRec =
    aiRecommendation && selectedAsset
      ? recommendations.find((x) => x.asset_id === selectedAsset)
      : null;

  return (
    <div className="recommendations-container">
      <div className="recommendations-table card">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Month</th>
              <th>State</th>
              <th>Plant</th>
              <th>Asset ID</th>
              <th>Asset type</th>
              <th>Status</th>
              <th>Criticality</th>
              <th>Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                  No recommendations found for the selected filters. Try adjusting your filters or select a different month/year.
                </td>
              </tr>
            ) : (
              recommendations.map((rec, index) => (
              <tr key={index}>
                <td>{rec.year}</td>
                <td>{rec.month}</td>
                <td>{rec.state}</td>
                <td>{rec.plant}</td>
                <td>
                  <span
                    className="asset-id-cell"
                    style={{ backgroundColor: getStatusColor(rec.status) }}
                  >
                    {rec.asset_id}
                  </span>
                </td>
                <td>{rec.asset_type}</td>
                <td>
                  <span className="status-badge" style={{ backgroundColor: getStatusColor(rec.status) }}>
                    {rec.status}
                  </span>
                </td>
                <td>{rec.criticality || '-'}</td>
                <td>
                  <span
                    className="recommendation-link"
                    onClick={() => handleRecommendationClick(rec.asset_id)}
                    title="Click to view AI-generated recommendation with steps"
                  >
                    {rec.recommendation || 'View Recommendation'}
                  </span>
                </td>
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>

      {aiRecommendation && selectedAsset && (
        <div className="ai-recommendation-overlay" onClick={(e) => {
          if (e.target.className === 'ai-recommendation-overlay') {
            setSelectedAsset(null);
            if (onClosePopup) onClosePopup();
          }
        }}>
          <div className="ai-recommendation-popup card">
            <div className="ai-header">
              <h3>AI Recommendation for {selectedAsset}</h3>
              <button className="close-btn" onClick={() => {
                setSelectedAsset(null);
                if (onClosePopup) onClosePopup();
              }}>×</button>
            </div>
            <div className="ai-content">
              <NbaInsightBlock
                nba={aiNba}
                assetId={selectedAsset}
                plant={activeRec?.plant}
                state={activeRec?.state}
              />
              {!aiNba && aiRecommendation ? (
                <p className="ai-nba-miss">
                  CatBoost NBA summary not available (offline API fallback). Showing narrative only.
                </p>
              ) : null}
              <div className="ai-steps">
                {aiRecommendation.split('\n').map((line, index) => {
                  if (line.trim() === '') return <br key={index} />;

                  // Handle markdown-style headers
                  if (line.match(/^#{1,3}\s/)) {
                    const level = line.match(/^#+/)[0].length;
                    const text = line.replace(/^#+\s/, '');
                    return <h4 key={index} className={`ai-heading h${level}`}>{text}</h4>;
                  }

                  // Handle bold text (**text**)
                  if (line.includes('**')) {
                    const parts = line.split(/(\*\*[^*]+\*\*)/g);
                    return (
                      <div key={index} className="ai-step">
                        {parts.map((part, i) => {
                          if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={i}>{part.slice(2, -2)}</strong>;
                          }
                          return <span key={i}>{part}</span>;
                        })}
                      </div>
                    );
                  }

                  // Format as steps if it contains numbered items or bullet points
                  if (line.match(/^\d+[\.\)]\s/) || line.match(/^[-*•]\s/)) {
                    return <div key={index} className="ai-step">{line.trim()}</div>;
                  }

                  // Handle section headers with colons
                  if (line.match(/^[A-Z][^:]+:/) && line.split(':').length === 2) {
                    const [title, content] = line.split(':');
                    return (
                      <div key={index} className="ai-section">
                        <strong className="section-title">{title}:</strong>
                        <span className="section-content">{content}</span>
                      </div>
                    );
                  }

                  return <div key={index} className="ai-text">{line}</div>;
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: 'var(--color-breakdown)' }}></div>
          <span>Breakdown</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: 'var(--color-failure-predicted)' }}></div>
          <span>Failure Predicted</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: 'var(--color-under-maintenance)' }}></div>
          <span>Under Maintenance</span>
        </div>
      </div>
    </div>
  );
};

export default RecommendationsTable;
