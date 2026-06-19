import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getRecommendations, getAssetsFiltered } from '../../data/mockData';
import { getAIRecommendation } from '../../services/aiService';
import RecommendationsTable from './RecommendationsTable';
import ConstraintsCheckPopup from './ConstraintsCheckPopup';
import SelectPlaceGate from '../Layout/SelectPlaceGate';
import { DataFeedHint } from '../Agentic/IntegratedDataPanels';
import { useAppFlow } from '../../context/AppFlowContext';
import ManagerScopeBanner from '../Layout/ManagerScopeBanner';
import { operatorRoleShort } from '../../utils/operatorRole';
import { usePageChatKnowledge } from '../../context/ChatAssistantContext';
import { buildExecutiveKpiModel, formatKpiDigestForPrompt } from '../../utils/executiveKpiModel';
import './Recommendations.css';

const MONTH_MAP = {
  Jan: 'January',
  Feb: 'February',
  Mar: 'March',
  Apr: 'April',
  May: 'May',
  Jun: 'June',
  Jul: 'July',
  Aug: 'August',
  Sep: 'September',
  Oct: 'October',
  Nov: 'November',
  Dec: 'December',
};

const Recommendations = ({ selectedMonth, selectedYear, filters, onFiltersChange }) => {
  const { flow, excelBundle } = useAppFlow();
  const isManager = flow.accountRole === 'manager';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [aiNba, setAiNba] = useState(null);

  // Constraint-check state: holds the first response while we ask the user
  // whether to apply or override the eligibility rules. When `null`, the
  // recommendation popup renders directly.
  const [constraintsCheck, setConstraintsCheck] = useState(null);
  const [pendingAssetId, setPendingAssetId] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      const monthName = MONTH_MAP[selectedMonth] || selectedMonth;
      const filterParams = {
        year: selectedYear,
        ...filters,
      };
      if (monthName && monthName !== selectedMonth) {
        filterParams.month = monthName;
      }
      const data = getRecommendations(filterParams, { operatorRole: flow.operatorRole });
      setRows(data);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [selectedMonth, selectedYear, filters, flow.operatorRole]);

  const buildPayload = useCallback(
    (assetId) => {
      const assetRow = getAssetsFiltered({ asset_id: assetId }, { operatorRole: flow.operatorRole })[0] || {};
      const monthName = MONTH_MAP[selectedMonth] || selectedMonth;
      const kpiModel = buildExecutiveKpiModel({
        filters,
        operatorRole: flow.operatorRole,
        qcGo: flow.outcome === 'go',
        selectedMonth,
        selectedYear,
        excelBundle: excelBundle || {},
      });
      return {
        ...assetRow,
        asset_id: assetId,
        asset_type: assetRow.asset_type,
        status: assetRow.status,
        criticality: assetRow.criticality,
        plant: assetRow.plant,
        state: assetRow.state,
        month: monthName && monthName !== selectedMonth ? monthName : selectedMonth,
        year: selectedYear,
        filterContext: filters,
        timestamp: new Date().toISOString(),
        kpiDigestForAi: formatKpiDigestForPrompt(kpiModel),
      };
    },
    [filters, flow.operatorRole, flow.outcome, excelBundle, selectedMonth, selectedYear]
  );

  const handleGetAIRecommendation = useCallback(
    async (assetId) => {
      setLoadingAI(true);
      setAiRecommendation(null);
      setAiNba(null);
      setConstraintsCheck(null);
      setPendingAssetId(assetId);
      try {
        const payload = buildPayload(assetId);
        setPendingPayload(payload);
        const res = await getAIRecommendation(payload, { applyConstraints: true });
        const text = res && typeof res === 'object' ? res.text : String(res);
        const nba = res && typeof res === 'object' ? res.nba : null;

        const blocked = nba?.constraints?.blocked_action_ids || [];
        const warned = nba?.constraints?.warned_action_ids || [];

        // Only gate the user when at least one rule fires. Otherwise show the
        // recommendation popup straight away (same UX as before).
        if (blocked.length > 0 || warned.length > 0) {
          setConstraintsCheck({ text, nba });
        } else {
          setAiRecommendation(text);
          setAiNba(nba);
        }
      } catch (e) {
        console.error(e);
        setAiRecommendation('Recommendation could not be loaded. Check that the backend API is reachable.');
      } finally {
        setLoadingAI(false);
      }
    },
    [buildPayload]
  );

  const handleApplyConstraints = useCallback(() => {
    if (!constraintsCheck) return;
    setAiRecommendation(constraintsCheck.text);
    setAiNba(constraintsCheck.nba);
    setConstraintsCheck(null);
  }, [constraintsCheck]);

  const handleOverrideConstraints = useCallback(async () => {
    if (!pendingPayload) return;
    setLoadingAI(true);
    setConstraintsCheck(null);
    try {
      const res = await getAIRecommendation(pendingPayload, { applyConstraints: false });
      const text = res && typeof res === 'object' ? res.text : String(res);
      const nba = res && typeof res === 'object' ? res.nba : null;
      setAiRecommendation(text);
      setAiNba(nba);
    } catch (e) {
      console.error(e);
      setAiRecommendation('Override fetch failed. Check that the backend API is reachable.');
    } finally {
      setLoadingAI(false);
    }
  }, [pendingPayload]);

  const handleCancelConstraints = useCallback(() => {
    setConstraintsCheck(null);
    setAiRecommendation(null);
    setAiNba(null);
    setPendingAssetId(null);
    setPendingPayload(null);
  }, []);

  const recChatKnowledge = useMemo(() => {
    if (!filters.state) {
      return 'Recommendations step: no state selected.';
    }
    return JSON.stringify(
      {
        view: 'recommendations',
        filters,
        period: { month: selectedMonth, year: selectedYear },
        loading,
        recommendationRowCount: rows.length,
        operatorRole: flow.operatorRole,
        accountRole: flow.accountRole,
        managerBreakdownScope: isManager,
      },
      null,
      2
    );
  }, [filters, selectedMonth, selectedYear, loading, rows.length, flow.operatorRole, flow.accountRole, isManager]);

  usePageChatKnowledge(recChatKnowledge);

  if (!filters.state) {
    return (
      <div className="recommendations-page">
        <h2 className="page-title">Recommendations</h2>
        <SelectPlaceGate
          filters={filters}
          onFiltersChange={onFiltersChange}
          title="Select a location for recommendations"
          hint="Recommendation rows are scoped to the selected site."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="recommendations-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  const constrainedNba = constraintsCheck?.nba || null;
  const rawWinner = constrainedNba?.constraints?.raw_winner || null;
  const constrainedWinner = constrainedNba
    ? { title: constrainedNba.title, score: constrainedNba.score }
    : null;

  return (
    <div className="recommendations-page">
      <h2 className="page-title">Recommendations</h2>
      {isManager ? <ManagerScopeBanner /> : null}
      <p className="agentic-section-intro">
        <strong>{operatorRoleShort(flow.operatorRole)}</strong> — click <em>View Recommendation</em> on an asset to run the
        reliability <strong>model</strong> (action id, title, ranked scores) and synthesize the <strong>LLM narrative</strong>
        in the popup. When eligibility rules apply, you'll be shown which actions are removed before the final pick.
      </p>
      {!isManager ? <DataFeedHint /> : null}

      <h3 className="rec-section-label">Asset recommendations</h3>
      <RecommendationsTable
        recommendations={rows}
        onGetAIRecommendation={handleGetAIRecommendation}
        loadingAI={loadingAI}
        aiRecommendation={aiRecommendation}
        aiNba={aiNba}
        aiRecommendations={[]}
        onClosePopup={() => {
          setAiRecommendation(null);
          setAiNba(null);
          setPendingAssetId(null);
          setPendingPayload(null);
        }}
      />

      <ConstraintsCheckPopup
        open={!!constraintsCheck}
        constraints={constrainedNba?.constraints || null}
        rawWinnerOverride={rawWinner}
        constrainedWinner={constrainedWinner}
        assetId={pendingAssetId}
        onApply={handleApplyConstraints}
        onOverride={handleOverrideConstraints}
        onCancel={handleCancelConstraints}
      />
    </div>
  );
};

export default Recommendations;
