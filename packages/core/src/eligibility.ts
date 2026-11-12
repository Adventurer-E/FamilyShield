import { DEFAULT_RULES } from './config';
import type { Rules } from './config';
import type { IsoDate } from './dates';
import { invariant } from './errors';
import { formatMoney } from './money';
import { overdueOf } from './overdue';
import type { Overdue } from './overdue';
import { isOpen } from './selectors';
import type { LoanCase } from './types';

/**
 * What a customer may do right now: start a request, and offer to lend.
 * Each rule that blocks them comes back with a message they can read, so the
 * app can explain it up front, and the backend refuses with the same words.
 */

export type EligibilityCode =
  /** A payment on their own family loan is overdue (C2). */
  | 'overdue'
  /** Already has a request or loan that isn't finished (one at a time). */
  | 'open-loan';

export interface EligibilityBlock {
  code: EligibilityCode;
  /** Written for the customer; shown as is. */
  message: string;
}

export interface Eligibility {
  /** The day these answers are for, in the bank's calendar. */
  today: IsoDate;
  /** True when nothing blocks a new request. */
  eligible: boolean;
  /** Every rule that blocks a new request right now, most important first. */
  blocks: EligibilityBlock[];
  /** Overdue payments on the person's own loan, or null when they're up to date (C2). */
  overdue: Overdue | null;
  /**
   * May they offer to lend to family? Not while their own loan is overdue:
   * they'd be lending money they owe. Declining is always allowed.
   */
  lending: { allowed: true } | { allowed: false; message: string };
}

export interface EligibilityInput {
  /** Today, in the bank's calendar. */
  today: IsoDate;
  /** The person's own requests and loans as borrower, any status. */
  loans: LoanCase[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function checkEligibility(input: EligibilityInput, rules: Rules = DEFAULT_RULES): Eligibility {
  const blocks: EligibilityBlock[] = [];

  const overdue = input.loans.map((l) => overdueOf(l, input.today, rules)).find((o) => o !== null) ?? null;
  if (overdue) {
    const which =
      overdue.installments.length === 1
        ? `Payment ${overdue.installments[0]} on your family loan is`
        : `${overdue.installments.length} payments on your family loan are`;
    blocks.push({ code: 'overdue', message: `${which} late (${plural(overdue.daysLate, 'day')}). Pay ${formatMoney(overdue.amount)} to catch up.` });
  }

  if (input.loans.some(isOpen)) {
    blocks.push({ code: 'open-loan', message: 'You already have an open request or loan. You can ask again once it’s repaid.' });
  }

  return {
    today: input.today,
    eligible: blocks.length === 0,
    blocks,
    overdue,
    lending: overdue
      ? { allowed: false, message: `Catch up on your own family loan first: ${formatMoney(overdue.amount)} is overdue. You can still reply “not this time”.` }
      : { allowed: true },
  };
}

/** Throws NOT_ELIGIBLE with the first block's message. */
export function assertEligible(eligibility: Eligibility): void {
  invariant(eligibility.eligible, 'NOT_ELIGIBLE', eligibility.blocks[0]?.message ?? 'You can’t start a request right now.');
}
