import { DEFAULT_RULES } from './config';
import type { Rules } from './config';
import { addDays, formatDate, toIsoDate } from './dates';
import type { IsoDate } from './dates';
import { invariant } from './errors';
import { isOpen } from './selectors';
import type { LoanCase } from './types';

/**
 * Who may start a new request. Each rule that blocks someone comes back with a
 * message they can read, so the app can explain it before they fill in the form,
 * and the backend refuses the request with the same words.
 *
 * The limits are settings (data/settings.csv in the functional mockup), so the
 * bank can tune them without code changes.
 */

export type EligibilityCode =
  /** Already has a request or loan that isn't finished. */
  | 'open-loan'
  /** Fewer people in the trusted circle than `minCircleSize`. */
  | 'small-circle'
  /** Repaid a loan less than `waitDaysAfterRepaid` days ago. */
  | 'waiting-period';

export interface EligibilityBlock {
  code: EligibilityCode;
  /** Written for the customer; shown as is. */
  message: string;
  /** For time-based rules: the first day the block no longer applies. */
  until?: IsoDate;
}

export interface Eligibility {
  /** True when nothing blocks a new request. */
  eligible: boolean;
  /** Every rule that blocks a new request right now, most important first. */
  blocks: EligibilityBlock[];
}

export interface EligibilityInput {
  /** Today, in the bank's calendar. */
  today: IsoDate;
  /** How many people are in the borrower's trusted circle. */
  circleSize: number;
  /** The borrower's own requests and loans, any status. */
  loans: LoanCase[];
}

const people = (n: number) => (n === 1 ? 'one person' : `${n} people`);

export function checkEligibility(input: EligibilityInput, rules: Rules = DEFAULT_RULES): Eligibility {
  const blocks: EligibilityBlock[] = [];
  const { minCircleSize, waitDaysAfterRepaid } = rules.eligibility;

  if (input.loans.some(isOpen)) {
    blocks.push({ code: 'open-loan', message: 'You already have an open request or loan. You can ask again once it’s repaid.' });
  }

  if (input.circleSize < minCircleSize) {
    blocks.push({
      code: 'small-circle',
      message:
        input.circleSize === 0
          ? `Add at least ${people(minCircleSize)} to your trusted circle before asking for support.`
          : `Add at least ${people(minCircleSize)} to your trusted circle before asking for support. You have ${input.circleSize} so far.`,
    });
  }

  const lastRepaid = input.loans
    .filter((l) => l.status === 'repaid' && l.repaidAt)
    .map((l) => toIsoDate(l.repaidAt!))
    .sort()
    .at(-1);
  if (lastRepaid && waitDaysAfterRepaid > 0) {
    const until = addDays(lastRepaid, waitDaysAfterRepaid);
    if (input.today < until) {
      blocks.push({
        code: 'waiting-period',
        until,
        message: `You can ask your circle again from ${formatDate(until)}, ${waitDaysAfterRepaid} days after your last loan was repaid.`,
      });
    }
  }

  return { eligible: blocks.length === 0, blocks };
}

/** Throws NOT_ELIGIBLE with the first block's message. */
export function assertEligible(eligibility: Eligibility): void {
  invariant(eligibility.eligible, 'NOT_ELIGIBLE', eligibility.blocks[0]?.message ?? 'You can’t start a request right now.');
}
