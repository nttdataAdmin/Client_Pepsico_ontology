import React, { useState, useEffect, useMemo } from 'react';
import { getRootCauseAnalysis, getAnomalies, getRcaFormExtractForScope } from '../../data/mockData';
import FlowVisualization from './FlowVisualization';
import RcaTraceGraphic from './RcaTraceGraphic';
import SelectPlaceGate from '../Layout/SelectPlaceGate';
import { DataFeedHint, RcaCorroborationPanel } from '../Agentic/IntegratedDataPanels';
import { useAppFlow } from '../../context/AppFlowContext';
import ManagerScopeBanner from '../Layout/ManagerScopeBanner';
import { operatorRoleShort } from '../../utils/operatorRole';
import { usePageChatKnowledge } from '../../context/ChatAssistantContext';
import { deriveRcaFlowSnapshot } from './deriveRcaFlowSnapshot';
import { buildRcaCorroborationPanelModel } from '../../utils/rcaCorroborationModel';
import './RootCauseAnalysis.css';

const RootCauseAnalysis = ({ selectedMonth, selectedYear, filters, onFiltersChange }) => {
  const { excelBundle, flow } = useAppFlow();
  const isManager = flow.accountRole === 'manager';
  const [rootCauseData, setRootCauseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState({
    state: null,
    plant: null,
    asset_id: null,
    rul_threshold: null,
  });

  useEffect(() => {
    setSelectedPath({
      state: filters.state,
      plant: filters.plant || null,
      asset_id: null,
      rul_threshold: null,
    });
  }, [filters.state, filters.plant]);

  useEffect(() => {
    loadRootCauseData();
  }, [filters, selectedPath, flow.operatorRole]);

  const loadRootCauseData = () => {
    setLoading(true);
    setTimeout(() => {
      const roleOpts = { operatorRole: flow.operatorRole };
      const data = getRootCauseAnalysis(
        {
          ...filters,
          rul_threshold: selectedPath.rul_threshold,
        },
        roleOpts
      );
      setRootCauseData(data);
      setLoading(false);
    }, 300);
  };

  const thresholdCrossings = useMemo(() => {
    const anomalyData = getAnomalies(filters, { operatorRole: flow.operatorRole });
    const crossings = [];
    const assetGroups = {};
    anomalyData.forEach((item) => {
      if (!assetGroups[item.asset_id]) {
        assetGroups[item.asset_id] = [];
      }
      assetGroups[item.asset_id].push(item);
    });

    Object.entries(assetGroups).forEach(([asset_id, readings]) => {
      const sorted = readings.sort((a, b) => {
        const timeA = a.time.split(':');
        const timeB = b.time.split(':');
        return parseInt(timeA[0], 10) * 60 + parseInt(timeA[1], 10) - (parseInt(timeB[0], 10) * 60 + parseInt(timeB[1], 10));
      });

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        if (prev.vibration <= 100 && curr.vibration > 100) {
          crossings.push({
            asset_id,
            plant: curr.plant,
            time: curr.time,
            type: 'vibration',
            threshold: 'warning',
            value: curr.vibration,
            previous: prev.vibration,
          });
        }
        if (prev.vibration <= 120 && curr.vibration > 120) {
          crossings.push({
            asset_id,
            plant: curr.plant,
            time: curr.time,
            type: 'vibration',
            threshold: 'critical',
            value: curr.vibration,
            previous: prev.vibration,
          });
        }

        if (prev.temperature <= 170 && curr.temperature > 170) {
          crossings.push({
            asset_id,
            plant: curr.plant,
            time: curr.time,
            type: 'temperature',
            threshold: 'warning',
            value: curr.temperature,
            previous: prev.temperature,
          });
        }
        if (prev.temperature <= 180 && curr.temperature > 180) {
          crossings.push({
            asset_id,
            plant: curr.plant,
            time: curr.time,
            type: 'temperature',
            threshold: 'critical',
            value: curr.temperature,
            previous: prev.temperature,
          });
        }
      }
    });

    return crossings.sort((a, b) => {
      if (a.threshold !== b.threshold) {
        return a.threshold === 'critical' ? -1 : 1;
      }
      return a.time.localeCompare(b.time);
    });
  }, [filters, flow.operatorRole]);

  const rcaSnap = useMemo(() => {
    if (!rootCauseData) return null;
    return deriveRcaFlowSnapshot(
      rootCauseData,
      selectedPath,
      thresholdCrossings,
      filters.state,
      filters.plant || null
    );
  }, [rootCauseData, selectedPath, thresholdCrossings, filters.state, filters.plant]);

  const rcaFormExtract = useMemo(
    () => getRcaFormExtractForScope(filters, selectedPath, flow.operatorRole),
    [filters.state, filters.plant, filters.asset_id, selectedPath.asset_id, selectedPath.plant, flow.operatorRole]
  );

  const corroborationModel = useMemo(
    () => buildRcaCorroborationPanelModel(excelBundle || {}, rcaSnap, rcaFormExtract),
    [excelBundle, rcaSnap, rcaFormExtract]
  );

  const rootCausesByAssetForChat = useMemo(() => {
    const aid = rootCauseData?.flow?.asset_id;
    if (!aid || typeof aid !== 'object') return null;
    const out = {};
    Object.entries(aid).forEach(([id, meta]) => {
      out[id] = {
        rul_threshold: meta?.rul_threshold,
        root_causes: meta?.root_causes,
        past_events_count: Array.isArray(meta?.past_events) ? meta.past_events.length : 0,
      };
    });
    return out;
  }, [rootCauseData]);

  const rcaChatKnowledge = useMemo(() => {
    if (!filters.state) {
      return 'Root cause: no state/plant selected; user must choose a site to load RCA.';
    }
    const dataHint =
      rootCauseData && typeof rootCauseData === 'object'
        ? { topKeys: Object.keys(rootCauseData).slice(0, 20) }
        : null;
    return JSON.stringify(
      {
        view: 'root-cause',
        filters,
        period: { month: selectedMonth, year: selectedYear },
        loading,
        selectedPath,
        thresholdCrossingsCount: thresholdCrossings.length,
        thresholdCrossingsSample: thresholdCrossings.slice(0, 25),
        hasFlowSnapshot: !!rcaSnap,
        hasCorroborationPanel: !!corroborationModel,
        rootCauseDataHint: dataHint,
        rootCausesByAsset: rootCausesByAssetForChat,
        operatorRole: flow.operatorRole,
        accountRole: flow.accountRole,
        managerBreakdownScope: isManager,
      },
      null,
      2
    );
  }, [
    filters,
    selectedMonth,
    selectedYear,
    loading,
    selectedPath,
    thresholdCrossings,
    rcaSnap,
    corroborationModel,
    rootCauseData,
    rootCausesByAssetForChat,
    flow.operatorRole,
    flow.accountRole,
    isManager,
  ]);

  usePageChatKnowledge(rcaChatKnowledge);

  if (!filters.state) {
    return (
      <div className="root-cause-page">
        <h2 className="page-title">Root cause trace</h2>
        <SelectPlaceGate
          filters={filters}
          onFiltersChange={onFiltersChange}
          title="Select a location for root cause"
          hint="RCA and threshold context are scoped to the site you choose. Select Beloit or Jonesboro (and optionally a plant on Executive summary) to continue."
        />
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="root-cause-page">
      <h2 className="page-title">Root cause trace</h2>
      {isManager ? <ManagerScopeBanner /> : null}
      <p className="agentic-section-intro">
        {isManager ? (
          <>
            <strong>{operatorRoleShort(flow.operatorRole)}</strong> — trace and hypotheses follow the same site and
            leadership framing as Executive summary, with emphasis on assets in <strong>production stoppage</strong>.
          </>
        ) : (
          <>
            <strong>{operatorRoleShort(flow.operatorRole)}</strong> — RCA narratives weight equipment history differently:
            processing traces cook/seasoning chains; packaging traces palletizer and case-line fault trees. Follow the flow
            from fleet to asset, then compare corroborating beats.
          </>
        )}
      </p>

      {!isManager ? <DataFeedHint /> : null}
      {!isManager ? (
        <>
          <h3 className="rca-subheading">Corroborating analysis beats</h3>
          <RcaCorroborationPanel model={corroborationModel} />
        </>
      ) : null}

      {thresholdCrossings.length > 0 && (
        <div className="threshold-crossings-section rca-threshold-deck">
          <div className="section-header">
            <h3>Threshold crossings · execution context</h3>
            <span className="crossings-count">{thresholdCrossings.length} event(s)</span>
          </div>
          <div className="agentic-signals">
            {thresholdCrossings.map((crossing, idx) => (
              <article
                key={idx}
                className={`agentic-signal-card ${
                  crossing.threshold === 'critical' ? 'agentic-signal-card--critical' : 'agentic-signal-card--warn'
                }`}
              >
                <div className="agentic-signal-kicker">
                  {crossing.type === 'vibration' ? 'Vibration' : 'Temperature'} · {crossing.plant}
                </div>
                <h4>
                  {crossing.asset_id} · {crossing.time}
                </h4>
                <p className="agentic-signal-body">
                  Crossed <strong>{crossing.threshold}</strong> band. Observed{' '}
                  {crossing.type === 'vibration'
                    ? `${crossing.value.toFixed(1)} mm/s²`
                    : `${crossing.value.toFixed(1)}°F`}{' '}
                  from prior{' '}
                  {crossing.type === 'vibration'
                    ? `${crossing.previous.toFixed(1)} mm/s²`
                    : `${crossing.previous.toFixed(1)}°F`}
                  .
                </p>
                <p className="agentic-signal-meta">
                  Suggested stance:{' '}
                  {crossing.threshold === 'critical' ? 'Immediate line coordination' : 'Tightened watch + RCA branch'}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      <h3 className="rca-subheading">Analytical trace · scope and hypotheses</h3>
      <RcaTraceGraphic
        data={rootCauseData}
        selectedPath={selectedPath}
        thresholdCrossings={thresholdCrossings}
        scopeState={filters.state}
        scopePlant={filters.plant || null}
      />

      <h3 className="rca-subheading">Interactive flow · drill path</h3>
      <FlowVisualization
        data={rootCauseData}
        selectedPath={selectedPath}
        onPathChange={setSelectedPath}
        thresholdCrossings={thresholdCrossings}
        scopeState={filters.state}
        scopePlant={filters.plant || null}
      />

    </div>
  );
};

export default RootCauseAnalysis;
