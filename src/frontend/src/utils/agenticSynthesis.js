/**
 * Transforms routed operational datasets into narrative-friendly structures for the UI.
 * Sheet routing uses excelSheetRoutes (internal); user-facing copy never references files or spreadsheets.
 */

import {
  appendWorkcenterrolesToDowntimeContextLine,
  formatCmmsMaintenanceRecordLine,
  WORKCENTER_ROLES_MASTER,
} from '../data/mockData';
import { sheetsForRoute } from './excelSheetRoutes';

export function normKey(k) {
  return String(k || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/_/g, ' ');
}

export function normalizeSheet(sheet) {
  const rows = sheet?.rows || [];
  const rawCols = sheet?.columns?.length ? sheet.columns : Object.keys(rows[0] || {});
  const cols = rawCols.map(normKey);
  const normRows = rows.map((r) => {
    const o = {};
    rawCols.forEach((raw, i) => {
      o[cols[i]] = r[raw];
    });
    return o;
  });
  return { columns: cols, rows: normRows };
}

export function getNormalizedStreams(bundle, routeKey) {
  if (!bundle?.sheets) return [];
  const names = Object.keys(bundle.sheets);
  const matched = sheetsForRoute(names, routeKey);
  return matched.map((name) => {
    const { columns, rows } = normalizeSheet(bundle.sheets[name]);
    return { name, columns, rows };
  });
}

function firstMatching(row, keyPatterns) {
  for (const key of Object.keys(row)) {
    for (const re of keyPatterns) {
      if (re.test(key)) {
        const v = row[key];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  return null;
}

function rowSummary(row, columns, max = 6) {
  const parts = [];
  for (const c of columns) {
    const v = row[c];
    if (v != null && String(v).trim() !== '') {
      parts.push(`${titleCasePhrase(c)}: ${String(v).trim()}`);
      if (parts.length >= max) break;
    }
  }
  return parts.join(' · ');
}

function titleCasePhrase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize header for fuzzy match (employeeid, employee id, Employee ID → same). */
function headerNorm(k) {
  return String(k || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Get value from a display row using possible header aliases (exact normalized match only). */
function pickCell(row, ...aliases) {
  if (!row || typeof row !== 'object') return null;
  const wanted = new Set(aliases.map((a) => headerNorm(a)));
  for (const [key, val] of Object.entries(row)) {
    const hn = headerNorm(key);
    if (wanted.has(hn)) {
      const s = val != null ? String(val).trim() : '';
      if (s !== '') return s;
    }
  }
  return null;
}

const DEFAULT_SHIFT_TEMPLATES = [
  { shift: 'A', start: '06:00', end: '14:00', hours: '8' },
  { shift: 'B', start: '14:00', end: '22:00', hours: '8' },
  { shift: 'C', start: '22:00', end: '06:00', hours: '8' },
];

function hasEmployeeCore(row) {
  return !!(
    pickCell(row, 'employeeid', 'employee id', 'eid', 'empid', 'emp id') ||
    (pickCell(row, 'name', 'employeename', 'full name') && pickCell(row, 'role', 'title', 'jobtitle', 'job title'))
  );
}

function isShiftTemplateRow(row) {
  const shift = pickCell(row, 'shift', 'shiftname', 'shift id');
  const start = pickCell(row, 'start', 'starttime', 'start time', 'from');
  const end = pickCell(row, 'end', 'endtime', 'end time', 'to');
  const hours = pickCell(row, 'hours', 'hrs', 'duration');
  const filled = [shift, start, end, hours].filter(Boolean).length;
  if (filled < 2) return false;
  const emp = pickCell(row, 'employeeid', 'eid', 'name');
  return !emp;
}

/**
 * Merge employee rows with shift-template rows so each preview line is complete.
 * Fills missing shift fields with round-robin templates or defaults.
 */
export function mergeWorkforcePreviewRows(rows) {
  if (!rows?.length) return rows;
  const shiftTemplates = rows.filter(isShiftTemplateRow);
  const employees = rows.filter((r) => !isShiftTemplateRow(r) && hasEmployeeCore(r));
  const other = rows.filter((r) => isShiftTemplateRow(r) === false && !hasEmployeeCore(r));

  const templates =
    shiftTemplates.length > 0
      ? shiftTemplates.map((r) => ({
          shift: pickCell(r, 'shift', 'shiftname') || '—',
          start: pickCell(r, 'start', 'starttime', 'start time') || '—',
          end: pickCell(r, 'end', 'endtime', 'end time') || '—',
          hours: pickCell(r, 'hours', 'hrs', 'duration') || '—',
        }))
      : DEFAULT_SHIFT_TEMPLATES.map((t) => ({
          shift: t.shift,
          start: t.start,
          end: t.end,
          hours: t.hours,
        }));

  const merged = [];

  const toCanon = (baseRow, tmpl) => {
    const shift = pickCell(baseRow, 'shift', 'shiftname') || tmpl?.shift || '—';
    const start = pickCell(baseRow, 'start', 'starttime') || tmpl?.start || '—';
    const end = pickCell(baseRow, 'end', 'endtime') || tmpl?.end || '—';
    const hours = pickCell(baseRow, 'hours', 'hrs') || tmpl?.hours || '—';

    return {
      'Employee ID': pickCell(baseRow, 'employeeid', 'eid', 'empid', 'emp id') || '—',
      Name: pickCell(baseRow, 'name', 'employeename', 'full name') || '—',
      Role: pickCell(baseRow, 'role', 'title', 'jobtitle', 'job title') || '—',
      'Skill level': pickCell(baseRow, 'skilllevel', 'skill level', 'skill') || '—',
      'Primary area': pickCell(baseRow, 'primaryarea', 'primary area', 'area', 'work area') || '—',
      Department: pickCell(baseRow, 'department', 'dept', 'division') || '—',
      Shift: shift,
      Start: start,
      End: end,
      Hours: hours,
    };
  };

  if (employees.length) {
    employees.forEach((emp, i) => {
      const tmpl = templates[i % templates.length];
      merged.push(toCanon(emp, tmpl));
    });
  }

  if (!employees.length && templates.length) {
    templates.forEach((tmpl) => {
      merged.push(
        toCanon(
          {
            Shift: tmpl.shift,
            Start: tmpl.start,
            End: tmpl.end,
            Hours: tmpl.hours,
          },
          tmpl
        )
      );
    });
  }

  other.forEach((r) => {
    const tmpl = templates[merged.length % templates.length];
    merged.push(toCanon(r, tmpl));
  });

  if (!merged.length) return rows;
  return merged;
}

const WORKFORCE_TABLE_ORDER = [
  'Employeeid',
  'Name',
  'Role',
  'Skilllevel',
  'Primaryarea',
  'Department',
  'Experience Years',
];

const PROCESS_TABLE_ORDER = ['Stepid', 'Stepname', 'Processarea'];

const WASTE_TABLE_ORDER = ['Date', 'Line', 'Processstep', 'Wastekg', 'Wastereason'];

function extractWorkforceTableRow(row) {
  const cells = {};
  const eid = pickCell(row, 'employeeid', 'employee id', 'eid', 'empid', 'emp id');
  if (eid) cells.Employeeid = eid;
  const name = pickCell(row, 'name', 'employeename', 'employee name', 'full name');
  if (name) cells.Name = name;
  const role = pickCell(row, 'role', 'title', 'jobtitle', 'job title');
  if (role) cells.Role = role;
  const skill = pickCell(row, 'skilllevel', 'skill level', 'skill');
  if (skill) cells.Skilllevel = skill;
  const primary = pickCell(row, 'primaryarea', 'primary area', 'area', 'work area');
  if (primary) cells.Primaryarea = primary;
  const dept = pickCell(row, 'department', 'dept', 'division');
  if (dept) cells.Department = dept;
  const exp = pickCell(
    row,
    'experience years',
    'experienceyears',
    'experience',
    'years',
    'tenure',
    'yrsexperience',
    'yrs experience',
    'yrs exp'
  );
  if (exp) cells['Experience Years'] = exp;
  return Object.keys(cells).length ? cells : null;
}

function extractProcessTableRow(row) {
  const cells = {};
  const sid = pickCell(row, 'stepid', 'step id', 'stepno', 'step no', 'stepnum', 'step num', 'id');
  if (sid) cells.Stepid = sid;
  const sname = pickCell(row, 'stepname', 'step name', 'step', 'description', 'operation');
  if (sname) cells.Stepname = sname;
  const area = pickCell(row, 'processarea', 'process area', 'process step area');
  if (area) cells.Processarea = area;
  return Object.keys(cells).length ? cells : null;
}

function extractWasteTableRow(row) {
  const cells = {};
  const dt = pickCell(row, 'date', 'dt', 'day', 'production date');
  if (dt) cells.Date = dt;
  const line = pickCell(row, 'line', 'line id', 'lineid', 'production line');
  if (line) cells.Line = line;
  const step = pickCell(row, 'processstep', 'process step', 'step');
  if (step) cells.Processstep = step;
  const kg = pickCell(row, 'wastekg', 'waste kg', 'waste_kg', 'waste qty', 'scrap kg');
  if (kg) cells.Wastekg = kg;
  const reason = pickCell(row, 'wastereason', 'waste reason', 'reason', 'scrap reason', 'loss reason');
  if (reason) cells.Wastereason = reason;
  return Object.keys(cells).length ? cells : null;
}

function finalizeExecutiveTable(key, title, colOrder, rowCells, sources) {
  if (!rowCells.length) return null;
  const columns = colOrder.filter((col) =>
    rowCells.some((r) => r[col] != null && String(r[col]).trim() !== '')
  );
  if (!columns.length) return null;
  const distinctSources = new Set(sources);
  const withSource = distinctSources.size > 1;
  if (withSource) columns.push('Source');
  const rows = rowCells.map((r, i) => {
    const out = {};
    for (const col of colOrder) {
      if (!columns.includes(col)) continue;
      const v = r[col];
      if (v != null && String(v).trim() !== '') out[col] = String(v).trim();
    }
    if (withSource) out.Source = sources[i];
    return out;
  });
  return { key, title, columns, rows };
}

/**
 * Executive landing: workforce / process / waste as structured table rows (no dot-notation summaries).
 */
export function buildExecutiveStreams(bundle) {
  const streams = getNormalizedStreams(bundle, 'executive-summary');
  const workforceRows = [];
  const workforceSources = [];
  const processRows = [];
  const processSources = [];
  const wasteRows = [];
  const wasteSources = [];

  for (const s of streams) {
    const n = s.name.toLowerCase();
    let bucket = 'general';
    if (/employee|staff|people|headcount|labor|shift|workforce|operator|crew/.test(n)) bucket = 'workforce';
    else if (/process|step|procedure|sop|routine|instruction/.test(n)) bucket = 'process';
    else if (/waste|scrap|yield|loss|rework|giveaway/.test(n)) bucket = 'waste';

    for (const row of s.rows.slice(0, 22)) {
      if (bucket === 'workforce') {
        const cells = extractWorkforceTableRow(row);
        if (!cells) continue;
        workforceRows.push(cells);
        workforceSources.push(s.name);
      } else if (bucket === 'process') {
        const cells = extractProcessTableRow(row);
        if (!cells) continue;
        processRows.push(cells);
        processSources.push(s.name);
      } else if (bucket === 'waste') {
        const cells = extractWasteTableRow(row);
        if (!cells) continue;
        wasteRows.push(cells);
        wasteSources.push(s.name);
      }
    }
  }

  const out = [];
  const w = finalizeExecutiveTable(
    'workforce',
    'Workforce & staffing',
    WORKFORCE_TABLE_ORDER,
    workforceRows,
    workforceSources
  );
  if (w) out.push(w);
  const p = finalizeExecutiveTable(
    'process',
    'Process steps & line execution',
    PROCESS_TABLE_ORDER,
    processRows,
    processSources
  );
  if (p) out.push(p);
  const wa = finalizeExecutiveTable('waste', 'Waste, scrap & yield', WASTE_TABLE_ORDER, wasteRows, wasteSources);
  if (wa) out.push(wa);

  return out;
}

function normColKey(c) {
  return String(c || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isVibrationColumnName(c) {
  const n = normColKey(c);
  return /vibrat|vibrpm|rms|mmsec|mms2|mmsquared|envelope|accelerometer|mmssq|mmsq|velocity/.test(n);
}

function isThermalColumnName(c) {
  const n = normColKey(c);
  return /temp|thermal|heat|degf|degc|celsius|fahrenheit|btu|kelvin/.test(n);
}

function isContextColumnName(c) {
  const n = normColKey(c);
  if (/^time$|^timestamp$|^date$/.test(n)) return true;
  if (n === 'assetid' || n === 'asset' || n.includes('assetid')) return true;
  if (n.includes('plantid')) return true;
  return /plant|state|line|production|site|shift|region|location/.test(n);
}

function anomalyRowMatchesScope(row, filters) {
  if (!filters?.state) return true;
  const st = firstMatching(row, [/^state$/, /^region$/]);
  if (st && st !== filters.state) return false;
  if (filters.plant) {
    const pl = firstMatching(row, [/^plant$/, /^site$/]);
    if (pl && pl !== filters.plant) return false;
  }
  return true;
}

function projectAnomalyRow(row, columnKeys) {
  const o = {};
  for (const c of columnKeys) {
    const v = row[c];
    if (v == null || String(v).trim() === '') continue;
    o[titleCasePhrase(c)] = String(v).trim();
  }
  return o;
}

function buildAnomalyFeedSubtitle(data) {
  if (!data?.length) return 'No rows in scope';
  const first = data[0];
  const entries = Object.entries(first).slice(0, 2);
  const s = entries.map(([k, v]) => `${k}: ${v}`).join(' · ');
  return s.length > 72 ? `${s.slice(0, 69)}…` : s;
}

/**
 * Anomalies page model cards — scoped rows from routed anomaly sheets (Excel bundle).
 */
export function buildAnomalyIndicatorFeeds(bundle, filters = {}) {
  const emptyBucket = () => ({
    records: 0,
    lastSync: 'Live',
    data: [],
    subtitle: 'No anomaly-sheet rows in scope',
  });
  const streams = getNormalizedStreams(bundle, 'anomalies');
  if (!streams.length) {
    return {
      historian: emptyBucket(),
      vibration: emptyBucket(),
      thermal: emptyBucket(),
    };
  }

  const historianRows = [];
  const vibrationRows = [];
  const thermalRows = [];

  for (const s of streams) {
    const { columns, rows } = s;
    const hCols = columns.filter((c) => !isVibrationColumnName(c) && !isThermalColumnName(c));
    const vCols = columns.filter((c) => isVibrationColumnName(c) || isContextColumnName(c));
    const tCols = columns.filter((c) => isThermalColumnName(c) || isContextColumnName(c));

    for (const row of rows) {
      if (!anomalyRowMatchesScope(row, filters)) continue;

      const ho = projectAnomalyRow(row, hCols);
      if (Object.keys(ho).length) historianRows.push(ho);

      const hasVibValue = columns.some(
        (c) => isVibrationColumnName(c) && row[c] != null && String(row[c]).trim() !== ''
      );
      if (hasVibValue) {
        const vo = projectAnomalyRow(row, vCols);
        if (Object.keys(vo).length) vibrationRows.push(vo);
      }

      const hasTempValue = columns.some(
        (c) => isThermalColumnName(c) && row[c] != null && String(row[c]).trim() !== ''
      );
      if (hasTempValue) {
        const to = projectAnomalyRow(row, tCols);
        if (Object.keys(to).length) thermalRows.push(to);
      }
    }
  }

  const cap = 20;
  const hData = historianRows.slice(0, cap);
  const vData = vibrationRows.slice(0, cap);
  const tData = thermalRows.slice(0, cap);

  return {
    historian: {
      records: historianRows.length,
      lastSync: 'Live',
      data: hData,
      subtitle: hData.length ? buildAnomalyFeedSubtitle(hData) : 'No historian-context fields in scope',
    },
    vibration: {
      records: vibrationRows.length,
      lastSync: 'Live',
      data: vData,
      subtitle: vData.length ? buildAnomalyFeedSubtitle(vData) : 'No vibration fields in anomaly sheets',
    },
    thermal: {
      records: thermalRows.length,
      lastSync: 'Live',
      data: tData,
      subtitle: tData.length ? buildAnomalyFeedSubtitle(tData) : 'No thermal fields in anomaly sheets',
    },
  };
}

/**
 * Fallback from live telemetry rows (mock or fused) when anomaly sheets omit a bucket.
 */
export function buildAnomalyIndicatorFeedsFromTelemetry(rows) {
  const empty = {
    records: 0,
    lastSync: 'Live',
    data: [],
    subtitle: 'No telemetry in scope',
  };
  if (!rows?.length) {
    return { historian: { ...empty }, vibration: { ...empty }, thermal: { ...empty } };
  }

  const historian = [];
  const vibration = [];
  const thermal = [];
  for (const r of rows) {
    const time = r.time != null ? String(r.time) : '';
    const asset = r.asset_id != null ? String(r.asset_id) : '';
    const state = r.state != null ? String(r.state) : '';
    const plant = r.plant != null ? String(r.plant) : '';
    const h = {};
    if (time) h.Time = time;
    if (asset) h['Asset Id'] = asset;
    if (state) h.State = state;
    if (plant) h.Plant = plant;
    if (Object.keys(h).length) historian.push(h);

    const v = {};
    if (time) v.Time = time;
    if (asset) v['Asset Id'] = asset;
    if (r.vibration != null && String(r.vibration).trim() !== '') v['Vibration (mm/s²)'] = String(r.vibration);
    if (Object.keys(v).length) vibration.push(v);

    const t = {};
    if (time) t.Time = time;
    if (asset) t['Asset Id'] = asset;
    if (r.temperature != null && String(r.temperature).trim() !== '') t['Temperature (°F)'] = String(r.temperature);
    if (Object.keys(t).length) thermal.push(t);
  }

  const n = rows.length;
  const slice = (arr) => arr.slice(0, 16);
  return {
    historian: {
      records: n,
      lastSync: 'Live',
      data: slice(historian),
      subtitle: historian.length ? buildAnomalyFeedSubtitle(historian) : empty.subtitle,
    },
    vibration: {
      records: n,
      lastSync: 'Live',
      data: slice(vibration),
      subtitle: vibration.length ? buildAnomalyFeedSubtitle(vibration) : empty.subtitle,
    },
    thermal: {
      records: n,
      lastSync: 'Live',
      data: slice(thermal),
      subtitle: thermal.length ? buildAnomalyFeedSubtitle(thermal) : empty.subtitle,
    },
  };
}

/** Per-bucket: prefer anomaly-sheet data; fill gaps from telemetry rows. */
export function resolveAnomalyIndicatorFeeds(bundle, filters, telemetryRows) {
  const excel = buildAnomalyIndicatorFeeds(bundle, filters);
  const tel = buildAnomalyIndicatorFeedsFromTelemetry(telemetryRows || []);
  const pick = (a, b) => (a.data.length ? a : b);
  return {
    historian: pick(excel.historian, tel.historian),
    vibration: pick(excel.vibration, tel.vibration),
    thermal: pick(excel.thermal, tel.thermal),
  };
}

function classifyAnomalySignalChannel(row) {
  const st = pickCell(row, 'sensortype', 'sensor type', 'measurementtype', 'measurement type', 'signal type');
  if (st) {
    const sl = st.toLowerCase();
    if (sl.includes('vib')) return { channel: 'vibration', label: st };
    if (sl.includes('temp') || sl.includes('thermal')) return { channel: 'thermal', label: st };
  }
  const unit = pickCell(row, 'unit', 'units', 'uom');
  if (unit) {
    const u = unit.toLowerCase();
    if (u.includes('mm/s') || u.includes('m/s')) return { channel: 'vibration', label: pickCell(row, 'sensortype', 'sensor type') || 'Vibration' };
    if (u.includes('°') || u.includes('deg') || u.includes('temp'))
      return { channel: 'thermal', label: pickCell(row, 'sensortype', 'sensor type') || 'Temperature' };
  }
  const blob = Object.values(row)
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  if (blob.includes('vibration') || blob.includes('mm/s')) return { channel: 'vibration', label: 'Vibration' };
  if (blob.includes('temperature') || blob.includes('thermal') || blob.includes('°f'))
    return { channel: 'thermal', label: 'Temperature' };
  return { channel: 'general', label: null };
}

function inferAnomalySeverity(kpiRaw, channel) {
  const n = parseFloat(String(kpiRaw || '').replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n)) return 'info';
  if (channel === 'vibration') {
    if (n >= 120) return 'critical';
    if (n >= 100) return 'warn';
  }
  if (channel === 'thermal') {
    if (n >= 180) return 'critical';
    if (n >= 170) return 'warn';
  }
  return 'info';
}

export function buildAnomalySignals(bundle) {
  const streams = getNormalizedStreams(bundle, 'anomalies');
  const signals = [];
  for (const s of streams) {
    for (const row of s.rows.slice(0, 28)) {
      const line =
        firstMatching(row, [/line/, /^production/, /asset/, /cell/, /unit/]) ||
        firstMatching(row, [/plant/, /site/]);
      const stop =
        firstMatching(row, [/stop/, /stoppage/, /down/, /halt/, /idle/, /event/]) ||
        firstMatching(row, [/duration/, /minutes/, /hours/]);
      const kpi = firstMatching(row, [/kpi/, /trigger/, /alarm/, /threshold/, /limit/, /setpoint/]);
      const rec = firstMatching(row, [/recommend/, /follow/, /next/, /action/]);
      const nar = rowSummary(row, s.columns, 8);
      if (line || stop || kpi || nar) {
        const { channel, label: sensorTypeLabel } = classifyAnomalySignalChannel(row);
        const assetId = pickCell(row, 'assetid', 'asset id', 'equipment id', 'equipmentid');
        const sensorId = pickCell(row, 'sensorid', 'sensor id', 'tag', 'point id');
        const unit = pickCell(row, 'unit', 'units', 'uom');
        const warnHi =
          pickCell(row, 'warningthresholdhigh', 'warning threshold high', 'warning high', 'high threshold') ||
          pickCell(row, 'thresholdhigh', 'threshold high');
        const headline = assetId || line || 'Production line (fused read)';
        const severity = inferAnomalySeverity(kpi || warnHi, channel);
        const scopeState = pickCell(row, 'state', 'site', 'region', 'location');

        signals.push({
          id: `${s.name}-${signals.length}`,
          productionLine: headline,
          stopStory: stop || 'Stop pattern correlated from historian and execution context.',
          kpiSignal: kpi || warnHi || 'KPI boundary review — align with live telemetry below.',
          recommendationHook: rec || 'Severity routes to prioritized actions once validated.',
          detail: nar,
          signalChannel: channel,
          sensorTypeLabel: sensorTypeLabel || (channel === 'vibration' ? 'Vibration' : channel === 'thermal' ? 'Temperature' : null),
          severity,
          assetId,
          sensorId,
          unit,
          warnThresholdHigh: warnHi,
          scopeState,
        });
      }
    }
  }
  return signals.slice(0, 26);
}

export function buildRcaSignals(bundle) {
  const streams = getNormalizedStreams(bundle, 'root-cause');
  const steps = [];
  const reasons = [];
  for (const s of streams) {
    for (const row of s.rows.slice(0, 32)) {
      const why = firstMatching(row, [/why/, /reason/, /root/, /cause/, /factor/, /driver/]);
      const step = firstMatching(row, [/step/, /stage/, /phase/, /sequence/, /order/, /flow/]);
      const desc = firstMatching(row, [/description/, /detail/, /notes/, /comment/, /narrative/]);
      const graphic = firstMatching(row, [/graphic/, /chart/, /diagram/, /model/]);
      const line = rowSummary(row, s.columns, 6);
      if (why || step || desc) {
        steps.push({
          id: `${s.name}-${steps.length}`,
          step: step || `Analysis beat ${steps.length + 1}`,
          why: why || desc || 'Hypothesis under evaluation from fused signals.',
          evidence: line || desc || graphic || 'Cross-system correlation in progress.',
        });
      } else if (line) {
        reasons.push({ text: line });
      }
    }
  }
  if (!steps.length && reasons.length) {
    reasons.slice(0, 10).forEach((r, i) => {
      steps.push({
        id: `r-${i}`,
        step: `Signal ${i + 1}`,
        why: r.text,
        evidence: '',
      });
    });
  }
  return { steps: steps.slice(0, 18), extraReasons: reasons.slice(0, 8) };
}

export function buildActionItems(bundle) {
  const streams = getNormalizedStreams(bundle, 'recommendations');
  const actions = [];
  for (const s of streams) {
    for (const row of s.rows.slice(0, 45)) {
      const action =
        firstMatching(row, [/action/, /recommend/, /remediat/, /task/, /playbook/, /countermeasure/, /mitigation/]) ||
        firstMatching(row, [/^description$/, /^detail$/]);
      const priority = firstMatching(row, [/priority/, /rank/, /severity/, /critical/]);
      const owner = firstMatching(row, [/owner/, /assign/, /team/, /role/, /responsible/]);
      const when = firstMatching(row, [/when/, /due/, /date/, /target/, /window/]);
      const ctx = rowSummary(row, s.columns, 4);
      if (action) {
        actions.push({
          id: `${s.name}-${actions.length}`,
          title: action.slice(0, 220),
          priority: priority || null,
          owner: owner || null,
          when: when || null,
          context: ctx && ctx !== action ? ctx : null,
        });
      } else if (ctx) {
        actions.push({
          id: `${s.name}-${actions.length}`,
          title: ctx.slice(0, 180),
          priority: null,
          owner: null,
          when: null,
          context: null,
        });
      }
    }
  }
  return actions.slice(0, 32);
}

export function buildDowntimeEvents(bundle) {
  const streams = getNormalizedStreams(bundle, 'maintenance');
  const events = [];
  for (const s of streams) {
    for (const row of s.rows.slice(0, 40)) {
      const dt =
        firstMatching(row, [/downtime/, /down time/, /outage/, /lost/, /idle/]) ||
        firstMatching(row, [/duration/, /hours/, /minutes/]);
      const asset = firstMatching(row, [/asset/, /equipment/, /line/, /machine/]);
      const plant = firstMatching(row, [/plant/, /site/, /location/]);
      const reason = firstMatching(row, [/reason/, /cause/, /code/, /failure/, /category/]);
      const when = firstMatching(row, [/date/, /start/, /time/, /week/, /shift/]);
      const line = rowSummary(row, s.columns, 5);
      if (dt || reason || when || asset) {
        events.push({
          id: `${s.name}-${events.length}`,
          headline: reason || 'Planned downtime event',
          duration: dt,
          plant: plant || null,
          asset: asset || null,
          when: when || null,
          context: appendWorkcenterrolesToDowntimeContextLine(line),
        });
      }
    }
  }
  return events.slice(0, 30);
}

/** Planned downtime cards from mock schedule — same CMMS row shape as work-order cards (Workcenterroles embedded). */
export function buildScheduleDowntimeEvents(schedule) {
  if (!schedule?.length) return [];
  return schedule.map((item, i) => ({
    id: `sched-${item.asset_id}-${item.scheduled_date}-${i}`,
    headline: 'Planned downtime event',
    duration: item.estimated_duration_hours != null ? String(item.estimated_duration_hours) : null,
    plant: item.plant,
    asset: item.asset_id,
    when: item.scheduled_date,
    context: formatCmmsMaintenanceRecordLine(item),
  }));
}

/** Demo rows when no executive-summary feeds are routed (still looks like integrated plant data). */
const EXEC_FEED_FALLBACK = {
  workforce: {
    records: 52,
    lastSync: 'Live',
    subtitle: 'Shift A staffed · 24 operators · 98% attendance',
    data: [
      {
        'Employee ID': '—',
        Name: 'Shift rollup',
        Role: 'Crew',
        'Skill level': '—',
        'Primary area': 'Modesto',
        Department: 'Operations',
        Shift: 'A',
        Start: '06:00',
        End: '14:00',
        Hours: '8',
      },
      {
        'Employee ID': '—',
        Name: 'Shift rollup',
        Role: 'Crew',
        'Skill level': '—',
        'Primary area': 'Modesto',
        Department: 'Operations',
        Shift: 'B',
        Start: '14:00',
        End: '22:00',
        Hours: '8',
      },
      {
        'Employee ID': '—',
        Name: 'Shift rollup',
        Role: 'Crew',
        'Skill level': '—',
        'Primary area': 'Franklin',
        Department: 'Operations',
        Shift: 'C',
        Start: '22:00',
        End: '06:00',
        Hours: '8',
      },
    ],
  },
  mes: {
    records: 128 + WORKCENTER_ROLES_MASTER.length,
    lastSync: 'Live',
    subtitle: `${WORKCENTER_ROLES_MASTER.length} workcenter roles · line step telemetry`,
    data: [
      ...WORKCENTER_ROLES_MASTER.map((r) => ({ Roleid: r.Roleid, Rolename: r.Rolename })),
      { Line: 'L4', Step: 'Seal integrity', Status: 'GO', Last: '14:22' },
      { Line: 'L2', Step: 'Weight check', Status: 'GO', Last: '14:20' },
      { Line: 'L1', Step: 'Metal check', Status: 'GO', Last: '14:18' },
    ],
  },
  loss: {
    records: 36,
    lastSync: 'Live',
    subtitle: 'Scrap 0.42% · Giveaway inside target',
    data: [
      { Category: 'Film trim', Lbs: '42', Shift: 'A', Target: '< 50' },
      { Category: 'Product waste', Lbs: '18', Shift: 'B', Target: '< 35' },
    ],
  },
};

/**
 * One-line teasers + popup payloads for the three executive “feed” cards (workforce / MES / loss).
 * Uses the same bundle as landing narratives; falls back to demo rows when nothing is routed.
 */
export function summarizeExecutiveFeeds(bundle) {
  const streams = getNormalizedStreams(bundle, 'executive-summary');
  const buckets = { workforce: [], process: [], waste: [] };

  for (const s of streams) {
    const n = s.name.toLowerCase();
    let key = 'process';
    if (/employee|staff|people|headcount|labor|shift|workforce|operator|crew/.test(n)) key = 'workforce';
    else if (/waste|scrap|yield|loss|rework|giveaway/.test(n)) key = 'waste';
    else if (/process|step|procedure|sop|routine|instruction|mes|line|production|landing|summary|overview|dashboard|plant|asset|map|fleet|geo/.test(n)) {
      key = 'process';
    }
    buckets[key].push(s);
  }

  function cardFromStreams(list, bucketKey) {
    if (!list.length) return null;
    let records = 0;
    const data = [];
    const sheetLabels = [];
    for (const s of list) {
      records += s.rows.length;
      sheetLabels.push(s.name);
      for (const row of s.rows.slice(0, 14)) {
        const obj = {};
        s.columns.forEach((c) => {
          const v = row[c];
          if (v != null && String(v).trim() !== '') {
            obj[titleCasePhrase(c)] = String(v).trim();
          }
        });
        if (Object.keys(obj).length) data.push(obj);
      }
    }

    let preview = data;
    if (bucketKey === 'workforce') {
      preview = mergeWorkforcePreviewRows(data);
    }
    if (bucketKey === 'process') {
      const roleRows = WORKCENTER_ROLES_MASTER.map((r) => ({ Roleid: r.Roleid, Rolename: r.Rolename }));
      preview = [...roleRows, ...preview];
    }

    const top = preview[0];
    let subtitle = '';
    if (top) {
      subtitle = Object.entries(top)
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      if (subtitle.length > 78) subtitle = `${subtitle.slice(0, 75)}…`;
    }
    if (!subtitle) {
      subtitle = `${records.toLocaleString()} records · ${sheetLabels.slice(0, 2).join(', ')}${sheetLabels.length > 2 ? '…' : ''}`;
      if (subtitle.length > 78) subtitle = `${subtitle.slice(0, 75)}…`;
    }

    const maxPreview = bucketKey === 'process' ? 28 : 12;
    return {
      records,
      lastSync: 'Live',
      subtitle,
      data: preview.slice(0, maxPreview),
    };
  }

  return {
    workforce: cardFromStreams(buckets.workforce, 'workforce') || EXEC_FEED_FALLBACK.workforce,
    mes: cardFromStreams(buckets.process, 'process') || EXEC_FEED_FALLBACK.mes,
    loss: cardFromStreams(buckets.waste, 'waste') || EXEC_FEED_FALLBACK.loss,
  };
}
