/**
 * Map Excel sheet names → app section. First matching route in ROUTE_ORDER wins.
 * Tuned for: landing (employees / process / waste), anomalies (line stops, KPI triggers),
 * RCA (reasons / flow), recommendations (actions), maintenance (downtime).
 */
export const ROUTE_ORDER = [
  'maintenance',
  'recommendations',
  'root-cause',
  'anomalies',
  'executive-summary',
];

const PATTERNS = {
  maintenance: [
    /down\s*time|downtime|down\s*times|idle\s*time|outage|uptime\s*loss/i,
    /maint|schedule|work\s*order|\bwo\b|\bpm\b|calendar|repair/i,
  ],
  recommendations: [
    /^\s*actions?\s*$/i,
    /recommend|action\b|priorit|remediat|corrective|task\s*list|playbook/i,
  ],
  'root-cause': [
    /root\s*cause|rca|\bwhy\b|reason|fault\s*tree|pareto|5\s*whys/i,
    /graphic|flow\s*chart|flowchart|step\s*flow|fishbone|ishikawa|behind/i,
  ],
  anomalies: [
    /production\s*line|line\s*stop|line\s*stops|\bstops?\b|stoppage|stopped|stop\s*trigger/i,
    /kpi.*(stop|trigger|stopp)|(stop|trigger).*kpi|triggered|alarm/i,
    /sensor|anomal|vibrat|temp|condition|monitor|telemetry|iot/i,
  ],
  'executive-summary': [
    /employee|staffing|headcount|people|process\s*step|procedure|waste|scrap/i,
    /landing|summary|executive|kpi|asset|plant|overview|dashboard|status|map|fleet|geo/i,
  ],
};

export function routeKeyForSheet(sheetName) {
  const name = String(sheetName || '');
  for (const route of ROUTE_ORDER) {
    const list = PATTERNS[route] || [];
    if (list.some((re) => re.test(name))) return route;
  }
  return 'executive-summary';
}

export function pathnameToRouteKey(pathname) {
  const p = (pathname || '/').replace(/^\//, '') || 'executive-summary';
  if (ROUTE_ORDER.includes(p)) return p;
  if (p === 'upload') return p;
  return 'executive-summary';
}

export function sheetsForRoute(sheetNames, routeKey) {
  if (!sheetNames || !sheetNames.length) return [];
  return sheetNames.filter((n) => routeKeyForSheet(n) === routeKey);
}
