import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login/Login';
import DashboardStepNav from './components/Layout/DashboardStepNav';
import Header from './components/Layout/Header';
import GlobalChatAssistant from './components/Layout/GlobalChatAssistant';
import { ChatRouteSync, ChatUiSync } from './components/Layout/ChatAssistantSync';
import { ChatAssistantProvider, useChatAssistant } from './context/ChatAssistantContext';
import ExecutiveSummary from './components/ExecutiveSummary/ExecutiveSummary';
import Anomalies from './components/Anomalies/Anomalies';
import RootCauseAnalysis from './components/RootCauseAnalysis/RootCauseAnalysis';
import Recommendations from './components/Recommendations/Recommendations';
import MaintenanceSchedule from './components/MaintenanceSchedule/MaintenanceSchedule';
import FormUpload from './components/FormUpload/FormUpload';
import { AppFlowProvider, useAppFlow } from './context/AppFlowContext';
import './App.css';

function HomeRedirect() {
  const { flow } = useAppFlow();
  if (!flow.outcome) return <Navigate to="/upload" replace />;
  return <Navigate to="/executive-summary" replace />;
}

/**
 * Go: upload + executive summary only (no five-tab workspace).
 * No-Go: executive summary until supervisor HITL + Enter detailed analysis, then all tabs.
 */
function RequireAssessmentAccess({ children }) {
  const { flow } = useAppFlow();
  const location = useLocation();
  const path = location.pathname;

  if (!flow.outcome && path !== '/upload') {
    return <Navigate to="/upload" replace />;
  }

  if (flow.outcome === 'go' && path !== '/executive-summary' && path !== '/upload') {
    return <Navigate to="/executive-summary" replace />;
  }

  if (flow.outcome === 'no_go') {
    const unlocked = flow.hitlApproved && flow.detailedAnalysisUnlocked;
    if (!unlocked && path !== '/executive-summary' && path !== '/upload') {
      return <Navigate to="/executive-summary" replace />;
    }
  }

  return children;
}

function AuthenticatedShell({ user, onLogout }) {
  const { showNavBar, flow } = useAppFlow();
  const [selectedMonth, setSelectedMonth] = useState('Feb');
  const [selectedYear, setSelectedYear] = useState(2023);
  const [filters, setFilters] = useState({
    state: null,
    plant: null,
    asset_id: null,
  });

  const backgroundImageUrl = `${process.env.PUBLIC_URL}/login-background.png`;
  const appBgStyle = { position: 'relative' };
  const bgOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `url(${backgroundImageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
    opacity: 0.12,
    pointerEvents: 'none',
    zIndex: 0,
  };

  return (
    <Router>
      <ChatRouteSync />
      <ChatUiSync
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        filters={filters}
        operatorRole={flow.operatorRole}
        qcOutcome={flow.outcome}
        hitlApproved={flow.hitlApproved}
        accountRole={flow.accountRole}
        detailedAnalysisUnlocked={flow.detailedAnalysisUnlocked}
      />
      <div className="App" style={appBgStyle}>
        <div style={bgOverlayStyle} />
        <Header
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onMonthChange={setSelectedMonth}
          onYearChange={setSelectedYear}
          filters={filters}
          onFiltersChange={setFilters}
          user={user}
          onLogout={onLogout}
        />
        {showNavBar ? <DashboardStepNav /> : null}
        <div className={`main-content ${showNavBar ? 'main-content--step-nav' : ''}`}>
          <Routes>
            <Route path="/upload" element={<FormUpload />} />
            <Route path="/" element={<HomeRedirect />} />
            <Route
              path="/executive-summary"
              element={
                <RequireAssessmentAccess>
                  <ExecutiveSummary
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    filters={filters}
                    onFiltersChange={setFilters}
                  />
                </RequireAssessmentAccess>
              }
            />
            <Route
              path="/anomalies"
              element={
                <RequireAssessmentAccess>
                  <Anomalies
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    filters={filters}
                    onFiltersChange={setFilters}
                  />
                </RequireAssessmentAccess>
              }
            />
            <Route
              path="/root-cause"
              element={
                <RequireAssessmentAccess>
                  <RootCauseAnalysis
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    filters={filters}
                    onFiltersChange={setFilters}
                  />
                </RequireAssessmentAccess>
              }
            />
            <Route
              path="/recommendations"
              element={
                <RequireAssessmentAccess>
                  <Recommendations
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    filters={filters}
                    onFiltersChange={setFilters}
                  />
                </RequireAssessmentAccess>
              }
            />
            <Route
              path="/maintenance"
              element={
                <RequireAssessmentAccess>
                  <MaintenanceSchedule
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    filters={filters}
                    onFiltersChange={setFilters}
                  />
                </RequireAssessmentAccess>
              }
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

function AppInner() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const { clearFlow, setFlow } = useAppFlow();
  const { setRoutePath, setPageTitle, setUiContext } = useChatAssistant();

  useEffect(() => {
    if (!isAuthenticated) {
      setRoutePath('/login');
      setPageTitle('Sign in');
      setUiContext(null);
    }
  }, [isAuthenticated, setRoutePath, setPageTitle, setUiContext]);

  const handleLogin = (userData) => {
    setFlow({
      outcome: null,
      operatorRole: userData.operatorRole || null,
      hitlApproved: false,
      detailedAnalysisUnlocked: false,
      accountRole: userData.accountRole || null,
      userEmail: userData.email || null,
      formClassifyMeta: null,
    });
    setUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    clearFlow();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <>
      {!isAuthenticated ? <Login onLogin={handleLogin} /> : <AuthenticatedShell user={user} onLogout={handleLogout} />}
      <GlobalChatAssistant />
    </>
  );
}

export default function App() {
  return (
    <AppFlowProvider>
      <ChatAssistantProvider>
        <AppInner />
      </ChatAssistantProvider>
    </AppFlowProvider>
  );
}
