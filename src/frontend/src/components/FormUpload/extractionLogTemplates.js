import { OPERATOR_ROLES } from '../../utils/operatorRole';

/**
 * Which physical demo scan the file name maps to (go.png vs nogo.png content).
 * Used so extraction logs match the values on each image, not a single generic form.
 */
export function inferFl5883ScanKey(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const lower = filename.toLowerCase().replace(/\\/g, '/').split('/').pop() || '';
  const base = lower.includes('.') ? lower.slice(0, lower.lastIndexOf('.')) : lower;
  const stem = base;

  if (stem === 'nogo' || stem === 'img7720') return 'nogo';
  if (stem === 'go' || stem === 'img7719') return 'go';
  if (lower.includes('sample_form_nogo') || lower.endsWith('_nogo.png') || lower.endsWith('_nogo.svg')) {
    return 'nogo';
  }
  if (lower.includes('sample_form_go') || lower.endsWith('_go.png') || lower.endsWith('_go.svg')) return 'go';
  if (lower.includes('nogo') || lower.includes('no_go') || lower.includes('no-go')) return 'nogo';
  if (/\bgo\b/.test(lower) && !lower.replace(/[-_]/g, '').includes('nogo')) return 'go';
  return null;
}

/** Mirrors backend `classify_from_filename` enough for demo pacing (go.png / nogo.png). */
export function inferDemoOutcomeFromFilename(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const lower = filename.toLowerCase().replace(/\\/g, '/').split('/').pop() || '';
  const base = lower.includes('.') ? lower.slice(0, lower.lastIndexOf('.')) : lower;
  const stem = base;

  if (stem === 'nogo') return 'no_go';
  if (stem === 'go') return 'go';
  if (stem === 'img7719') return 'go';
  if (stem === 'img7720') return 'no_go';
  if (lower.includes('nogo') || lower.includes('no_go') || lower.includes('no-go')) return 'no_go';
  if (lower.includes('sample_form_nogo') || lower.endsWith('_nogo.png') || lower.endsWith('_nogo.svg')) {
    return 'no_go';
  }
  if (lower.includes('sample_form_go') || lower.endsWith('_go.png') || lower.endsWith('_go.svg')) return 'go';
  if (/\bgo\b/.test(lower) && !lower.replace(/[-_]/g, '').includes('nogo')) return 'go';
  return null;
}

function lensKey(operatorRole) {
  if (operatorRole === OPERATOR_ROLES.processing) return 'processing';
  if (operatorRole === OPERATOR_ROLES.manager) return 'manager';
  return 'packaging';
}

/** Literal read order for `go.png` — Frito-Lay FL-5883 job aid (Rev. 1/2017). */
const FL5883_GO_PNG_LINES = [
  '[READ] zone = title · JOB AID for PACKAGE QUALITY & REGULATORY CERTIFICATION / WEAKLINK',
  '[FIELD] form_id = FL-5883 (Rev. 1/2017)',
  '[FIELD] objective = VERIFY THE CORRECT PRODUCT IS IN THE CORRECT PACKAGE AND BAG CODING/CASE CODING INFORMATION IS ACCURATE',
  '[FIELD] scenario_flags = (none checked) START-UP / SHIFT CHANGE / CHANGE OVER / BAG SIZE ONLY',
  '[FIELD] date = 06/04/26',
  '[FIELD] shift = A',
  '[FIELD] time = 14:30',
  '[FIELD] machine_no = M12',
  '[FIELD] nitrogen_flush_o2 = 1.5% O2',
  '[FIELD] allergen_matrix_wet_dry = (blank)',
  '[FIELD] product = (blank)',
  '[FIELD] flavor = (blank)',
  '[FIELD] weight_oz_gm = 28 g (gm circled)',
  '[FIELD] air_fill_level_1 = GO',
  '[FIELD] air_fill_level_2 = GO',
  '[FIELD] upc_film_code = 8901234567890',
  '[ROW] first_5_bags_mixed_product = N/A · column_mark = NO-GO',
  '[ROW] psm_completed = YES · column_mark = NO',
  '[ROW] blocker_sock_in_place = YES · column_mark = NO',
  '[ROW] expiration_date = 12/10/2026 · price = (blank) · column_mark = NO-GO',
  '[ROW] day_plant_shift_julian = 098B3 · column_mark = NO-GO',
  '[ROW] material_solvent_odor = GO · column_mark = NO-GO',
  '[ROW] product_tasted_correct_in_bag = GO · column_mark = NO-GO',
  '[ROW] tape_date = 06/04/26 · column_mark = NO-GO',
  '[ROW] case_label_date = 06/04/26 · column_mark = NO-GO',
  '[ROW] canadian_made_week_of = (blank) · column_mark = NO-GO',
  '[ROW] package_appearance = (see form) · column_mark = NO-GO',
  '[ROW] seal_integrity = (see form) · column_mark = NO-GO',
  '[ROW] case_count = (see form) · column_mark = GO',
  '[NOTE] margin_note = "Approver Qs" bracket at package appearance / seal / case count block',
  '[FIELD] initial_verification_sig = (blank)',
  '[FIELD] final_verification_sig = (blank)',
];

/** Literal read order for `nogo.png` — same form template; values differ from go.png. */
const FL5883_NOGO_PNG_LINES = [
  '[READ] zone = title · JOB AID for PACKAGE QUALITY & REGULATORY CERTIFICATION / WEAKLINK',
  '[FIELD] form_id = FL-5883 (Rev. 1/2017)',
  '[FIELD] objective = VERIFY THE CORRECT PRODUCT IS IN THE CORRECT PACKAGE AND BAG CODING/CASE CODING INFORMATION IS ACCURATE',
  '[FIELD] scenario_flags = (none checked) START-UP / CHANGE OVER / SHIFT CHANGE / BAG SIZE ONLY',
  '[FIELD] date = 08/04/26',
  '[FIELD] shift = C',
  '[FIELD] time = 17:15',
  '[FIELD] machine_no = M-7',
  '[FIELD] nitrogen_flush_o2 = 1.8% O2',
  '[FIELD] allergen_matrix_wet_dry = (blank)',
  '[FIELD] product = (blank)',
  '[FIELD] flavor = (blank)',
  '[FIELD] weight_oz_gm = 30 g (gm circled)',
  '[FIELD] air_fill_level_1 = GO (circled)',
  '[FIELD] air_fill_level_2 = GO (circled)',
  '[FIELD] upc_film_code = 8901234567890',
  '[ROW] first_5_bags_mixed_product = N/A',
  '[ROW] psm_completed = NO · column_mark = NO',
  '[ROW] blocker_sock_in_place = NO · column_mark = NO',
  '[ROW] expiration_date = 12/10/2026 · price = (blank) · column_mark = NO-GO',
  '[ROW] day_plant_shift_julian = 098B3 · column_mark = NO-GO',
  '[ROW] material_solvent_odor = NO-GO · column_mark = NO-GO',
  '[ROW] product_tasted_correct_in_bag = NO-GO · column_mark = NO-GO',
  '[ROW] tape_date = 08/04/26 · case_label_date = 08/04/26 · column_mark = NO-GO',
  '[ROW] canadian_made_week_of = (blank) · column_mark = NO-GO',
  '[ROW] package_appearance = · column_mark = RTA/RA',
  '[ROW] seal_integrity = · column_mark = RTA/RA',
  '[ROW] case_count = · column_mark = RTA/RA',
  '[NOTE] margin_note = "Approver Q\'s" bracket at last three rows',
  '[FIELD] initial_verification_sig = (blank)',
  '[FIELD] final_verification_sig = (blank)',
];

/**
 * Full line-by-line extraction for the two demo scans (go.png / nogo.png).
 * Other lenses still show the same paper values with a one-line lens prefix.
 */
export function getFl5883JobAidScanLines(scanKey, operatorRole) {
  const base = scanKey === 'nogo' ? FL5883_NOGO_PNG_LINES : FL5883_GO_PNG_LINES;
  const lens = lensKey(operatorRole);
  if (lens === 'packaging') return [...base];
  if (lens === 'manager') {
    return ['[LENS] Regional supervisor · same FL-5883 scan as uploaded image', ...base];
  }
  return ['[LENS] Processing operator · packaging job aid tied to this release read', ...base];
}

/** Short lines for early pipeline steps (kept brief — main read is the field list). */
export function getStepSidecarLines(stepId) {
  switch (stepId) {
    case 'mfg':
      return ['[MFG] Scheduler OK · JOB-AID-INTAKE slot reserved', '[MFG] PF12 work-center bound to session'];
    case 'load':
      return [
        '[INGEST] Decode OK · RGB · 2480×3504 · 8-bit',
        '[INGEST] Template hint: FL-5883 package quality release (job aid)',
      ];
    case 'extract':
      return ['[OCR] Deskew + contrast normalize · ready for line-by-line read'];
    case 'classify':
      return ['[POLICY] Rules engine armed · awaiting full field vector'];
    default:
      return [];
  }
}

export function getWaitingLines() {
  return ['[NET] Awaiting vision + rules response…', '[NET] Classifier scoring document…'];
}

/**
 * Shared header / run context — appears on both Go and No-Go scans (demo FL-5883 style).
 * Written as literal "extracted" key/value lines the user can read slowly.
 */
export function getSharedFormFieldLines(operatorRole) {
  const lens = lensKey(operatorRole);
  if (lens === 'manager') {
    return [
      '[READ] zone = header · confidence 0.94',
      '[FIELD] document_title = FL-5883 · Regional QC exception summary',
      '[FIELD] report_date = 2026-04-22',
      '[FIELD] region = North America · West',
      '[FIELD] site_code = PLT-07 · Modesto',
      '[FIELD] product_family = Tortilla · 12oz laydown SKUs',
      '[FIELD] exception_ref = XC-2026-0441',
      '[FIELD] shift = A (06:00–14:00)',
      '[FIELD] submitted_by = Line packaging lead',
    ];
  }
  if (lens === 'processing') {
    return [
      '[READ] zone = header · confidence 0.93',
      '[FIELD] document_no = FL-5883-PROC',
      '[FIELD] revision = Rev C · effective 03/15/2026',
      '[FIELD] production_date = 04/22/2026',
      '[FIELD] line = FR-08 · Fryer / slice handoff',
      '[FIELD] shift = A',
      '[FIELD] operator_initials = HM',
      '[FIELD] supervisor_initials = AR',
      "[FIELD] sku = Lay's Classic tortilla 12oz",
      '[FIELD] upc = 028400058821',
      '[FIELD] batch_lot = BT-99214-C',
      '[FIELD] run_window = 05:52 – 14:05',
      '[FIELD] oil_turnover = nominal (within 24h spec)',
      '[FIELD] slice_thickness_mm = 1.00 (target 1.00 ± 0.06)',
      '[FIELD] nitrogen_flush_o2_pct = 1.7 (max 2.5)',
      '[FIELD] upstream_weight_g = 451.4 (target 452.0 ± 3.0)',
    ];
  }
  return [
    '[READ] zone = header · confidence 0.94',
    '[FIELD] document_no = FL-5883-PKG',
    '[FIELD] revision = Rev D · effective 04/01/2026',
    '[FIELD] production_date = 04/22/2026',
    '[FIELD] line = PF12 · VFFS Line 4',
    '[FIELD] shift = A',
    '[FIELD] operator_initials = HM',
    '[FIELD] supervisor_initials = AR',
    "[FIELD] sku = Lay's Classic tortilla 12oz",
    '[FIELD] upc = 028400058821',
    '[FIELD] film_lot = FLM-44821-A',
    '[FIELD] case_lot = CS-77102-B',
    '[FIELD] run_start_time = 06:12',
    '[FIELD] run_end_time = 13:58',
    '[FIELD] machine_speed_fpm = 42 (nominal band 38–45)',
    '[FIELD] nitrogen_flush_o2_pct = 1.7 (max 2.5)',
    '[FIELD] target_bag_weight_g = 452.0',
    '[FIELD] mean_bag_weight_g = 451.6',
    '[FIELD] air_fill_visual = Pass',
    '[FIELD] seal_bar_temp_set_C = 168',
    '[FIELD] seal_pressure_bar = 2.4',
  ];
}

/** Checklist / disposition — depends on Go vs No-Go (and lens). */
export function getOutcomeFieldLines(classification, operatorRole) {
  const lens = lensKey(operatorRole);

  if (lens === 'manager') {
    if (classification === 'no_go') {
      return [
        '[READ] zone = disposition / severity',
        '[FIELD] nc_category = Package integrity · seal / leaker',
        '[FIELD] severity = Grade-2 (regional visibility)',
        '[FIELD] hold_reason = Seal band intermittent fail (bubble test)',
        '[FIELD] disposition = HOLD · regional review required',
        '[CHECK] release_gate = NO-GO',
      ];
    }
    return [
      '[READ] zone = disposition',
      '[FIELD] disposition = RELEASE OK · regional acknowledgment on file',
      '[FIELD] compliance_notes = No open CAPA on this SKU window',
      '[CHECK] release_gate = GO',
    ];
  }

  if (lens === 'processing') {
    if (classification === 'no_go') {
      return [
        '[READ] zone = packaging handoff checklist',
        '[ROW] metal_detection = GO',
        '[ROW] packaging_handoff_temp = NO-GO (dwell 6 min vs spec 8–12 min to case)',
        '[ROW] coder_verification = GO',
        '[FIELD] deviation_notes = Case zone temp drift during changeover',
        '[CHECK] process_release = NO-GO',
      ];
    }
    return [
      '[READ] zone = packaging handoff checklist',
      '[ROW] metal_detection = GO',
      '[ROW] packaging_handoff_temp = GO (dwell 10 min in spec)',
      '[ROW] coder_verification = GO',
      '[CHECK] process_release = GO',
    ];
  }

  // packaging (default)
  if (classification === 'no_go') {
    return [
      '[READ] zone = package-quality checklist (rows 1–6)',
      '[ROW] seal_integrity = NO-GO · bubble test lanes 2–3 intermittent leaker',
      '[ROW] package_appearance = GO',
      '[ROW] product_in_bag = GO',
      '[ROW] film_registration = GO',
      '[ROW] date_code_legible = GO',
      '[ROW] case_count_verification = GO',
      '[FIELD] qa_comment = Hold lot CS-77102-B pending seal rework',
      '[CHECK] packaging_release = NO-GO',
    ];
  }

  return [
    '[READ] zone = package-quality checklist (rows 1–6)',
    '[ROW] seal_integrity = GO',
    '[ROW] package_appearance = GO',
    '[ROW] product_in_bag = GO',
    '[ROW] film_registration = GO',
    '[ROW] date_code_legible = GO',
    '[ROW] case_count_verification = GO',
    '[FIELD] qa_comment = None · run within control limits',
    '[CHECK] packaging_release = GO',
  ];
}

/** When filename does not hint outcome: neutral “still reading” lines before API returns. */
export function getAmbiguousScanTailLines() {
  return [
    '[READ] zone = checklist band · row detection in progress…',
    '[OCR] Averaging row baselines · 6 checklist rows found',
    '[WAIT] Need classifier to lock GO / NO-GO column marks',
  ];
}

export function getClassifierEchoLines(res, filenameGuess) {
  const method = typeof res?.method === 'string' ? res.method : 'rules+demo';
  const c = res?.classification === 'no_go' ? 'no_go' : 'go';
  const confRaw = res?.confidence;
  const conf =
    typeof confRaw === 'number' && Number.isFinite(confRaw)
      ? confRaw.toFixed(2)
      : typeof confRaw === 'string'
        ? confRaw
        : 'high';
  const lines = [
    `[CLASSIFIER] method=${method} · outcome=${c.toUpperCase().replace('_', '-')} · confidence=${conf}`,
  ];
  if (filenameGuess && filenameGuess !== c) {
    lines.push(`[NOTE] Filename hint (${filenameGuess}) overridden by server · using ${c}`);
  } else if (filenameGuess) {
    lines.push('[CLASSIFIER] Field read and filename hint aligned with server outcome');
  } else {
    lines.push('[CLASSIFIER] Server outcome applied to checklist interpretation');
  }
  return lines;
}
