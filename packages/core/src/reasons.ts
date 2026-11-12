import type { Reason } from './types';

/**
 * The "What happened?" choices on the request screen, each with the
 * description it pre-fills. In the mockup they come from
 * data/reasons.csv; this list is the default.
 */
export interface ReasonOption {
  id: Reason;
  label: string;
  /** Pre-filled description; the borrower can rewrite it. */
  template: string;
}

export const DEFAULT_REASONS: readonly ReasonOption[] = [
  { id: 'car', label: 'Car repair', template: 'My car broke down and I need it to get to work. The shop can fix it this week if I pay upfront.' },
  { id: 'medical', label: 'Medical bill', template: 'An urgent-care visit left a bill my insurance didn’t fully cover, and it’s due this month.' },
  { id: 'job', label: 'Job loss', template: 'I was laid off and need help covering rent and essentials while I look for a new job.' },
  { id: 'other', label: 'Something else', template: 'An unexpected expense came up and I need a short bridge until my next paychecks.' },
];
