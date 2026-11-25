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

/** The longest reason a borrower can write in their own words. */
export const CUSTOM_REASON_MAX = 40;

/** Chip text for writing your own reason. Built in, not a row in reasons.csv. */
export const CUSTOM_REASON_CHIP = 'Write my own';

/**
 * The tag shown for a loan's reason: the borrower's own words for a custom
 * reason, otherwise the label from reasons.csv (falling back to the built-in
 * label if that row was since removed). The bank dashboard passes
 * `hideOwnWords` because the bank doesn't see what a request was for in the
 * borrower's words.
 */
export function reasonLabelOf(
  loan: { reason: Reason; reasonLabel?: string },
  reasons: readonly ReasonOption[] = DEFAULT_REASONS,
  options: { hideOwnWords?: boolean } = {},
): string {
  if (loan.reason === 'custom') return options.hideOwnWords ? 'Own reason' : loan.reasonLabel?.trim() || 'Own reason';
  return (
    reasons.find((r) => r.id === loan.reason)?.label ?? DEFAULT_REASONS.find((r) => r.id === loan.reason)?.label ?? loan.reason
  );
}
