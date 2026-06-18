import axios from 'axios';

/**
 * Empty string = use relative URLs (Create React App dev proxy → package.json "proxy", default 127.0.0.1:9898).
 * Set REACT_APP_API_URL for production or when not using the proxy.
 */
export const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

/** Human-readable hint for errors / UI */
export const API_DISPLAY_URL = API_BASE_URL || '(dev proxy → http://127.0.0.1:9898)';

/** Parse FastAPI / JSON error bodies into a multi-line message for the UI. */
export function formatApiErrorBodyText(bodyText) {
  if (!bodyText || !String(bodyText).trim()) return '';
  const t = String(bodyText).trim();
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j.detail)) {
      return j.detail
        .map((d) => {
          if (typeof d === 'string') return d;
          if (d?.msg) {
            const loc = Array.isArray(d.loc) ? d.loc.filter(Boolean).join('.') : '';
            return loc ? `${loc}: ${d.msg}` : d.msg;
          }
          return JSON.stringify(d);
        })
        .join('\n');
    }
    if (typeof j.detail === 'string') return j.detail;
    if (j.message) return String(j.message);
  } catch {
    return t;
  }
  return t;
}

export const api = axios.create({
  baseURL: API_BASE_URL || undefined,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
      error.message = `Cannot connect to backend (${API_DISPLAY_URL}). Start: cd backend && .\\venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 9898`;
    }
    console.error('API Response Error:', error);
    return Promise.reject(error);
  }
);

export const getAssets = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.plant) params.append('plant', filters.plant);
  if (filters.asset_id) params.append('asset_id', filters.asset_id);

  const response = await api.get(`/api/assets?${params.toString()}`);
  return response.data;
};

export const getAssetSummary = async () => {
  const response = await api.get('/api/assets/summary');
  return response.data;
};

export const getAnomalies = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.plant) params.append('plant', filters.plant);
  if (filters.asset_id) params.append('asset_id', filters.asset_id);

  const response = await api.get(`/api/anomalies?${params.toString()}`);
  return response.data;
};

/** Agent-style fused narrative for the anomalies page (same filters as telemetry). */
export const getAnomalyAgentBriefing = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.plant) params.append('plant', filters.plant);
  if (filters.asset_id) params.append('asset_id', filters.asset_id);
  const response = await api.get(`/api/anomalies/agent-briefing?${params.toString()}`);
  return response.data;
};

export const getRootCauseAnalysis = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.plant) params.append('plant', filters.plant);
  if (filters.asset_id) params.append('asset_id', filters.asset_id);
  if (filters.rul_threshold) params.append('rul_threshold', filters.rul_threshold);

  const response = await api.get(`/api/root-cause?${params.toString()}`);
  return response.data;
};

export const getRecommendations = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.plant) params.append('plant', filters.plant);
  if (filters.asset_id) params.append('asset_id', filters.asset_id);
  if (filters.year) params.append('year', filters.year);
  if (filters.month) params.append('month', filters.month);

  const response = await api.get(`/api/recommendations?${params.toString()}`);
  return response.data;
};

export const getMaintenanceSchedule = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.state) params.append('state', filters.state);
  if (filters.plant) params.append('plant', filters.plant);
  if (filters.asset_id) params.append('asset_id', filters.asset_id);

  const response = await api.get(`/api/maintenance?${params.toString()}`);
  return response.data;
};

/**
 * Send a scheduled work-order notification email via backend (Microsoft Graph / MSAL).
 * @param {object} payload — work order fields; optional to_email overrides server default
 */
export const notifyMaintenanceWorkOrder = async (payload) => {
  const response = await api.post('/api/maintenance/notify-work-order', payload);
  return response.data;
};

export const getAIRecommendations = async (requestData) => {
  const response = await api.post('/api/ai/recommendations', requestData);
  return response.data;
};

export const getAIAnalysis = async (requestData) => {
  const response = await api.post('/api/ai/analysis', requestData);
  return response.data;
};

/** Global page assistant (longer timeout for large context + answers). */
export const postAssistantChat = async (body) => {
  const response = await api.post('/api/ai/assistant', body, { timeout: 120000 });
  return response.data;
};

/** Bundled operational pipeline sheets (backend integration service). */
export const getSuperExcel = async () => {
  const response = await api.get('/api/super-excel');
  return response.data;
};

/**
 * Upload QC form; classification uses filename (demo samples), optional client_hint, optional Azure OCR.
 * @param {File} file
 * @param {string} [clientHint] 'go' | 'no_go'
 */
export const classifyForm = async (file, clientHint) => {
  const formData = new FormData();
  formData.append('file', file);
  if (clientHint) formData.append('client_hint', clientHint);
  const url = API_BASE_URL ? `${API_BASE_URL}/api/forms/classify` : '/api/forms/classify';
  const controller = new AbortController();
  const timeoutMs = 120000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(
        `Classify request exceeded ${timeoutMs / 1000}s. Common causes: (1) FastAPI not running on 127.0.0.1:9898 — start it and keep "npm start" so the dev proxy forwards /api; (2) Azure Document Intelligence OCR enabled on the backend and the service is slow or unreachable (set AZURE_DOC_INTELLIGENCE_USE_OCR=false in backend/.env for instant filename-only demo).`
      );
    }
    throw new Error(
      `Cannot reach API (${API_DISPLAY_URL}). Start backend on 9898 and restart npm start so the dev proxy applies — ${e.message || e}`
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const t = await res.text();
    const detail = formatApiErrorBodyText(t) || `Classify failed (${res.status})`;
    throw new Error(detail);
  }
  return res.json();
};
