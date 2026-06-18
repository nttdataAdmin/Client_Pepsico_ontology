import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getMaintenanceSchedule } from '../../data/mockData';
import MaintenanceEventCards from './MaintenanceEventCards';
import SelectPlaceGate from '../Layout/SelectPlaceGate';
import { DataFeedHint, DowntimeSignalsPanel } from '../Agentic/IntegratedDataPanels';
import { usePageChatKnowledge } from '../../context/ChatAssistantContext';
import { useAppFlow } from '../../context/AppFlowContext';
import ManagerScopeBanner from '../Layout/ManagerScopeBanner';
import { operatorRoleShort } from '../../utils/operatorRole';
import './MaintenanceSchedule.css';

const MaintenanceSchedule = ({ selectedMonth, selectedYear, filters, onFiltersChange }) => {
  const { flow } = useAppFlow();
  const isManager = flow.accountRole === 'manager';
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSchedule();
  }, [selectedMonth, selectedYear, filters, flow.operatorRole, flow.accountRole]);

  const loadSchedule = () => {
    setLoading(true);
    setTimeout(() => {
      const monthMap = {
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
      const monthName = monthMap[selectedMonth] || selectedMonth;
      const filterParams = {
        year: selectedYear,
        ...filters,
      };
      if (monthName && monthName !== selectedMonth) {
        filterParams.month = monthName;
      }
      const data = getMaintenanceSchedule(filterParams, { operatorRole: flow.operatorRole });
      setSchedule(data);
      setLoading(false);
    }, 300);
  };

  const maintChatKnowledge = useMemo(() => {
    if (!filters.state) {
      return 'Maintenance schedule: no state selected; user must pick a site for planned downtime.';
    }
    return JSON.stringify(
      {
        view: 'maintenance',
        filters,
        period: { month: selectedMonth, year: selectedYear },
        loading,
        scheduledWorkOrderCount: schedule.length,
        scheduleSample: schedule.slice(0, 20),
        operatorRole: flow.operatorRole,
        accountRole: flow.accountRole,
        managerBreakdownScope: isManager,
      },
      null,
      2
    );
  }, [filters, selectedMonth, selectedYear, loading, schedule, flow.operatorRole, flow.accountRole, isManager]);

  usePageChatKnowledge(maintChatKnowledge);

  if (!filters.state) {
    return (
      <div className="maintenance-schedule-page">
        <h2 className="page-title">Planned Downtime</h2>
        <SelectPlaceGate
          filters={filters}
          onFiltersChange={onFiltersChange}
          title="Select a location for planned downtime"
          hint="Downtime narratives and work orders are scoped to the selected site. Pick Beloit or Jonesboro to load this step."
        />
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="maintenance-schedule-page">
      <h2 className="page-title">Planned Downtime</h2>
      {isManager ? <ManagerScopeBanner /> : null}
      <p className="agentic-section-intro">
        {isManager ? (
          <>
            <strong>{operatorRoleShort(flow.operatorRole)}</strong> — scheduled work reflects the same site and
            leadership framing as Executive summary, with emphasis on work linked to <strong>production stoppages</strong>.
          </>
        ) : (
          <>
            <strong>{operatorRoleShort(flow.operatorRole)}</strong> — maintenance windows are interpreted through your line:
            processing focuses on fryer/slicer PM chains; packaging prioritizes palletizer and case-line mechanicals. Planned
            downtime and OEE-impacting events are summarized first, then work orders.
          </>
        )}
      </p>

      {!isManager ? <DataFeedHint /> : null}
      {!isManager ? (
        <>
          <h3 className="maint-section-label">Downtime & loss narrative</h3>
          <DowntimeSignalsPanel schedule={schedule} />
        </>
      ) : null}

      <h3 className="maint-section-label">Scheduled work orders</h3>
      <MaintenanceEventCards schedule={schedule} />

      <section className="maintenance-story-close" aria-labelledby="maintenance-story-close-title">
        <h3 id="maintenance-story-close-title">End</h3>
        <p>
          You have walked the narrative from executive context through anomalies, root cause, actions, and planned
          downtime for the selected site. Use executive summary to compare another region, or start a fresh package
          quality cycle when new field data arrives.
        </p>
        <div className="maintenance-story-close-actions">
          <Link to="/executive-summary" className="maintenance-story-close-link">
            Back to executive summary
          </Link>
          <Link to="/upload" className="maintenance-story-close-link maintenance-story-close-link--secondary">
            Upload new form
          </Link>
        </div>
      </section>
    </div>
  );
};

export default MaintenanceSchedule;
