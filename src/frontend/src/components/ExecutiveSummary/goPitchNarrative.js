import { OPERATOR_ROLES } from '../../utils/operatorRole';

/**
 * Pitch-ready Go copy for Executive Summary.
 * Mirrors the No-Go structure: extracted fields -> policy checks -> KPI-positive outcome.
 */
const GO_PITCH_BY_LENS = {
  packaging: {
    title: 'Go — packaging quality release',
    lead:
      'The uploaded job-aid form cleared the packaging release gate. Extracted traceability and package-quality controls matched the active SKU limits for this run, and the KPI posture remains positive across executive metrics.',
    extractionHeading: 'What the read captured',
    extraction:
      'OCR captured machine number, UPC / film code, shift / time window, nitrogen flush O2, bag weight, air-fill checks, and package-quality checklist rows (seal integrity, package appearance, product-in-bag, and coding checks).',
    whyHeading: 'Why this is Go',
    why:
      'All required controls were present, in-range, and marked GO under the active release matrix for this SKU / shift. That confirms release readiness for this packaging run.',
    stepsHeading: 'How the decision was reached',
    steps: [
      'Form-field extraction completed for machine no., UPC / film code, O2, weight, air-fill levels, and package-quality checklist outcomes.',
      'Traceability validation passed: machine and UPC / film-code pairing align with the active run context.',
      'Release-policy validation passed: required numeric bands and mandatory GO controls cleared.',
      'KPI correlation is positive: Quality score, Productivity index, and Wastage remain in favorable bands for this scope.',
      'Decision: Go is issued; the line can continue under normal monitoring cadence.',
    ],
  },
  processing: {
    title: 'Go — process parameter release',
    lead:
      'The submitted operator form cleared the process release gate with packaging-quality checkpoints. Extracted run controls satisfied active limits, and KPI trends remain positive for this scope.',
    extractionHeading: 'What the read captured',
    extraction:
      'OCR detected machine number, UPC / film code, run time context, nitrogen flush O2, weight, air-fill checks, and quality-critical checklist rows from the submitted form image.',
    whyHeading: 'Why this is Go',
    why:
      'Mandatory controls and release confirmations met validated conditions for the SKU / shift window. No blocking deviation was found, so release criteria are satisfied.',
    stepsHeading: 'How the decision was reached',
    steps: [
      'Form extraction parsed required run and quality controls from the job-aid image.',
      'Scope anchoring aligned extracted values with the selected location, plant context, and operator lens.',
      'Policy check passed: release bands and mandatory GO criteria were satisfied.',
      'KPI correlation is positive: Quality score, Productivity index, and Wastage remain in healthy ranges.',
      'Outcome: Go remains active with standard supervisor oversight and routine KPI watch.',
    ],
  },
  manager: {
    title: 'Go — regional quality & compliance clearance',
    lead:
      'Regional compliance view confirms the submitted run cleared release policy. Site-level controls and traceability markers aligned with standards, and KPI posture remains favorable across the selected territory.',
    extractionHeading: 'What the read captured',
    extraction:
      'Structured read captured site, line/run context, machine and code traceability fields, required quality confirmations, and disposition-ready metadata for regional visibility.',
    whyHeading: 'Why this is Go',
    why:
      'The case met required compliance and release criteria for this exception class, so no hold condition is triggered at regional level.',
    stepsHeading: 'How the decision was reached',
    steps: [
      'Document read consolidated operational and quality fields for regional review.',
      'Regional policy check passed with no mandatory hold condition.',
      'KPI alignment is positive: quality and throughput indicators stay favorable while loss pressure remains controlled.',
      'Outcome: Go status is retained and standard cross-site monitoring continues.',
    ],
  },
};

export function getGoPitchNarrative(operatorRole) {
  const lens =
    operatorRole === OPERATOR_ROLES.processing
      ? 'processing'
      : operatorRole === OPERATOR_ROLES.manager
        ? 'manager'
        : 'packaging';

  return GO_PITCH_BY_LENS[lens];
}
