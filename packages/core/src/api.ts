import type { Rules } from './config';
import type { Cents } from './money';
import type { ReasonOption } from './reasons';
import type { Reward } from './rewards';
import type { Person, Reason } from './types';

/** Shapes exchanged between the UI and any FamilyShield backend. */

export interface Profile {
  me: Person;
  /** The people in my trusted circle. */
  circle: Person[];
  /** Everyone I may see a name for: my circle, borrowers who asked me, and everyone asked on my own requests. */
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

/** The rules, request reasons and reward catalog the backend is running with. */
export interface AppConfig {
  rules: Rules;
  reasons: ReasonOption[];
  rewards: Reward[];
}

/** Mockup only: the bank side, so the host app can show balances. */
export interface AccountSummary {
  balance: Cents;
  /** FamilyShield money movements, newest first. These change the balance. */
  transactions: Array<{ id: string; at: string; amount: Cents; memo: string }>;
  /** Everyday bank activity shown under them, for realism only. Not counted in the balance. */
  exampleTransactions: Array<{ id: string; date: string; name: string; category: string; amount: Cents }>;
}

/** Mockup only: the mockup's calendar ("Skip ahead" in the top bar). */
export interface MockupClock {
  /** The date the mockup is on. */
  today: string;
  /** How many days that is ahead of the real date. */
  daysAhead: number;
}

/** Mockup only: someone you can switch to in the top bar. */
export interface MockupPerson {
  id: string;
  firstName: string;
  lastName: string;
  accountLabel: string;
}
