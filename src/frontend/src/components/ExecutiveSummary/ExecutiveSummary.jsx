import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAssetSummaryFiltered, getAssetsFiltered } from '../../data/mockData';
import AssetStatusSummary from './AssetStatusSummary';
import MapView from './MapView';
import ExecutiveDetailTabs from './ExecutiveDetailTabs';
import DatabaseIndicator from '../Layout/DatabaseIndicator';
import {
  DataFeedHint,
  ExecutiveLandingStreams,
} from '../Agentic/IntegratedDataPanels';
import { useAppFlow } from '../../context/AppFlowContext';
import { operatorRoleTitle } from '../../utils/operatorRole';
import { usePageChatKnowledge } from '../../context/ChatAssistantContext';
import { summarizeExecutiveFeeds } from '../../utils/agenticSynthesis';
import { SITE_LOCATIONS } from '../../config/siteLocations';
import ExecutiveKeyMetrics from './ExecutiveKeyMetrics';
import ExecutiveRecommendationsModal from './ExecutiveRecommendationsModal';
import ExecutiveExtractedTabs from './ExecutiveExtractedTabs';
import { getNoGoPitchNarrative } from './nogoPitchNarrative';
import { getGoPitchNarrative } from './goPitchNarrative';
import { buildExecutiveKpiModel } from '../../utils/executiveKpiModel';
import './ExecutiveSummary.css';

const ExecutiveSummary = ({ selectedMonth, selectedYear, filters, onFiltersChange }) => {
  const navigate = useNavigate();
  const { excelBundle, flow, setFlow, uploadPreview, clearUploadPreview } = useAppFlow();
  const qcGo = flow.outcome === 'go';
  const qcNoGo = flow.outcome === 'no_go';
  const hitlPending = qcNoGo && !flow.hitlApproved;
  const assessmentLocked = qcGo || hitlPending;
  const isManager = flow.accountRole === 'manager';
  const [recModalOpen, setRecModalOpen] = useState(false);
  const recAutoShownRef = useRef(false);
  const feeds = useMemo(() => summarizeExecutiveFeeds(excelBundle || {}), [excelBundle]);

  const noGoPitch = useMemo(() => {
    if (!qcNoGo || !flow.formClassifyMeta) return null;
    return getNoGoPitchNarrative(flow.operatorRole);
  }, [qcNoGo, flow.formClassifyMeta, flow.operatorRole]);

  const goPitch = useMemo(() => {
    if (!qcGo || !flow.formClassifyMeta) return null;
    return getGoPitchNarrative(flow.operatorRole);
  }, [qcGo, flow.formClassifyMeta, flow.operatorRole]);

  const extractedImageSrc = useMemo(() => {
    if (uploadPreview.objectUrl) return uploadPreview.objectUrl;
    const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    const prefix = base ? `${base}/` : '/';
    const key = flow.formClassifyMeta?.fl5883_scan_key;
    if (key === 'nogo') return `${prefix}forms/nogo.png`;
    if (key === 'go') return `${prefix}forms/go.png`;
    return flow.outcome === 'no_go' ? `${prefix}forms/nogo.png` : `${prefix}forms/go.png`;
  }, [uploadPreview.objectUrl, flow.formClassifyMeta?.fl5883_scan_key, flow.outcome]);

  const decisionKpiModel = useMemo(
    () =>
      buildExecutiveKpiModel({
        filters,
        operatorRole: flow.operatorRole,
        qcGo,
        selectedMonth,
        selectedYear,
        excelBundle: excelBundle || {},
      }),
    [filters, flow.operatorRole, qcGo, selectedMonth, selectedYear, excelBundle]
  );

  const decisionKpiRows = useMemo(() => {
    if (!decisionKpiModel) return [];
    return [
      {
        label: 'Quality score',
        value: decisionKpiModel.qualityScorePct.toFixed(1),
        unit: '%',
        band: decisionKpiModel.bands.quality,
      },
      {
        label: 'Productivity index',
        value: decisionKpiModel.productivityPct.toFixed(1),
        unit: '%',
        band: decisionKpiModel.bands.productivity,
      },
      {
        label: 'Wastage',
        value: decisionKpiModel.wastagePct.toFixed(1),
        unit: '%',
        band: decisionKpiModel.bands.wastage,
      },
    ];
  }, [decisionKpiModel]);

  const decisionKpiLines = useMemo(
    () => decisionKpiRows.map((r) => `${r.label}: ${r.value}${r.unit} (${r.band?.label || '—'})`),
    [decisionKpiRows]
  );

  const noGoBadKpiLines = useMemo(() => {
    const badOnly = decisionKpiRows
      .filter((r) => r.band?.key === 'bad')
      .map((r) => `${r.label}: ${r.value}${r.unit} (${r.band?.label || '—'})`);
    return badOnly.length ? badOnly : ['No KPI is currently in Bad band for this scope.'];
  }, [decisionKpiRows]);

  const [summary, setSummary] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailTab, setDetailTab] = useState('snapshot');
  const [fleetStatusFilter, setFleetStatusFilter] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const plantOptions = useMemo(() => {
    if (!filters.state) return [];
    const plants = new Set();
    getAssetsFiltered({ state: filters.state }, { operatorRole: flow.operatorRole }).forEach((a) =>
      plants.add(a.plant)
    );
    return [...plants].sort();
  }, [filters.state, flow.operatorRole]);

  const placeSelected = !!filters.state;

  useEffect(() => {
    if (flow.outcome === 'go' || !flow.outcome) {
      setRecModalOpen(false);
    }
    if (flow.outcome !== 'no_go') {
      recAutoShownRef.current = false;
    }
  }, [flow.outcome]);

  useEffect(() => {
    if (flow.outcome !== 'no_go' || !placeSelected || recAutoShownRef.current) return;
    recAutoShownRef.current = true;
    setRecModalOpen(true);
  }, [flow.outcome, placeSelected]);

  const goPositiveSummary = useMemo(() => {
    if (!qcGo || !summary) return null;
    const n = summary.total;
    return {
      total: n,
      working: n,
      failure_predicted: 0,
      under_maintenance: 0,
      breakdown: 0,
    };
  }, [qcGo, summary]);

  const goMapAssets = useMemo(() => {
    if (!qcGo || !assets.length) return assets;
    return assets.map((a) => ({ ...a, status: 'Working' }));
  }, [qcGo, assets]);

  const displaySummary = qcGo && goPositiveSummary ? goPositiveSummary : summary;

  const chatKnowledge = useMemo(() => {
    if (!filters.state) {
      return 'No state/plant selected. The executive view is empty until the user chooses a place from the header filters.';
    }
    try {
      return JSON.stringify(
        {
          view: 'executive-summary',
          filters,
          period: { month: selectedMonth, year: selectedYear },
          summary: displaySummary,
          qcGoPositiveSnapshot: qcGo,
          assetCount: assets.length,
          assetsOnScreen: assets,
          lastRefreshedAt: lastRefreshedAt ? lastRefreshedAt.toISOString() : null,
          excelFeedsSummary: feeds,
          qcOutcome: flow.outcome,
          hitlApproved: flow.hitlApproved,
          operatorRole: flow.operatorRole,
          accountRole: flow.accountRole,
          detailedAnalysisUnlocked: flow.detailedAnalysisUnlocked,
          formClassifyMeta: flow.formClassifyMeta,
        },
        null,
        2
      );
    } catch {
      return 'Executive summary: data snapshot unavailable.';
    }
  }, [
    filters,
    selectedMonth,
    selectedYear,
    displaySummary,
    qcGo,
    assets,
    lastRefreshedAt,
    feeds,
    flow.outcome,
    flow.hitlApproved,
    flow.operatorRole,
    flow.accountRole,
    flow.detailedAnalysisUnlocked,
    flow.formClassifyMeta,
  ]);

  usePageChatKnowledge(chatKnowledge);

  useEffect(() => {
    loadData();
  }, [filters, selectedMonth, selectedYear, flow.operatorRole]);

  const loadData = () => {
    setLoading(true);
    setTimeout(() => {
      if (!filters.state) {
        setSummary(null);
        setAssets([]);
        setLastRefreshedAt(null);
        setLoading(false);
        return;
      }
      const roleOpts = { operatorRole: flow.operatorRole };
      const assetsData = getAssetsFiltered(filters, roleOpts);
      setSummary(getAssetSummaryFiltered(filters, roleOpts));
      setAssets(assetsData);
      setLastRefreshedAt(new Date());
      setLoading(false);
    }, 280);
  };

  const handleKpiSegment = (segment) => {
    if (isManager && !assessmentLocked && segment !== 'total' && segment !== 'breakdown') {
      setDetailTab('fleet');
      setFleetStatusFilter(null);
      return;
    }
    if (assessmentLocked) {
      setDetailTab('fleet');
      switch (segment) {
        case 'total':
          setFleetStatusFilter(null);
          break;
        case 'working':
          setFleetStatusFilter('Working');
          break;
        case 'failure_predicted':
          setFleetStatusFilter('Failure Predicted');
          break;
        case 'under_maintenance':
          setFleetStatusFilter('Under Maintenance');
          break;
        case 'breakdown':
          setFleetStatusFilter('Breakdown');
          break;
        default:
          break;
      }
      return;
    }
    switch (segment) {
      case 'total':
        setDetailTab('fleet');
        setFleetStatusFilter(null);
        break;
      case 'working':
        setDetailTab('fleet');
        setFleetStatusFilter('Working');
        break;
      case 'failure_predicted':
        navigate('/recommendations');
        break;
      case 'under_maintenance':
        navigate('/maintenance');
        break;
      case 'breakdown':
        navigate('/anomalies');
        break;
      default:
        break;
    }
  };

  if (loading && placeSelected) {
    return <div className="loading">Loading site data…</div>;
  }

  return (
    <div className={`executive-summary ${qcGo ? 'executive-summary--go-path' : ''}`}>
      <DataFeedHint />

      {flow.operatorRole ? (
        <div className="es-role-chip" role="status">
          <span className="es-role-chip-label">Demo lens</span>
          <strong>{operatorRoleTitle(flow.operatorRole)}</strong>
          <span className="es-role-chip-meta">
            {qcGo
              ? 'QC Go · positive snapshot'
              : qcNoGo
                ? hitlPending
                  ? 'No-Go · full analytics first — supervisor release at page end'
                  : 'No-Go · assessment released'
                : ''}
          </span>
        </div>
      ) : null}

      {qcGo ? (
        <div className="es-go-hero card" role="region" aria-label="QC Go">
          <h2 className="es-go-hero-title">QC Go — production line up</h2>
          <p className="es-go-hero-text">
            This is a simplified <strong>all-positive</strong> executive view: KPIs and map reflect a nominal run — every
            asset in scope shows as <strong>working</strong> and risk buckets read zero. Use it as a confidence snapshot
            after a Go classification (not the same deep-dive as No-Go).
          </p>
        </div>
      ) : hitlPending ? (
        <div className="es-nogo-intro card" role="note">
          <strong>No-Go classification.</strong> Review live KPIs, map, feeds, and fleet detail below. When finished,
          scroll to the <strong>end of the page</strong> for supervisor release, then <strong>Enter detailed analysis</strong>{' '}
          to open Anomalies, RCA, Recommendations, and Planned downtime.
        </div>
      ) : null}

      {flow.formClassifyMeta && (noGoPitch || goPitch) ? (
        <ExecutiveExtractedTabs
          imageSrc={extractedImageSrc}
          imageFileName={uploadPreview.fileName || flow.formClassifyMeta?.source_filename || ''}
          classification={flow.outcome}
          formClassifyMeta={flow.formClassifyMeta}
        >
          {qcNoGo && noGoPitch ? (
            <div className="es-nogo-breakdown" role="region" aria-labelledby="nogo-breakdown-heading">
              <h2 id="nogo-breakdown-heading" className="es-nogo-breakdown-title">
                {noGoPitch.title}
              </h2>
              <p className="es-nogo-breakdown-lead">{noGoPitch.lead}</p>
              <div className="es-nogo-extraction" role="region" aria-label={noGoPitch.extractionHeading}>
                <h3 className="es-nogo-subheading">{noGoPitch.extractionHeading}</h3>
                <p className="es-nogo-extraction-text">{noGoPitch.extraction}</p>
              </div>
              <div className="es-nogo-why" role="region" aria-label={noGoPitch.whyHeading}>
                <h3 className="es-nogo-subheading">{noGoPitch.whyHeading}</h3>
                <p className="es-nogo-why-text">{noGoPitch.why}</p>
              </div>
              <h3 className="es-nogo-subheading">Bad KPI scores at decision time</h3>
              <ul className="es-nogo-breakdown-list es-kpi-score-list">
                {noGoBadKpiLines.map((line, i) => (
                  <li key={`nogo-kpi-${i}`}>{line}</li>
                ))}
              </ul>
              <h3 className="es-nogo-subheading">{noGoPitch.stepsHeading}</h3>
              <ul className="es-nogo-breakdown-list">
                {noGoPitch.steps.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {qcGo && goPitch ? (
            <div className="es-go-breakdown" role="region" aria-labelledby="go-breakdown-heading">
              <h2 id="go-breakdown-heading" className="es-go-breakdown-title">
                {goPitch.title}
              </h2>
              <p className="es-go-breakdown-lead">{goPitch.lead}</p>
              <div className="es-go-extraction" role="region" aria-label={goPitch.extractionHeading}>
                <h3 className="es-go-subheading">{goPitch.extractionHeading}</h3>
                <p className="es-go-extraction-text">{goPitch.extraction}</p>
              </div>
              <div className="es-go-why" role="region" aria-label={goPitch.whyHeading}>
                <h3 className="es-go-subheading">{goPitch.whyHeading}</h3>
                <p className="es-go-why-text">{goPitch.why}</p>
              </div>
              <h3 className="es-go-subheading">KPI scores at decision time</h3>
              <ul className="es-go-breakdown-list es-kpi-score-list">
                {decisionKpiLines.map((line, i) => (
                  <li key={`go-kpi-${i}`}>{line}</li>
                ))}
              </ul>
              <h3 className="es-go-subheading">{goPitch.stepsHeading}</h3>
              <ul className="es-go-breakdown-list">
                {goPitch.steps.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </ExecutiveExtractedTabs>
      ) : null}

      {assessmentLocked ? (
        <p className="es-kpi-lock-hint card">
          {qcGo
            ? 'Go path: assessment tabs stay closed — this page is intentionally lightweight.'
            : 'KPI tiles stay on this page — jump-to-tab shortcuts stay off until supervisor release and Enter detailed analysis. Click a segment to filter the fleet register below.'}
        </p>
      ) : null}

      <section className="es-place-section card" aria-labelledby="place-heading">
        <h2 id="place-heading" className="es-place-title">
          Location scope
        </h2>
        <p className="es-place-caption">
          {qcGo
            ? 'Pick a site for your QC Go snapshot — KPIs and map will show an all-positive, line-up scenario for that scope.'
            : 'Select a state or region first. Optional: narrow to one plant. All sections below use this scope.'}
        </p>
        <div className="state-filters es-state-row" role="group" aria-label="Location">
          {SITE_LOCATIONS.map((state) => (
            <button
              key={state}
              type="button"
              className={`state-button ${filters.state === state ? 'active' : ''}`}
              onClick={() => {
                if (onFiltersChange) {
                  onFiltersChange({
                    ...filters,
                    state: filters.state === state ? null : state,
                    plant: null,
                  });
                }
              }}
            >
              {state}
            </button>
          ))}
        </div>
        {filters.state ? (
          <div className="plant-filters" role="group" aria-label="Plant">
            <button
              type="button"
              className={`plant-chip ${!filters.plant ? 'active' : ''}`}
              onClick={() => onFiltersChange && onFiltersChange({ ...filters, plant: null })}
            >
              All plants
            </button>
            {plantOptions.map((plant) => (
              <button
                key={plant}
                type="button"
                className={`plant-chip ${filters.plant === plant ? 'active' : ''}`}
                onClick={() =>
                  onFiltersChange &&
                  onFiltersChange({
                    ...filters,
                    plant: filters.plant === plant ? null : plant,
                  })
                }
              >
                {plant}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {!placeSelected ? (
        <div className="es-prompt card">
          <p>
            {qcGo
              ? 'Choose a location above to load your positive QC Go snapshot — nominal KPI strip and green fleet map.'
              : 'Choose a location above to load the site KPI strip, fleet map, integrated feeds, and exception chart for that territory.'}
          </p>
        </div>
      ) : (
        <>
          <ExecutiveKeyMetrics
            filters={filters}
            operatorRole={flow.operatorRole}
            qcGo={qcGo}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            excelBundle={excelBundle}
          />

          {qcGo ? (
            <div className="es-go-signals card" aria-label="Nominal signal strip">
              <h3 className="es-go-signals-title">Line health · Go path</h3>
              <div className="es-go-signals-row">
                <div className="es-go-signal es-go-signal--ok">
                  <span className="es-go-signal-label">MES / execution</span>
                  <span className="es-go-signal-value">On plan</span>
                </div>
                <div className="es-go-signal es-go-signal--ok">
                  <span className="es-go-signal-label">Labor & coverage</span>
                  <span className="es-go-signal-value">Staffed</span>
                </div>
                <div className="es-go-signal es-go-signal--ok">
                  <span className="es-go-signal-label">Loss / yield</span>
                  <span className="es-go-signal-value">Within target</span>
                </div>
              </div>
            </div>
          ) : isManager ? (
            <div className="es-manager-strip card" role="region" aria-label="Supervisor scope">
              <h3 className="es-manager-strip-title">Supervisor executive lens</h3>
              <p className="es-manager-strip-text">
                This view centers on <strong>lines where production has stopped</strong> (Breakdown in the demo’s
                processing and packaging stories), so regional steering stays aligned with the most urgent site posture.
                It mirrors the framing you use on Executive summary for the territory you select.
              </p>
            </div>
          ) : (
            <div className="database-indicators-row">
              <DatabaseIndicator
                source="Workforce & labor actuals"
                status="active"
                subtitle={feeds.workforce.subtitle}
                dataPreview={{
                  records: feeds.workforce.records,
                  lastSync: feeds.workforce.lastSync,
                  data: feeds.workforce.data,
                }}
              />
              <DatabaseIndicator
                source="MES / line execution"
                status="active"
                subtitle={feeds.mes.subtitle}
                dataPreview={{
                  records: feeds.mes.records,
                  lastSync: feeds.mes.lastSync,
                  data: feeds.mes.data,
                }}
              />
              <DatabaseIndicator
                source="Loss & yield accounting"
                status="active"
                subtitle={feeds.loss.subtitle}
                dataPreview={{
                  records: feeds.loss.records,
                  lastSync: feeds.loss.lastSync,
                  data: feeds.loss.data,
                }}
              />
            </div>
          )}

          <p className="es-kpi-hint">
            {qcGo
              ? 'All counts below are intentionally positive for this Go snapshot — production line read as up and in control.'
              : isManager
                ? 'Supervisor KPI strip summarizes stopped-line posture for this site. Use detailed analysis when you want the full five-tab workspace.'
                : assessmentLocked
                  ? 'KPI tiles filter the fleet register on this page while the assessment workspace is gated.'
                  : 'KPI tiles are interactive — fleet totals open the register; risk states jump to the right workspace.'}
          </p>
          <div className={`es-kpi-strip es-kpi-strip--live ${qcGo ? 'es-kpi-strip--go' : ''}`}>
            <AssetStatusSummary
              summary={displaySummary}
              layout="horizontal"
              interactive={!qcGo && !isManager}
              supervisorStrip={isManager && !qcGo}
              onSegmentClick={handleKpiSegment}
            />
          </div>

          <section className="es-map-stage" aria-labelledby="es-map-heading">
            <div className="es-map-stage-header">
              <h2 id="es-map-heading" className="es-map-stage-title">
                {qcGo
                  ? 'Fleet map · nominal operations (QC Go)'
                  : isManager
                    ? 'Fleet map · production stoppages'
                    : 'Fleet map · live asset posture'}
              </h2>
              <p className="es-map-stage-caption">
                {filters.plant ? `${filters.plant} · ` : ''}
                {filters.state}
                {qcGo ? ' · all assets shown as working for this positive scenario' : ''}
              </p>
            </div>
            <div className="es-map-frame">
              <MapView
                assets={qcGo ? goMapAssets : assets}
                selectedState={filters.state}
                summary={displaySummary}
              />
            </div>
          </section>

          {!qcGo && isManager ? (
            <section className="es-manager-breakdown card" aria-labelledby="es-manager-bd-heading">
              <h2 id="es-manager-bd-heading" className="es-manager-bd-title">
                Production lines stopped
              </h2>
              <p className="es-manager-bd-lead">
                Register below lists assets in <strong>Breakdown</strong> for the selected territory—useful for
                leadership triage and handoff without expanding into full CMMS detail on this screen.
              </p>
              {assets.length === 0 ? (
                <p className="es-manager-bd-empty">No stopped lines in this site selection for the demo scenario.</p>
              ) : (
                <table className="es-manager-bd-table">
                  <thead>
                    <tr>
                      <th>Line / asset</th>
                      <th>Plant</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr key={a.asset_id}>
                        <td>{a.asset_id}</td>
                        <td>{a.plant}</td>
                        <td>{a.asset_type}</td>
                        <td>{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : !qcGo ? (
            <>
              <h2 className="es-integrated-section-title">Integrated landing narrative</h2>
              <ExecutiveLandingStreams />

              <ExecutiveDetailTabs
                assets={assets}
                summary={summary}
                filters={filters}
                onFiltersChange={onFiltersChange}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                activeTab={detailTab}
                onTabChange={setDetailTab}
                fleetStatusFilter={fleetStatusFilter}
                onFleetStatusFilterChange={setFleetStatusFilter}
                lastRefreshedAt={lastRefreshedAt}
              />
            </>
          ) : (
            <div className="es-go-closing card">
              <h3 className="es-go-closing-title">All clear</h3>
              <p className="es-go-closing-text">
                No open exception workflow on the Go path — use the map and KPI strip as a quick positive confirmation,
                then return to upload when ready.
              </p>
            </div>
          )}
        </>
      )}

      {hitlPending && placeSelected ? (
        <div className="es-ops-footnote card" role="note">
          <strong>Operations note:</strong> crews are clearing the packaging / processing exception —{' '}
          <strong>production line return is targeted within the next few minutes</strong> pending coordination. Supervisor
          acknowledgment is <strong>below</strong> to release the full assessment workspace.
        </div>
      ) : null}

      {hitlPending && placeSelected ? (
        <div className="es-flow-banner es-flow-banner--hitl card" role="region" aria-label="Supervisor review">
          <h2 className="es-flow-banner-title">Human in the loop — supervisor release</h2>
          <p className="es-flow-banner-text">
            After reviewing the analytics above, a supervisor acknowledges the No-Go exception here. You will still
            need <strong>Enter detailed analysis</strong> (below, after release) to open the five-tab header navigation
            (Anomalies → RCA → Recommendations → Planned downtime).
          </p>
          <div className="es-hitl-actions">
            <button
              type="button"
              className="es-flow-btn es-flow-btn--primary"
              onClick={() => setFlow((prev) => ({ ...prev, hitlApproved: true }))}
            >
              Supervisor: approve &amp; release assessment tabs
            </button>
          </div>
        </div>
      ) : null}

      {placeSelected && flow.outcome === 'no_go' ? (
        <div className="es-inline-actions card" role="region" aria-label="Recommendations">
          <button type="button" className="es-flow-btn" onClick={() => setRecModalOpen(true)}>
            View recommendations
          </button>
        </div>
      ) : null}

      {placeSelected && flow.outcome === 'no_go' && flow.hitlApproved && !flow.detailedAnalysisUnlocked ? (
        <div className="es-flow-banner es-flow-banner--detailed card" role="region" aria-label="Detailed analysis">
          <h2 className="es-flow-banner-title">Detailed analysis workspace</h2>
          <p className="es-flow-banner-text">
            Recommendations are available in the popup and via <strong>View recommendations</strong>. When you are
            ready for the full assessment route, open the five tabs in the header.
          </p>
          <div className="es-hitl-actions">
            <button
              type="button"
              className="es-flow-btn es-flow-btn--primary"
              onClick={() => setFlow((prev) => ({ ...prev, detailedAnalysisUnlocked: true }))}
            >
              Enter detailed analysis
            </button>
          </div>
        </div>
      ) : null}

      {placeSelected && flow.outcome === 'no_go' && flow.detailedAnalysisUnlocked ? (
        <p className="es-detailed-unlocked card" role="status">
          Detailed analysis is <strong>on</strong> — use the assessment tabs in the header to move across all five views.
        </p>
      ) : null}

      {qcGo ? (
        <div className="es-go-footer card">
          <p className="es-go-footer-text">Finished with this Go check?</p>
          <button
            type="button"
            className="es-flow-btn es-flow-btn--primary"
            onClick={() => {
              clearUploadPreview();
              setFlow((prev) => ({
                ...prev,
                outcome: null,
                hitlApproved: false,
                detailedAnalysisUnlocked: false,
                formClassifyMeta: null,
              }));
              navigate('/upload');
            }}
          >
            Back to upload another form
          </button>
        </div>
      ) : null}

      <ExecutiveRecommendationsModal
        open={recModalOpen}
        onClose={() => setRecModalOpen(false)}
        filters={filters}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        operatorRole={flow.operatorRole}
        userEmail={flow.userEmail}
      />

    </div>
  );
};

export default ExecutiveSummary;
