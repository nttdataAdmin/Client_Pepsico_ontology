/**
 * Demo master users — password shared for staging demos.
 * Each account maps to an operator lens (processing, packaging, or supervisor/manager).
 * Site / state is chosen on Executive summary (no default location on login).
 */
export const DEMO_AUTH_PASSWORD = 'PepsiCo#2026';

export const DEMO_USERS = [
  {
    email: 'processor_admin@pepsico.com',
    password: DEMO_AUTH_PASSWORD,
    displayName: 'Processing Admin',
    accountRole: 'line_admin',
    operatorRole: 'processing',
  },
  {
    email: 'packaging_admin@pepsico.com',
    password: DEMO_AUTH_PASSWORD,
    displayName: 'Packaging Admin',
    accountRole: 'line_admin',
    operatorRole: 'packaging',
  },
  {
    email: 'manager_grade2@pepsico.com',
    password: DEMO_AUTH_PASSWORD,
    displayName: 'Regional Manager (Grade 2)',
    accountRole: 'manager',
    operatorRole: 'manager',
  },
];

export function authenticateDemoUser(emailRaw, password) {
  const email = String(emailRaw || '')
    .trim()
    .toLowerCase();
  const rec = DEMO_USERS.find((u) => u.email.toLowerCase() === email);
  if (!rec || rec.password !== password) return null;
  return {
    username: rec.displayName,
    email: rec.email,
    accountRole: rec.accountRole,
    operatorRole: rec.operatorRole,
  };
}

export function demoLoginHintLines() {
  return DEMO_USERS.map((u) => `${u.email} / ${DEMO_AUTH_PASSWORD}`).join(' · ');
}
