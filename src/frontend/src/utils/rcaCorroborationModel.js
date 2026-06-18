/**
 * Pareto, 5-whys framing, and equipment-tree lines for the RCA corroboration strip.
 * Merges Excel-routed root-cause rows with live drill-path context when available.
 */

import { buildRcaSignals } from './agenticSynthesis';

const DEFAULT_PARETO = [
  { label: 'Bearing / mechanical wear', pct: 34 },
  { label: 'Lubrication / contamination', pct: 22 },
  { label: 'Misalignment / imbalance', pct: 18 },
  { label: 'Electrical / control drift', pct: 12 },
  { label: 'Process / load variance', pct: 9 },
  { label: 'Other / multi-factor', pct: 5 },
];

function buildDefaultFiveWhys(snap) {
  const asset = snap?.currentAssetId || 'this asset';
  const plant = snap?.currentPlant || 'the site';
  const state = snap?.currentState || 'region';
  return [
    {
      i: 1,
      q: 'Why did the signal register?',
      a: `Condition monitoring on ${asset} exceeded policy bands while running under ${plant}.`,
      evidence: 'Historian + threshold matrix',
    },
    {
      i: 2,
      q: 'Why is energy elevated on the trace?',
      a: 'Typical physics chain: wear, misalignment, or lubrication breakdown increases transmitted load.',
      evidence: 'Vibration / thermal fusion',
    },
    {
      i: 3,
      q: 'Why wasn’t it caught earlier?',
      a: 'Route length, sensor placement, or alarm deadband may filter early drift until it couples to KPIs.',
      evidence: 'Maintenance & alarm config',
    },
    {
      i: 4,
      q: `Why does ${state} context matter?`,
      a: 'Regional spares, crew skills, and environmental factors change time-to-restore and repeat risk.',
      evidence: 'Workforce + logistics feeds',
    },
    {
      i: 5,
      q: 'What systemic barrier closes the loop?',
      a: 'Tighten watch rules, shorten inspection cadence for this criticality, and validate lube routes.',
      evidence: 'Pareto + RCA closure template',
    },
  ];
}

function buildEquipmentTreeFromSnap(snap) {
  const plant = snap?.currentPlant || 'Plant';
  const asset = snap?.currentAssetId || 'Asset';
  return [
    { depth: 0, label: 'Site', meta: plant },
    { depth: 1, label: 'Production line', meta: 'Execution cell' },
    { depth: 2, label: 'Asset class', meta: 'Rotating equipment' },
    { depth: 3, label: 'Target unit', meta: asset },
    { depth: 4, label: 'Failure mode loci', meta: 'Bearing · seal · coupling' },
    { depth: 4, label: 'Supporting systems', meta: 'Lube · cooling · control' },
  ];
}

/**
 * JOB AID / packaging line OCR fields as equipment-tree rows (same facts as the former form strip).
 * @param {object|null} extract
 * @returns {Array<{ depth: number, label: string, meta: string, note?: boolean }>}
 */
export function buildRcaFormExtractEquipmentTreeNodes(extract) {
  if (!extract || typeof extract !== 'object') return [];
  const depth = 5;
  const nodes = [
    { depth, label: 'Machine no.', meta: String(extract.machineNo ?? '—') },
    { depth, label: 'UPC / film code', meta: String(extract.upcFilmCode ?? '—') },
    { depth, label: 'Nitrogen flush % O₂', meta: String(extract.nitrogenFlushO2 ?? '—') },
    { depth, label: 'Wt. (oz / gm)', meta: String(extract.weightGm ?? '—') },
    { depth, label: 'Air fill level (1)', meta: String(extract.airFill1 ?? '—') },
    { depth, label: 'Air fill level (2)', meta: String(extract.airFill2 ?? '—') },
  ];
  const hc = extract.headerContext != null ? String(extract.headerContext).trim() : '';
  if (hc) {
    nodes.push({ depth, label: 'Header context (partial read)', meta: hc, note: true });
  }
  return nodes;
}

function normalizeParetoFromCauses(rootCauses) {
  const rows = rootCauses.map((c) => ({
    label: c.cause,
    pct: Math.round((c.probability || 0) * 100),
  }));
  const sum = rows.reduce((a, r) => a + r.pct, 0);
  if (sum <= 0) return null;
  if (sum === 100) return rows;
  return rows.map((r) => ({ ...r, pct: Math.max(1, Math.round((r.pct / sum) * 100)) }));
}

/**
 * @param {object} bundle - excel bundle
 * @param {object|null} snap - deriveRcaFlowSnapshot result
 * @param {object|null} [formExtract] - getRcaFormExtractForScope(); merged under equipment tree when present
 */
export function buildRcaCorroborationPanelModel(bundle, snap, formExtract = null) {
  const { steps, extraReasons } = buildRcaSignals(bundle || {});

  const fromModel = snap?.rootCauses?.length ? normalizeParetoFromCauses(snap.rootCauses) : null;
  const pareto = fromModel && fromModel.length ? fromModel : DEFAULT_PARETO.map((p) => ({ ...p }));

  let fiveWhys = [];
  if (steps.length >= 2) {
    fiveWhys = steps.slice(0, 6).map((st, idx) => ({
      i: idx + 1,
      q: st.step,
      a: st.why,
      evidence: st.evidence || 'Routed operational dataset',
    }));
  } else {
    fiveWhys = buildDefaultFiveWhys(snap);
  }

  const formNodes = buildRcaFormExtractEquipmentTreeNodes(formExtract);
  const tree = [...buildEquipmentTreeFromSnap(snap), ...formNodes];

  return {
    pareto,
    fiveWhys,
    tree,
    treeHasJobAidFields: formNodes.length > 0,
    excelSteps: steps,
    extraReasons,
  };
}
