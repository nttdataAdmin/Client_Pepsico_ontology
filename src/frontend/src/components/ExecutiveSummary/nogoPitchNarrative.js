import { OPERATOR_ROLES } from '../../utils/operatorRole';

/**
 * Pitch-ready No-Go copy for Executive Summary only — reads like OCR + policy gate,
 * scoped by signed-in lens (packaging / processing / regional supervisor).
 */
const NO_GO_PITCH_BY_LENS = {
  packaging: {
    title: 'No-Go — packaging quality gate',
    lead:
      'The uploaded job-aid form was read through the packaging quality gate model. Key traceability and release-control fields were extracted from the scan, matched to active SKU limits, and correlated with executive KPI movement. The gate stays closed because one or more packaging controls did not clear for this run.',
    extractionHeading: 'What the read captured',
    extraction:
      'OCR captured machine number, UPC / film code, shift / time context, nitrogen flush O2, bag weight, air-fill checks, and package-quality checklist rows (seal integrity, package appearance, product-in-bag, date / code checks).',
    whyHeading: 'Why this is a No-Go',
    why:
      'One or more packaging controls from the scanned form did not satisfy validated limits or required GO confirmations for this SKU / shift window. Policy treats that as a failed release gate: product cannot move forward until corrective action and supervisor sign-off are completed.',
    stepsHeading: 'How the decision was reached',
    steps: [
      'Form-field extraction: machine no., UPC / film code, nitrogen O2, weight, air-fill levels, and package-quality checklist outcomes were read from the submitted job aid.',
      'Traceability validation: machine and UPC / film-code pairing were checked against the active packaging run context for this location and operator lens.',
      'Release-policy validation: numeric bands and GO / NO-GO checklist requirements were evaluated against the approved SKU limits.',
      'KPI correlation: failed packaging checks raise expected risk on Quality score, Productivity index, and Wastage (rework / hold / scrap pressure).',
      'Decision: No-Go is issued because required release controls did not clear; production remains on controlled hold until correction and sign-off.',
    ],
  },
  processing: {
    title: 'No-Go — process parameter gate',
    lead:
      'The submitted operator job-aid form was ingested through the process read path with packaging quality checkpoints. Extracted run fields and control rows were validated against active recipe / release criteria, then correlated to executive KPIs. The engine returned No-Go because mandatory controls did not fully clear.',
    extractionHeading: 'What the read captured',
    extraction:
      'OCR and field detection captured machine number, UPC / film code, shift / time, nitrogen flush O2, weight, air-fill checks, and quality-critical checklist rows from the form image.',
    whyHeading: 'Why this is a No-Go',
    why:
      'At least one required control (numeric band or mandatory GO confirmation) fell outside validated release conditions for this SKU / shift. Policy therefore blocks release and keeps the run on hold until deviation disposition and supervisor workflow completion.',
    stepsHeading: 'How the decision was reached',
    steps: [
      'Form-field extraction: machine no., UPC / film code, O2, weight, air-fill values, and quality checklist outcomes were parsed from the job-aid image.',
      'Scope anchoring: extracted fields were tied to the selected location, plant context, and active operator role before evaluation.',
      'Policy check: each required control was compared to release limits and mandatory GO criteria for the run.',
      'KPI impact correlation: failed controls increase expected pressure on Quality score, Productivity index, and Wastage in this scope.',
      'Outcome: No-Go remains active because one or more mandatory controls did not clear; production stays on hold until corrective action is recorded.',
    ],
  },
  manager: {
    title: 'No-Go — regional quality & compliance hold',
    lead:
      'The submitted form was evaluated at the regional compliance layer. The read summarizes site, line, severity, and non-conformance category so Grade 2 supervisors can see why the gate did not clear without drilling into operator-level fields first.',
    extractionHeading: 'What the read captured',
    extraction:
      'Structured extraction identified site and line designation, run window, non-conformance category, severity flag, and the responsible work-center block from the form image.',
    whyHeading: 'Why this is a No-Go',
    why:
      'Corporate release policy for this exception class requires a documented hold at regional visibility until disposition is aligned with the site. The gate therefore remains No-Go until supervisor acknowledgment and any required cross-functional sign-off are complete.',
    stepsHeading: 'How the decision was reached',
    steps: [
      'Document read: exception metadata and severity were parsed from the scan and placed in the regional exception view.',
      'Policy check: the case was matched to the quality & compliance band that mandates a regional hold for this category.',
      'Outcome: the gate failed under regional policy — the site cannot return to standard dispatch in the dashboard until the hold path is completed.',
    ],
  },
};

export function getNoGoPitchNarrative(operatorRole) {
  const lens =
    operatorRole === OPERATOR_ROLES.processing
      ? 'processing'
      : operatorRole === OPERATOR_ROLES.manager
        ? 'manager'
        : 'packaging';

  return NO_GO_PITCH_BY_LENS[lens];
}
