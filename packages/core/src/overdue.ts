import { DEFAULT_RULES } from './config';
import type { Rules } from './config';
import { daysBetween } from './dates';
import type { IsoDate } from './dates';
import { sum } from './money';
import type { Cents } from './money';
import type { LoanCase } from './types';

/**
 * Customers who aren't repaying (C2). An installment is overdue when it is
 * still unpaid more than `overdueGraceDays` days after its due date. Paying
 * the oldest unpaid installments clears it: payments always go to the oldest
 * one first (recordPayment).
 */

export interface Overdue {
  /** Installment numbers (1-based) that are overdue, oldest first. */
  installments: number[];
  /** What it takes to catch up: the sum of the overdue installments. */
  amount: Cents;
  /** Due date of the oldest overdue installment. */
  since: IsoDate;
  /** Days since that due date. */
  daysLate: number;
}

/** Overdue installments on an active loan, or null when it's up to date. */
export function overdueOf(loan: LoanCase, today: IsoDate, rules: Rules = DEFAULT_RULES): Overdue | null {
  if (loan.status !== 'active') return null;
  const late = loan.schedule.filter((i) => !i.paidAt && daysBetween(i.dueDate, today) > rules.overdueGraceDays);
  if (late.length === 0) return null;
  const oldest = late[0]!;
  return {
    installments: late.map((i) => i.index + 1),
    amount: sum(late.map((i) => i.amount)),
    since: oldest.dueDate,
    daysLate: daysBetween(oldest.dueDate, today),
  };
}
