import { inferFl5883ScanKey } from '../components/FormUpload/extractionLogTemplates';

function checklistRow(id, label, enteredValue, columnMark) {
  return {
    row_id: id,
    label,
    entered_value: enteredValue,
    column_mark: columnMark,
    confidence: 'high',
  };
}

/** Nested payload for the “Extracted Data (JSON)” panel — matches go.png / nogo.png demo scans. */
export function buildFl5883ExtractedPayload({
  scanKey: scanKeyIn,
  classification,
  sourceFilename,
  formClassifyMeta,
}) {
  const scanKey =
    scanKeyIn || (sourceFilename ? inferFl5883ScanKey(sourceFilename) : null) || (classification === 'no_go' ? 'nogo' : 'go');

  const isNogo = scanKey === 'nogo';

  const document = {
    title: 'JOB AID for PACKAGE QUALITY & REGULATORY CERTIFICATION / WEAKLINK',
    issuer: 'Frito-Lay',
    form_id: 'FL-5883',
    revision: 'Rev. 1/2017',
    source_file: sourceFilename || (isNogo ? 'nogo.png' : 'go.png'),
    classification_outcome: classification === 'no_go' ? 'no_go' : 'go',
    extraction_mode: 'demo_static_matching_upload',
    page_count: 1,
  };

  const production_fields = isNogo
    ? {
        date: '08/04/26',
        shift: 'C',
        time: '17:15',
        machine_no: 'M-7',
        nitrogen_flush_pct_oxygen: '1.8% O2',
        allergen_matrix_wet_dry: null,
        product: null,
        flavor: null,
        weight_oz_gm: '30 g',
        weight_unit_circled: 'gm',
        air_fill_level_1: 'GO',
        air_fill_level_2: 'GO',
        upc_film_code: '8901234567890',
      }
    : {
        date: '06/04/26',
        shift: 'A',
        time: '14:30',
        machine_no: 'M12',
        nitrogen_flush_pct_oxygen: '1.5% O2',
        allergen_matrix_wet_dry: null,
        product: null,
        flavor: null,
        weight_oz_gm: '28 g',
        weight_unit_circled: 'gm',
        air_fill_level_1: 'GO',
        air_fill_level_2: 'GO',
        upc_film_code: '8901234567890',
      };

  const scenario_flags = isNogo
    ? {
        startup: false,
        change_over: false,
        shift_change: false,
        bag_size_only: false,
      }
    : {
        startup: false,
        shift_change: false,
        change_over: false,
        bag_size_only: false,
      };

  const quality_checklist = isNogo
    ? [
        checklistRow('first_5_bags', 'First 5 bags reviewed for mixed product', 'N/A', '—'),
        checklistRow('psm', 'PSM completed?', 'NO', 'NO'),
        checklistRow('blocker_sock', 'Blocker/Sock in place and working correctly?', 'NO', 'NO'),
        checklistRow('expiration', 'Expiration date / Price', '12/10/2026 / (blank)', 'NO-GO'),
        checklistRow('julian', 'Day/Plant/Shift/Julian code', '098B3', 'NO-GO'),
        checklistRow('solvent_odor', 'Material solvent odor?', 'NO-GO', 'NO-GO'),
        checklistRow('product_taste', 'Product tasted / correct product in bag?', 'NO-GO', 'NO-GO'),
        checklistRow('tape_case_dates', 'Tape date / Case label date', '08/04/26 / 08/04/26', 'NO-GO'),
        checklistRow('canadian_week', 'Canadian made week of date', '(blank)', 'NO-GO'),
        checklistRow('package_appearance', 'Package appearance', '(see form)', 'RTA/RA'),
        checklistRow('seal_integrity', 'Seal integrity', '(see form)', 'RTA/RA'),
        checklistRow('case_count', 'Case count', '(see form)', 'RTA/RA'),
      ]
    : [
        checklistRow('first_5_bags', 'First 5 bags reviewed for mixed product', 'N/A', 'NO-GO'),
        checklistRow('psm', 'PSM completed?', 'YES', 'NO'),
        checklistRow('blocker_sock', 'Blocker/Sock in place and working correctly?', 'YES', 'NO'),
        checklistRow('expiration', 'Expiration date / Price', '12/10/2026 / (blank)', 'NO-GO'),
        checklistRow('julian', 'Day/Plant/Shift/Julian code', '098B3', 'NO-GO'),
        checklistRow('solvent_odor', 'Material solvent odor?', 'GO', 'NO-GO'),
        checklistRow('product_taste', 'Product tasted / correct product in bag?', 'GO', 'NO-GO'),
        checklistRow('tape_case_dates', 'Tape date / Case label date', '06/04/26 / 06/04/26', 'NO-GO'),
        checklistRow('canadian_week', 'Canadian made week of date', '(blank)', 'NO-GO'),
        checklistRow('package_appearance', 'Package appearance', '(see form)', 'NO-GO'),
        checklistRow('seal_integrity', 'Seal integrity', '(see form)', 'NO-GO'),
        checklistRow('case_count', 'Case count', '(see form)', 'GO'),
      ];

  const notes = {
    margin_handwritten: isNogo ? "Approver Q's (bracket at last three rows)" : 'Approver Qs (bracket at package / seal / case count)',
  };

  const signatures = {
    initial_verification: null,
    final_verification: null,
  };

  const classifier = formClassifyMeta
    ? {
        method: formClassifyMeta.method ?? null,
        confidence: formClassifyMeta.confidence ?? null,
        breakdown: formClassifyMeta.breakdown ?? [],
        extraction_summary: formClassifyMeta.extraction_summary || null,
        why_no_go: formClassifyMeta.why_no_go || null,
      }
    : {};

  return {
    document,
    scenario_flags,
    production_fields,
    quality_checklist,
    notes,
    signatures,
    classifier,
  };
}

export function flattenPayloadForTable(obj, prefix = '') {
  const rows = [];
  if (obj === null || obj === undefined) {
    rows.push({ path: prefix || '(root)', value: String(obj) });
    return rows;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    rows.push({
      path: prefix || '(root)',
      value: typeof obj === 'object' ? JSON.stringify(obj) : String(obj),
    });
    return rows;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      rows.push(...flattenPayloadForTable(v, p));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          rows.push(...flattenPayloadForTable(item, `${p}[${i}]`));
        } else {
          rows.push({ path: `${p}[${i}]`, value: String(item) });
        }
      });
    } else {
      rows.push({ path: p, value: v === null || v === undefined ? '' : String(v) });
    }
  }
  return rows;
}
