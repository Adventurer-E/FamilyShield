import { createMockBackend } from '@familyshield/sdk/mock';

/**
 * Stands in for both the FamilyShield service and BlueRiver's core banking
 * ledger. Persisted to localStorage so the "WebView" iframe (a separate page
 * on the same origin) shares the same family and loans.
 */
export const backend = createMockBackend({ storageKey: 'familyshield-demo-v1' });

export const DEMO_USERS = [
  { id: 'alex', label: 'Alex Chen', role: 'borrower' },
  { id: 'mom', label: 'Grace Chen (Mom)', role: 'lender' },
] as const;

export type DemoUserId = (typeof DEMO_USERS)[number]['id'];
