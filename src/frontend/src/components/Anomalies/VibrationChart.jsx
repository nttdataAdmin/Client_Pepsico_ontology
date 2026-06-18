import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, Cell } from 'recharts';
import './VibrationChart.css';

const VibrationChart = ({ data }) => {
  const insights = useMemo(() => {
    if (!data || data.length === 0) return null;

    const vibrations = data.map(d => parseFloat(d.vibration)).filter(v => !isNaN(v));
    if (vibrations.length === 0) return null;

    const max = Math.max(...vibrations);
    const min = Math.min(...vibrations);
    const avg = vibrations.reduce((a, b) => a + b, 0) / vibrations.length;
    const threshold = 100;
    const criticalThreshold = 120;

    const aboveThreshold = vibrations.filter(v => v > threshold).length;
    const aboveCritical = vibrations.filter(v => v > criticalThreshold).length;
    const trend = vibrations[vibrations.length - 1] > vibrations[0] ? 'increasing' : 'decreasing';
    const trendPercent = ((vibrations[vibrations.length - 1] - vibrations[0]) / vibrations[0] * 100).toFixed(1);

    // Group by asset to find problematic assets
    const assetGroups = {};
    data.forEach(item => {
      if (!assetGroups[item.asset_id]) {
        assetGroups[item.asset_id] = [];
      }
      if (item.vibration) {
        assetGroups[item.asset_id].push(parseFloat(item.vibration));
      }
    });

    const problematicAssets = Object.entries(assetGroups)
      .map(([asset_id, vibs]) => ({
        asset_id,
        maxVib: Math.max(...vibs),
        avgVib: vibs.reduce((a, b) => a + b, 0) / vibs.length,
        plant: data.find(d => d.asset_id === asset_id)?.plant || 'Unknown'
      }))
      .filter(a => a.maxVib > threshold)
      .sort((a, b) => b.maxVib - a.maxVib)
      .slice(0, 3);

    return {
      max, min, avg, threshold, criticalThreshold,
      aboveThreshold, aboveCritical, trend, trendPercent,
      problematicAssets,
      status: max > criticalThreshold ? 'critical' : max > threshold ? 'warning' : 'normal'
    };
  }, [data]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Group by time and calculate average vibration
    const timeGroups = {};
    data.forEach((item) => {
      const time = item.time || '00:00';
      if (!timeGroups[time]) {
        timeGroups[time] = { time, vibration: 0, count: 0 };
      }
      if (item.vibration !== undefined && item.vibration !== null) {
        timeGroups[time].vibration += parseFloat(item.vibration);
        timeGroups[time].count++;
      }
    });

    const result = Object.values(timeGroups)
      .map((group) => ({
        time: group.time,
        vibration: parseFloat(group.count > 0 ? (group.vibration / group.count).toFixed(2) : 0),
      }))
      .sort((a, b) => {
        const timeA = a.time.split(':');
        const timeB = b.time.split(':');
        return parseInt(timeA[0]) * 60 + parseInt(timeA[1]) - (parseInt(timeB[0]) * 60 + parseInt(timeB[1]));
      });

    // Mark threshold crossings
    const threshold = 100;
    const criticalThreshold = 120;
    return result.map((point, index) => {
      const prevPoint = index > 0 ? result[index - 1] : null;
      const crossesThreshold = prevPoint && prevPoint.vibration <= threshold && point.vibration > threshold;
      const crossesCritical = prevPoint && prevPoint.vibration <= criticalThreshold && point.vibration > criticalThreshold;

      return {
        ...point,
        crossesThreshold,
        crossesCritical,
        aboveThreshold: point.vibration > threshold,
        aboveCritical: point.vibration > criticalThreshold
      };
    });
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="vibration-chart card">
        <div className="chart-title">Vibration Monitoring (YTD)</div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          No vibration data available for the selected filters.
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...chartData.map(d => d.vibration));
  const yDomain = [0, Math.max(maxValue * 1.2, 150)];

  return (
    <div className="vibration-chart card">
      <div className="chart-header">
        <div className="chart-title">Vibration Monitoring</div>
        {insights && (
          <div className={`status-badge ${insights.status}`}>
            {insights.status === 'critical' ? '🔴 Critical' : insights.status === 'warning' ? '🟡 Warning' : '🟢 Normal'}
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="vibrationGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2196F3" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#2196F3" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="time"
            label={{ value: 'Time', position: 'insideBottom', offset: -5 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            label={{ value: 'Vibration (mm/s²)', angle: -90, position: 'insideLeft' }}
            domain={yDomain}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
            formatter={(value) => [`${value} mm/s²`, 'Vibration']}
          />
          {/* Safe zone */}
          <ReferenceLine y={100} stroke="#4caf50" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'Safe Threshold', position: 'right' }} />
          {/* Critical zone */}
          <ReferenceLine y={120} stroke="#f44336" strokeDasharray="3 3" strokeWidth={2} label={{ value: 'Critical Threshold', position: 'right' }} />
          <Area
            type="monotone"
            dataKey="vibration"
            stroke="#2196F3"
            strokeWidth={3}
            fill="url(#vibrationGradient)"
            dot={(props) => {
              const { payload } = props;
              if (payload.crossesCritical) {
                return (
                  <g>
                    <circle cx={props.cx} cy={props.cy} r={8} fill="#f44336" stroke="#fff" strokeWidth={3} opacity={0.9} />
                    <circle cx={props.cx} cy={props.cy} r={4} fill="#fff" />
                    <text x={props.cx} y={props.cy - 12} textAnchor="middle" fontSize="10" fill="#f44336" fontWeight="bold">⚠</text>
                  </g>
                );
              }
              if (payload.crossesThreshold) {
                return (
                  <g>
                    <circle cx={props.cx} cy={props.cy} r={7} fill="#ff9800" stroke="#fff" strokeWidth={2} opacity={0.9} />
                    <circle cx={props.cx} cy={props.cy} r={3} fill="#fff" />
                    <text x={props.cx} y={props.cy - 10} textAnchor="middle" fontSize="9" fill="#ff9800" fontWeight="bold">!</text>
                  </g>
                );
              }
              if (payload.aboveCritical) {
                return <circle cx={props.cx} cy={props.cy} r={4} fill="#f44336" />;
              }
              if (payload.aboveThreshold) {
                return <circle cx={props.cx} cy={props.cy} r={3} fill="#ff9800" />;
              }
              return <circle cx={props.cx} cy={props.cy} r={2} fill="#2196F3" />;
            }}
            activeDot={{ r: 8 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {insights && (
        <div className="chart-insights">
          {/* Threshold Crossings Summary */}
          {(() => {
            const crossings = chartData.filter((d, i) => {
              if (i === 0) return false;
              const prev = chartData[i - 1];
              return (prev.vibration <= 100 && d.vibration > 100) || (prev.vibration <= 120 && d.vibration > 120);
            });

            if (crossings.length > 0) {
              return (
                <div className="threshold-crossings">
                  <div className="crossings-title">⚠️ Threshold Crossings Detected</div>
                  <div className="crossings-list">
                    {crossings.map((crossing, idx) => (
                      <div key={idx} className="crossing-item">
                        <span className="crossing-time">{crossing.time}</span>
                        <span className="crossing-value">
                          {crossing.crossesCritical ? '🔴 Critical' : '🟡 Warning'}: {crossing.vibration.toFixed(1)} mm/s²
                        </span>
                        <span className="crossing-action">
                          {crossing.crossesCritical ? 'Immediate Action' : 'Monitor'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <div className="insights-grid">
            <div className="insight-card">
              <div className="insight-label">Max Vibration</div>
              <div className={`insight-value ${insights.max > insights.criticalThreshold ? 'critical' : insights.max > insights.threshold ? 'warning' : 'normal'}`}>
                {insights.max.toFixed(1)} mm/s²
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-label">Average</div>
              <div className="insight-value normal">{insights.avg.toFixed(1)} mm/s²</div>
            </div>
            <div className="insight-card">
              <div className="insight-label">Trend</div>
              <div className={`insight-value ${insights.trend === 'increasing' ? 'warning' : 'normal'}`}>
                {insights.trend === 'increasing' ? '↗' : '↘'} {Math.abs(insights.trendPercent)}%
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-label">Threshold Breaches</div>
              <div className={`insight-value ${insights.aboveCritical > 0 ? 'critical' : insights.aboveThreshold > 0 ? 'warning' : 'normal'}`}>
                {insights.aboveCritical > 0 ? `${insights.aboveCritical} Critical` : insights.aboveThreshold > 0 ? `${insights.aboveThreshold} Warning` : 'None'}
              </div>
            </div>
          </div>

          {insights.problematicAssets.length > 0 && (
            <div className="actionable-insights">
              <div className="insights-title">⚠️ Assets Requiring Attention</div>
              <div className="assets-list">
                {insights.problematicAssets.map((asset, idx) => (
                  <div key={idx} className="asset-alert">
                    <span className="asset-name">{asset.plant} - {asset.asset_id}</span>
                    <span className="asset-metric">Max: {asset.maxVib.toFixed(1)} mm/s²</span>
                    <span className="action-badge">Inspect Required</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="recommendations">
            <div className="recommendations-title">💡 Recommendations</div>
            <ul className="recommendations-list">
              {insights.max > insights.criticalThreshold && (
                <li className="recommendation critical">Immediate inspection required for assets exceeding critical threshold (120 mm/s²)</li>
              )}
              {insights.trend === 'increasing' && (
                <li className="recommendation warning">Vibration trend is increasing - schedule preventive maintenance</li>
              )}
              {insights.aboveThreshold > 0 && (
                <li className="recommendation warning">Monitor {insights.aboveThreshold} data points above safe threshold</li>
              )}
              {insights.max <= insights.threshold && (
                <li className="recommendation normal">All readings within safe limits - continue regular monitoring</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default VibrationChart;
