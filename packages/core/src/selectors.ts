import { sum } from './money';
import type { Cents } from './money';
import type { LoanCase, PersonId } from './types';

/** Read-only views over a LoanCase, shared by every UI and the backend. */

export interface RepaymentSummary {
  principal: Cents;
  fee: Cents;
  /** principal + fee: what the borrower repays in total */
  total: Cents;
  paid: Cents;
  remaining: Cents;
  paymentsMade: number;
  paymentsTotal: number;
  /** 0–1 */
  progress: number;
}

export function repaymentSummary(loan: LoanCase): RepaymentSummary {
  const principal = sum(loan.agreements.map((a) => a.principal));
  const fee = sum(loan.agreements.map((a) => a.fee));
  const total = principal + fee;
  const paidInstallments = loan.schedule.filter((i) => i.paidAt);
  const paid = sum(paidInstallments.map((i) => i.amount));
  return {
    principal,
    fee,
    total,
    paid,
    remaining: total - paid,
    paymentsMade: paidInstallments.length,
    paymentsTotal: loan.schedule.length,
    progress: total === 0 ? 0 : paid / total,
  };
}

/** What one lender has lent, and has been repaid so far. */
export function lenderSummary(loan: LoanCase, lenderId: PersonId) {
  const agreement = loan.agreements.find((a) => a.lenderId === lenderId);
  const parts = loan.schedule.flatMap((i) => i.parts.filter((p) => p.to === lenderId).map((p) => ({ ...p, paid: !!i.paidAt })));
  const received = sum(parts.filter((p) => p.paid).map((p) => p.amount));
  const lent = agreement?.principal ?? 0;
  return { agreement, lent, received, outstanding: lent - received, progress: lent === 0 ? 0 : received / lent };
}

export function offeredTotal(loan: LoanCase): Cents {
  return sum(loan.offers.filter((o) => o.status === 'offered').map((o) => o.amount));
}

/** Estimated monthly payment, fee included, for a request that isn't signed yet. */
export function estimateMonthly(amount: Cents, months: number, feeRate: number): Cents {
  return Math.ceil((amount + Math.round(amount * feeRate)) / months);
}

export function isOpen(loan: LoanCase): boolean {
  return loan.status === 'collecting' || loan.status === 'signing' || loan.status === 'active';
}
