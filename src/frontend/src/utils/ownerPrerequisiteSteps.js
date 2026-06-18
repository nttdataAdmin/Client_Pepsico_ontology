import { OPERATOR_ROLES } from './operatorRole';

/**
 * 3–4 owner to-dos before acting on AI recommendations (demo copy, lens-aware).
 */
export function getOwnerPrerequisiteSteps(operatorRole) {
  const lens =
    operatorRole === OPERATOR_ROLES.processing
      ? 'processing'
      : operatorRole === OPERATOR_ROLES.manager
        ? 'manager'
        : 'packaging';

  const common = [
    {
      n: 1,
      text: 'Verify MES run window and line state match the exception you are dispositioning (no silent line change).',
    },
    {
      n: 2,
      text: 'Attach the operator form / film-coding row evidence to the quality ticket so audit trail matches the KPI window.',
    },
    {
      n: 3,
      text: 'Ping the accountable workcenter roles from the CMMS row for this asset before you close the shift record.',
    },
    {
      n: 4,
      text: 'After the above, run the countermeasure steps below and log outcomes in Planned downtime.',
    },
  ];

  if (lens === 'processing') {
    return [
      { n: 1, text: 'Reconcile CCP temperatures and hold-time stamps against the batch record for this window.' },
      { n: 2, text: 'Confirm oil turnover / moisture band readings with lab spot-check before changing setpoints.' },
      { n: 3, text: 'Notify processing + reliability leads per CMMS ownership before releasing the line.' },
      { n: 4, text: 'Then execute the AI steps and document verification in maintenance / quality systems.' },
    ];
  }
  if (lens === 'manager') {
    return [
      { n: 1, text: 'Validate site + severity in the regional rollup matches what the plant reported this shift.' },
      { n: 2, text: 'Ensure the exception category is tagged for compliance reporting (no blank severity).' },
      { n: 3, text: 'Align with site director on resource pull for the corrective window before broadcasting actions.' },
      { n: 4, text: 'Only then cascade the AI countermeasures and track closure in the executive KPI review.' },
    ];
  }
  return common;
}
