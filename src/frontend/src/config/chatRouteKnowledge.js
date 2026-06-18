/**
 * Static knowledge per route for the global assistant (merged with live page context).
 */
export const CHAT_ROUTE_KNOWLEDGE = {
  '/login': `Login screen for the PepsiCo Management System demo. Users sign in to access the dashboard workflow (executive summary, anomalies, root cause, recommendations, maintenance). After login, users may upload a QC form on the Upload step to unlock the full dashboard or stay on a guided flow.`,

  '/': `Home route redirects based on app flow state (upload vs full dashboard).`,

  '/upload': `Form upload (QC / classification). Users upload files; the backend can classify as GO or NO_GO using filename heuristics and optional Azure Document Intelligence OCR. Outcome drives whether the full multi-step dashboard is available. Explain upload tips, supported behavior, and that the backend must be running for live classification.`,

  '/executive-summary': `You are helping users on the Executive summary step of the PepsiCo Management System demo.

Application flow: After login, users may upload a QC form (Upload). With full dashboard access, the step nav runs: Executive summary → Anomalies (production signals / telemetry) → Root cause analysis → Recommendations → Maintenance schedule. Header filters: state, plant, optional asset; month/year affect time-scoped views on some steps.

This screen shows: fleet KPI cards (total, working, failure predicted, under maintenance, breakdown), a map of sites, and detail tabs (fleet snapshot, etc.). Users should select a state (and usually plant) to see populated KPIs; the UI may use embedded demo data while the assistant also receives matching backend JSON/CSV-backed facts.

Answer questions about: how to use the app, what KPIs mean, how filters scope data, how to navigate to anomalies/RCA/recommendations/maintenance, and factual counts or asset lists using the knowledge base and backend snapshot (prefer snapshot for numbers).`,

  '/anomalies': `Anomalies: vibration and temperature telemetry charts, model toggles (historian, vibration, thermal), agent briefing panel when API is available. Filters match state/plant/asset. Data may be mock or live from /api/anomalies. Explain how to read charts, filters, and the agent briefing.`,

  '/root-cause': `Root cause analysis: probabilistic causes, flow visualization, and AI-derived insights for filtered assets. Uses RUL thresholds and corroboration-style presentation. Help users interpret cause rankings and next steps.`,

  '/recommendations': `Recommendations: prioritized actions and maintenance recommendations for the fleet or filtered assets, often month/year aware. May include AI-generated cards via backend when configured.`,

  '/maintenance': `Maintenance schedule: planned work orders and events; users can send notifications when Graph/email is configured. Explain table columns and scheduling concepts.`,

  default: `PepsiCo Management System demo: asset health, anomalies, root cause, recommendations, and maintenance scheduling. Use the top navigation to move between steps after a place (state/plant) is selected where required. The API runs on port 9898 in development; the UI may proxy /api to the backend.`,
};

export function getChatKnowledgeForRoute(pathname) {
  if (!pathname) return CHAT_ROUTE_KNOWLEDGE.default;
  const key = String(pathname).trim().replace(/\/+$/, '') || '/';
  const exact = CHAT_ROUTE_KNOWLEDGE[key];
  if (exact) return exact;
  return CHAT_ROUTE_KNOWLEDGE.default;
}
