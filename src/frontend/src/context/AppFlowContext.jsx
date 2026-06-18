import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { getSuperExcel } from '../services/api';
import { normalizeOperatorRole } from '../utils/operatorRole';

const STORAGE_KEY = 'pepsico_flow';
const EXCEL_CACHE_KEY = 'pepsico_excel_cache';

function defaultFlow() {
  return {
    outcome: null,
    operatorRole: null,
    hitlApproved: false,
    detailedAnalysisUnlocked: false,
    accountRole: null,
    userEmail: null,
    formClassifyMeta: null,
  };
}

function readFlow() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultFlow();
    const o = JSON.parse(raw);
    const outcome = o.outcome ?? null;
    const operatorRole = normalizeOperatorRole(o.operatorRole);
    let hitlApproved = !!o.hitlApproved;
    if (outcome === 'no_go' && o.fullDashboard === true && o.hitlApproved === undefined) {
      hitlApproved = true;
    }
    const detailedAnalysisUnlocked = !!o.detailedAnalysisUnlocked;
    const accountRole = o.accountRole ?? null;
    const userEmail = o.userEmail ?? null;
    const formClassifyMeta = o.formClassifyMeta ?? null;
    return {
      outcome,
      operatorRole,
      hitlApproved,
      detailedAnalysisUnlocked,
      accountRole,
      userEmail,
      formClassifyMeta,
    };
  } catch {
    return defaultFlow();
  }
}

function writeFlow(flow) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
}

const AppFlowContext = createContext(null);

function revokePreview(prev) {
  if (prev?.objectUrl) {
    try {
      URL.revokeObjectURL(prev.objectUrl);
    } catch {
      /* ignore */
    }
  }
}

export function AppFlowProvider({ children }) {
  const [flow, setFlowState] = useState(readFlow);
  const [excelBundle, setExcelBundle] = useState(null);
  const [excelError, setExcelError] = useState(null);
  const [excelLoading, setExcelLoading] = useState(false);
  /** In-memory preview of last uploaded QC form (blob URL). Cleared on logout / clearFlow. */
  const [uploadPreview, setUploadPreviewState] = useState({ objectUrl: null, fileName: null });

  const setUploadPreview = useCallback((file) => {
    setUploadPreviewState((prev) => {
      revokePreview(prev);
      if (!file) return { objectUrl: null, fileName: null };
      const objectUrl = URL.createObjectURL(file);
      return { objectUrl, fileName: file.name || 'upload' };
    });
  }, []);

  const clearUploadPreview = useCallback(() => {
    setUploadPreviewState((prev) => {
      revokePreview(prev);
      return { objectUrl: null, fileName: null };
    });
  }, []);

  const setFlow = useCallback((next) => {
    setFlowState((prev) => {
      const merged = typeof next === 'function' ? next(prev) : { ...prev, ...next };
      writeFlow(merged);
      return merged;
    });
  }, []);

  const clearFlow = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(EXCEL_CACHE_KEY);
    setFlowState(defaultFlow());
    clearUploadPreview();
  }, [clearUploadPreview]);

  const loadExcel = useCallback(async (force = false) => {
    if (!force) {
      try {
        const cached = sessionStorage.getItem(EXCEL_CACHE_KEY);
        if (cached) {
          setExcelBundle(JSON.parse(cached));
          return;
        }
      } catch {
        /* ignore */
      }
    }
    setExcelLoading(true);
    setExcelError(null);
    try {
      const data = await getSuperExcel();
      setExcelBundle(data);
      sessionStorage.setItem(EXCEL_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      setExcelError(e.message || 'Failed to load operational data bundle');
      setExcelBundle(null);
    } finally {
      setExcelLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExcel(false);
  }, [loadExcel]);

  /** Full 5-tab bar only on No-Go after HITL + Enter detailed analysis (Go stays executive-only). */
  const showNavBar = flow.outcome === 'no_go' && flow.hitlApproved && !!flow.detailedAnalysisUnlocked;

  const value = useMemo(
    () => ({
      flow,
      setFlow,
      clearFlow,
      excelBundle,
      excelError,
      excelLoading,
      loadExcel,
      showNavBar,
      uploadPreview,
      setUploadPreview,
      clearUploadPreview,
    }),
    [
      flow,
      setFlow,
      clearFlow,
      excelBundle,
      excelError,
      excelLoading,
      loadExcel,
      showNavBar,
      uploadPreview,
      setUploadPreview,
      clearUploadPreview,
    ]
  );

  return <AppFlowContext.Provider value={value}>{children}</AppFlowContext.Provider>;
}

export function useAppFlow() {
  const ctx = useContext(AppFlowContext);
  if (!ctx) throw new Error('useAppFlow must be used within AppFlowProvider');
  return ctx;
}
