/** Processing line (fryer, slicer, seasoning) vs packaging line (palletizer, case equipment, conveyors). */

export const PEPSICO_FLOW_STORAGE_KEY = 'pepsico_flow';

/** Read operator lens from session (matches AppFlowContext persistence). */
export function getSessionOperatorRole() {
  try {
    const raw = sessionStorage.getItem(PEPSICO_FLOW_STORAGE_KEY);
    if (!raw) return 'packaging';
    const o = JSON.parse(raw);
    if (o.operatorRole === 'processing') return 'processing';
    if (o.operatorRole === 'manager') return 'manager';
    return 'packaging';
  } catch {
    return 'packaging';
  }
}

export const OPERATOR_ROLES = {
  processing: 'processing',
  packaging: 'packaging',
  manager: 'manager',
};

export function normalizeOperatorRole(v) {
  if (v === OPERATOR_ROLES.packaging || v === OPERATOR_ROLES.processing || v === OPERATOR_ROLES.manager) return v;
  return null;
}

export function operatorRoleTitle(role) {
  if (role === OPERATOR_ROLES.packaging) return 'Packaging line operator';
  if (role === OPERATOR_ROLES.processing) return 'Processing line operator';
  if (role === OPERATOR_ROLES.manager) return 'Regional supervisor';
  return 'Operator';
}

export function operatorRoleShort(role) {
  if (role === OPERATOR_ROLES.packaging) return 'Packaging lens';
  if (role === OPERATOR_ROLES.processing) return 'Processing lens';
  if (role === OPERATOR_ROLES.manager) return 'Regional supervisor';
  return 'Fleet lens';
}
