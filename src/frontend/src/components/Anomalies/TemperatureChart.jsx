import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import './TemperatureChart.css';

const TemperatureChart = ({ data }) => {
  const insights = useMemo(() => {
    if (!data || data.length === 0) return null;

    const temperatures = data.map(d => parseFloat(d.temperature)).filter(t => !isNaN(t));
    if (temperatures.length === 0) return null;

    const max = Math.max(...temperatures);
    const min = Math.min(...temperatures);
    const avg = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
    const threshold = 170;
    const criticalThreshold = 180;

    const aboveThreshold = temperatures.filter(t => t > threshold).length;
    const aboveCritical = temperatures.filter(t => t > criticalThreshold).length;
    const belowThreshold = temperatures.filter(t => t < 80).length;
    const trend = temperatures[temperatures.length - 1] > temperatures[0] ? 'increasing' : 'decreasing';
    const trendPercent = ((temperatures[temperatures.length - 1] - temperatures[0]) / temperatures[0] * 100).toFixed(1);

    // Group by asset to find problematic assets
    const assetGroups = {};
    data.forEach(item => {
      if (!assetGroups[item.asset_id]) {
        assetGroups[item.asset_id] = [];
      }
      if (item.temperature) {
        assetGroups[item.asset_id].push(parseFloat(item.temperature));
      }
    });

    const problematicAssets = Object.entries(assetGroups)
      .map(([asset_id, temps]) => ({
        asset_id,
        maxTemp: Math.max(...temps),
        avgTemp: temps.reduce((a, b) => a + b, 0) / temps.length,
        plant: data.find(d => d.asset_id === asset_id)?.plant || 'Unknown'
      }))
      .filter(a => a.maxTemp > threshold)
      .sort((a, b) => b.maxTemp - a.maxTemp)
      .slice(0, 3);

    return {
      max, min, avg, threshold, criticalThreshold,
      aboveThreshold, aboveCritical, belowThreshold, trend, trendPercent,
      problematicAssets,
      status: max > criticalThreshold ? 'critical' : max > threshold ? 'warning' : 'normal'
    };
  }, [data]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Group by time and calculate average temperature
    const timeGroups = {};
    data.forEach((item) => {
      const time = item.time || '00:00';
      if (!timeGroups[time]) {
        timeGroups[time] = { time, temperature: 0, count: 0 };
      }
      if (item.temperature !== undefined && item.temperature !== null) {
        timeGroups[time].temperature += parseFloat(item.temperature);
        timeGroups[time].count++;
      }
    });

    const result = Object.values(timeGroups)
      .map((group) => ({
        time: group.time,
        temperature: parseFloat(group.count > 0 ? (group.temperature / group.count).toFixed(2) : 0),
      }))
      .sort((a, b) => {
        const timeA = a.time.split(':');
        const timeB = b.time.split(':');
        return parseInt(timeA[0]) * 60 + parseInt(timeA[1]) - (parseInt(timeB[0]) * 60 + parseInt(timeB[1]));
      });

    // Mark threshold crossings
    const threshold = 170;
    const criticalThreshold = 180;
    return result.map((point, index) => {
      const prevPoint = index > 0 ? result[index - 1] : null;
      const crossesThreshold = prevPoint && prevPoint.temperature <= threshold && point.temperature > threshold;
      const crossesCritical = prevPoint && prevPoint.temperature <= criticalThreshold && point.temperature > criticalThreshold;

      return {
        ...point,
        crossesThreshold,
        crossesCritical,
        aboveThreshold: point.temperature > threshold,
        aboveCritical: point.temperature > criticalThreshold
      };
    });
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="temperature-chart card">
        <div className="chart-title">Temperature Monitoring (YTD)</div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          No temperature data available for the selected filters.
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...chartData.map(d => d.temperature));
  const minValue = Math.min(...chartData.map(d => d.temperature));
  const yDomain = [Math.max(minValue - 20, 60), Math.max(maxValue + 20, 200)];

  return (
    <div className="temperature-chart card">
      <div className="chart-header">
        <div className="chart-title">Temperature Monitoring</div>
        {insights && (
          <div className={`status-badge ${insights.status}`}>
            {insights.status === 'critical' ? '🔴 Critical' : insights.status === 'warning' ? '🟡 Warning' : '🟢 Normal'}
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="temperatureGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF5722" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#FF5722" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="time"
            label={{ value: 'Time', position: 'insideBottom', offset: -5 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            label={{ value: 'Temperature (°F)', angle: -90, position: 'insideLeft' }}
            domain={yDomain}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
            formatter={(value) => [`${value}°F`, 'Temperature']}
          />
          {/* Safe zone boundaries */}
          <ReferenceLine y={170} stroke="#ff9800" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'Warning Threshold', position: 'right' }} />
          <ReferenceLine y={180} stroke="#f44336" strokeDasharray="3 3" strokeWidth={2} label={{ value: 'Critical Threshold', position: 'right' }} />
          <ReferenceLine y={80} stroke="#4caf50" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'Min Safe', position: 'right' }} />
          <Area
            type="monotone"
            dataKey="temperature"
            stroke="#FF5722"
            strokeWidth={3}
            fill="url(#temperatureGradient)"
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
              return <circle cx={props.cx} cy={props.cy} r={2} fill="#FF5722" />;
            }}
            activeDot={{ r: 10 }}
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
              return (prev.temperature <= 170 && d.temperature > 170) || (prev.temperature <= 180 && d.temperature > 180);
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
                          {crossing.crossesCritical ? '🔴 Critical' : '🟡 Warning'}: {crossing.temperature.toFixed(1)}°F
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
              <div className="insight-label">Max Temperature</div>
              <div className={`insight-value ${insights.max > insights.criticalThreshold ? 'critical' : insights.max > insights.threshold ? 'warning' : 'normal'}`}>
                {insights.max.toFixed(1)}°F
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-label">Average</div>
              <div className="insight-value normal">{insights.avg.toFixed(1)}°F</div>
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
                    <span className="asset-metric">Max: {asset.maxTemp.toFixed(1)}°F</span>
                    <span className="action-badge">Cooling Check</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="recommendations">
            <div className="recommendations-title">💡 Recommendations</div>
            <ul className="recommendations-list">
              {insights.max > insights.criticalThreshold && (
                <li className="recommendation critical">Immediate cooling system inspection required - temperature exceeds critical threshold (180°F)</li>
              )}
              {insights.trend === 'increasing' && (
                <li className="recommendation warning">Temperature trend is rising - check cooling systems and lubrication</li>
              )}
              {insights.aboveThreshold > 0 && (
                <li className="recommendation warning">Monitor {insights.aboveThreshold} readings above warning threshold (170°F)</li>
              )}
              {insights.belowThreshold > 0 && (
                <li className="recommendation warning">Check {insights.belowThreshold} low temperature readings - possible sensor issues</li>
              )}
              {insights.max <= insights.threshold && insights.belowThreshold === 0 && (
                <li className="recommendation normal">All readings within safe operating range - continue regular monitoring</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemperatureChart;
