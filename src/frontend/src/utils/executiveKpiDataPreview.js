/**
 * Tabular previews for Executive Key metrics (integrated pipeline feeds + fleet / historian mocks).
 */

import { getAssetsFiltered } from '../data/mockData';

/** Cap for modal scroll performance; UI copy does not describe truncation. */
const PREVIEW_ROW_CAP = 100;
const MAX_COLS = 8;

function filterConsumerComplaintRows(rows, state) {
  if (!state || !rows.length) return rows;
  const st = String(state).toLowerCase();
  const filtered = rows.filter((r) => {
    const reg = String(r.Region || '').toLowerCase();
    if (st.includes('jonesboro') || st.includes('beloit')) return reg === 'us' || reg === '' || reg === 'north america';
    return true;
  });
  return filtered.length ? filtered : rows;
}

function pickColumns(sheetColumns, sampleRow, maxCols) {
  if (Array.isArray(sheetColumns) && sheetColumns.length) {
    return sheetColumns.slice(0, maxCols);
  }
  const keys = Object.keys(sampleRow || {});
  return keys.slice(0, maxCols);
}

function projectRows(rows, columns) {
  return rows.map((r) => {
    const o = {};
    for (const c of columns) {
      const v = r[c];
      o[c] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
    }
    return o;
  });
}

function sheetBlock(bundle, name) {
  const sh = bundle?.sheets?.[name];
  if (!sh?.rows?.length) return null;
  return sh;
}

/**
 * @param {string} tileId — ExecutiveKeyMetrics tile id
 * @param {object} ctx — { excelBundle, filters, model, operatorRole }
 * @returns {{ title: string, subtitle: string, columns: string[], rows: object[], source: string }}
 */
export function getExecutiveKpiDataPreview(tileId, ctx) {
  const { excelBundle = {}, filters = {}, model, operatorRole } = ctx;
  const bundle = excelBundle;

  if (tileId === 'complaints') {
    const sh = sheetBlock(bundle, 'Consumer_Complaints');
    if (!sh) {
      return {
        title: 'Consumer complaint load',
        subtitle:
          'Consumer experience pipeline is not synchronized yet—connect operational feeds to hydrate this KPI.',
        columns: [],
        rows: [],
        source: 'none',
      };
    }
    const list = filterConsumerComplaintRows(sh.rows, filters.state);
    const slice = list.slice(0, PREVIEW_ROW_CAP);
    const cols = pickColumns(sh.columns, slice[0], MAX_COLS);
    return {
      title: 'Consumer experience pipeline',
      subtitle: 'Integrated feed backing the complaint-load index for your territory, plant filter, and operator lens.',
      columns: cols,
      rows: projectRows(slice, cols),
      source: 'excel',
    };
  }

  if (tileId === 'workerSat') {
    const sh = sheetBlock(bundle, 'Worker_Satisfaction');
    if (!sh) {
      return {
        title: 'Worker satisfaction',
        subtitle:
          'Workforce pulse pipeline is not synchronized yet—connect operational feeds to hydrate this KPI.',
        columns: [],
        rows: [],
        source: 'none',
      };
    }
    const slice = sh.rows.slice(0, PREVIEW_ROW_CAP);
    const cols = pickColumns(sh.columns, slice[0], MAX_COLS);
    return {
      title: 'Workforce pulse pipeline',
      subtitle: 'Integrated feed backing the worker satisfaction KPI for your territory and operator lens.',
      columns: cols,
      rows: projectRows(slice, cols),
      source: 'excel',
    };
  }

  if (tileId === 'quality') {
    const sh = sheetBlock(bundle, 'KPI_Quality');
    if (!sh) {
      return {
        title: 'Quality score',
        subtitle:
          'Batch quality pipeline is not synchronized yet—connect operational feeds to hydrate this KPI.',
        columns: [],
        rows: [],
        source: 'none',
      };
    }
    const slice = sh.rows.slice(0, PREVIEW_ROW_CAP);
    const cols = pickColumns(sh.columns, slice[0], MAX_COLS);
    return {
      title: 'Batch quality pipeline',
      subtitle: 'Integrated feed backing the quality score KPI for your territory and operator lens.',
      columns: cols,
      rows: projectRows(slice, cols),
      source: 'excel',
    };
  }

  if (tileId === 'wastage' || tileId === 'productivity' || tileId === 'downtime') {
    const assets = getAssetsFiltered(filters, { operatorRole });
    const slice = assets.slice(0, PREVIEW_ROW_CAP);
    const cols = ['asset_id', 'plant', 'status', 'asset_type', 'criticality', 'rul'].slice(0, MAX_COLS);
    const rows = slice.map((a) => {
      const o = {};
      for (const c of cols) o[c] = a[c] ?? '';
      return o;
    });
    return {
      title: `Fleet snapshot · ${tileId}`,
      subtitle: 'Fleet registry for the selected site, plant, and operator lens—drives wastage, throughput, and downtime.',
      columns: cols,
      rows,
      source: 'mock',
    };
  }

  if (tileId === 'temp' || tileId === 'vib') {
    const all = model?.rows || [];
    const raw = all.slice(0, PREVIEW_ROW_CAP);
    const cols = ['asset_id', 'time', 'plant', 'temperature', 'vibration'].slice(0, MAX_COLS);
    const rows = raw.map((r) => {
      const o = {};
      for (const c of cols) o[c] = r[c] ?? '';
      return o;
    });
    return {
      title: tileId === 'temp' ? 'Temperature · historian points' : 'Vibration · historian points',
      subtitle:
        raw.length > 0
          ? 'Historian readings for the selected site, plant, asset filter, and operator lens.'
          : 'No telemetry rows for this location and operator lens.',
      columns: cols,
      rows,
      source: 'mock',
    };
  }

  return {
    title: 'Backing data',
    subtitle: 'No preview for this tile.',
    columns: [],
    rows: [],
    source: 'none',
  };
}
