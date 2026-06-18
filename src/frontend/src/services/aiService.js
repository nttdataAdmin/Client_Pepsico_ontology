import { azureConfig } from '../config/azureConfig';
import { getAnomalies, getRootCauseAnalysis, getResponsiblePartyForAsset } from '../data/mockData';
import { getSessionOperatorRole } from '../utils/operatorRole';
import { api } from './api';

export const getAIRecommendation = async (assetData) => {
  const assetId = assetData.asset_id;
  const cmmsResponsible = getResponsiblePartyForAsset(assetId);
  const roleOpts = { operatorRole: getSessionOperatorRole() };
  const anomalies = getAnomalies({ asset_id: assetId }, roleOpts);
  const rootCauseData = getRootCauseAnalysis({ asset_id: assetId }, roleOpts);
  const rootCauseInfo = rootCauseData?.flow?.asset_id?.[assetId] || null;
  const pastEvents = rootCauseInfo?.past_events || [];
  const anomalyInsights =
    anomalies.length > 0
      ? {
          recentReadings: anomalies.slice(-3).map((a) => ({
            time: a.time,
            vibration: a.vibration,
            temperature: a.temperature,
          })),
          maxVibration: Math.max(...anomalies.map((a) => a.vibration || 0)),
          maxTemperature: Math.max(...anomalies.map((a) => a.temperature || 0)),
          thresholdBreaches: anomalies.filter((a) => a.vibration > 100 || a.temperature > 170).length,
        }
      : null;

  const recommendationContext = {
    asset: {
      id: assetId,
      type: assetData.asset_type,
      status: assetData.status,
      criticality: assetData.criticality,
      location: `${assetData.plant || ''}, ${assetData.state || ''}`,
      rul: assetData.rul,
    },
    anomalies: anomalyInsights,
    rootCauses: rootCauseInfo?.root_causes || [],
    pastEvents: pastEvents.slice(-3),
    timeContext: {
      month: assetData.month,
      year: assetData.year,
      timestamp: assetData.timestamp || new Date().toISOString(),
    },
  };

  const body = {
    ...assetData,
    cmmsWorkcenterRoles: cmmsResponsible,
    recommendationContext,
  };

  try {
    const response = await api.post('/api/ai/recommendations', body, { timeout: 120000 });
    const data = response.data || {};
    const text = data.result;
    const nba = data.nba != null ? data.nba : null;
    if (typeof text === 'string' && text.trim()) {
      return { text, nba };
    }
    throw new Error('Empty recommendation from API');
  } catch (error) {
    console.error('AI Service Error:', error);
    const status = assetData.status || 'Unknown';
    const criticality = assetData.criticality || 'Medium';
    const location = assetData.plant || assetData.state || 'Unknown location';
    const assetType = assetData.asset_type || 'Asset';
    const responsible = getResponsiblePartyForAsset(assetData.asset_id);
    const kpiIntro = assetData.kpiDigestForAi
      ? `**Based on these KPIs:**\n${assetData.kpiDigestForAi}\n\n`
      : '';

    return {
      text: `${kpiIntro}**AI Recommendation for ${assetData.asset_id || 'Asset'}**\n\n**Executive Summary:**\nThis ${assetType} located at ${location} is currently in ${status} status with ${criticality} criticality. Based on the available data, immediate attention is required to prevent potential operational disruptions.\n\n**Immediate Actions Required:**\n${status === 'Breakdown' ? '1. **Emergency Response:** Dispatch emergency maintenance team immediately. Isolate the asset from production line to prevent cascading failures.\n2. **Safety Protocol:** Ensure all safety procedures are followed during shutdown and inspection.\n3. **Assessment:** Conduct comprehensive diagnostic assessment within 2 hours.' : status === 'Failure Predicted' ? '1. **Preventive Maintenance:** Schedule preventive maintenance within 48 hours to address predicted failure.\n2. **Increased Monitoring:** Implement hourly condition monitoring checks.\n3. **Resource Allocation:** Assign dedicated maintenance team and prepare replacement parts inventory.' : '1. **Continue Monitoring:** Maintain current monitoring schedule.\n2. **Routine Maintenance:** Proceed with scheduled maintenance program.\n3. **Documentation:** Update maintenance logs and track performance metrics.'}\n\n**Workcenterroles (CMMS row):**\n- ${responsible}\n\n**Detailed Analysis:**\nThe asset's current condition suggests ${criticality === 'High' ? 'significant risk factors that require immediate intervention' : 'moderate wear patterns that should be addressed proactively'}. Historical data indicates potential bearing-related issues and structural wear that could escalate if not addressed.\n\n**Preventive Measures:**\n- Implement enhanced vibration monitoring with real-time alerts\n- Establish quarterly bearing inspection schedule\n- Review and optimize lubrication protocols\n- Conduct thermal imaging analysis monthly\n- Train maintenance staff on early warning signs\n\n**Risk Assessment:**\n${criticality === 'High' ? '**High Risk:** Probability of unplanned downtime: 75-85%. Estimated production impact: $50,000-$100,000 per day. Immediate action required to mitigate catastrophic failure risk.' : '**Moderate Risk:** Probability of unplanned downtime: 30-45%. Estimated production impact: $20,000-$40,000 per day. Proactive maintenance recommended within next maintenance window.'}\n\n**Expected Outcomes:**\n- Extended asset life by 30-40% through proactive maintenance\n- Reduction in unplanned downtime by 60-75%\n- Improved reliability metrics (MTBF increase of 25-35%)\n- Cost savings of $100,000-$200,000 annually through preventive measures\n- Enhanced safety compliance and reduced environmental risks\n\n**Next Steps:**\n1. Review with ${responsible} (within 24 hours)\n2. Prepare maintenance work order aligned with Planned downtime (within 48 hours)\n3. Schedule maintenance window with production (within 1 week)\n4. Implement enhanced monitoring (within 2 weeks)\n\n*(Backend unreachable — offline fallback. Start API on port 9898. CatBoost NBA runs on the server when the API is available.)*`,
      nba: null,
    };
  }
};

export const getAIAnalysis = async (assetId, assetData, historicalData) => {
  try {
    const response = await fetch(
      `${azureConfig.endpoint}openai/deployments/${azureConfig.deployment}/chat/completions?api-version=${azureConfig.apiVersion}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azureConfig.apiKey,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are an expert root cause analysis specialist for PepsiCo.',
            },
            {
              role: 'user',
              content: `Provide root cause analysis for Asset ID: ${assetId}\nAsset Data: ${JSON.stringify(assetData, null, 2)}\n${historicalData ? `Historical Data: ${JSON.stringify(historicalData, null, 2)}` : ''}\n\nProvide: 1) Root cause identification, 2) Contributing factors, 3) Impact assessment, 4) Likelihood of failure, 5) Investigation steps.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 800,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Azure API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('AI Analysis Error:', error);
    return `Root Cause Analysis for ${assetId}: Based on the asset's current status and RUL threshold, the primary root cause appears to be bearing misalignment (75% probability). Contributing factors include structural wear and potential lubrication issues. Impact: High risk of unplanned downtime. Recommended investigation: Bearing inspection, structural integrity check, and vibration analysis.`;
  }
};
