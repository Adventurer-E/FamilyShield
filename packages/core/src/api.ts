import type { Rules } from './config';
import type { Cents } from './money';
import type { Reward } from './rewards';
import type { Person, Reason } from './types';

/** Shapes exchanged between the UI and any FamilyShield backend. */

export interface Profile {
  me: Person;
  /** The people in my trusted circle. */
  circle: Person[];
  /** Everyone I may see a name for: my circle plus borrowers who asked me. */
  people: Person[];
  /** The bank account FamilyShield pays into and collects from. */
  account: { id: string; label: string };
}

export interface CreateRequestInput {
  reason: Reason;
  purpose: string;
  amount: Cents;
  months: number;
}

/** The rules and reward catalog the backend is running with. */
export interface AppConfig {
  rules: Rules;
  rewards: Reward[];
}

/** Functional-mockup only: the bank side, so the host app can show balances. */
export interface AccountSummary {
  balance: Cents;
  transactions: Array<{ id: string; at: string; amount: Cents; memo: string }>;
}

/** Functional-mockup only: someone you can switch to in the top bar. */
export interface MockupPerson {
  id: string;
  firstName: string;
  lastName: string;
  accountLabel: string;
}
