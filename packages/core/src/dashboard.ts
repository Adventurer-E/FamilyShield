import { DEFAULT_RULES } from './config';
import type { Rules } from './config';
import type { IsoDate, IsoTimestamp } from './dates';
import { sum } from './money';
import type { Cents } from './money';
import { overdueOf } from './overdue';
import { nextInstallment } from './loan';
import type { LoanCase, LoanStatus, PersonId, Reason } from './types';

/**
 * The partner bank's view of FamilyShield (C3): activity and risk figures for
 * bank staff, computed from every loan. Customers see none of this.
 *
 * Privacy: the bank sees its own customers' names, amounts, status and
 * payment history, but not what a request was for (the borrower's words) or
 * the notes family members wrote to each other.
 */

export interface DashboardLoan {
  loanId: string;
  borrowerId: PersonId;
  borrowerName: string;
  status: LoanStatus;
  reason: Reason;
  createdAt: IsoTimestamp;
  /** What the borrower asked for. */
  requested: Cents;
  /** What family lent (signed agreements). 0 until funded. */
  funded: Cents;
  /** Lenders on the loan once signed; people asked before that. */
  people: number;
  /** Repaid so far, fee included, and the total to repay. */
  paid: Cents;
  total: Cents;
  nextDue?: IsoDate;
  /** Set when a payment is overdue. */
  overdue?: { amount: Cents; installments: number[]; since: IsoDate; daysLate: number };
}

export interface BankDashboard {
  /** The date the figures are for. */
  asOf: IsoDate;
  customers: {
    /** Customers who have asked for a loan. */
    borrowers: number;
    /** Customers who have lent on a funded loan. */
    lenders: number;
    /** Customers with an overdue payment, who can't offer to lend until they catch up. */
    restricted: number;
  };
  requests: {
    total: number;
    byStatus: Record<LoanStatus, number>;
  };
  money: {
    /** Asked for on requests that weren't cancelled. */
    requested: Cents;
    /** Lent by family on signed loans. */
    funded: Cents;
    /** Paid back to lenders so far. */
    repaidToLenders: Cents;
    /** Still owed to lenders on active loans. */
    outstanding: Cents;
    /** Service fees collected so far. */
    feesCollected: Cents;
    /** Service fees on all signed loans, collected or not. */
    feesContracted: Cents;
  };
  payments: {
    made: number;
    onTime: number;
    late: number;
    /** onTime / made, or null before the first payment. */
    onTimeRate: number | null;
  };
  overdue: {
    loans: number;
    /** What it takes for every overdue borrower to catch up. */
    amount: Cents;
    /** Owed to lenders on the overdue loans (their outstanding principal). */
    atRisk: Cents;
  };
  /** Every request that wasn't cancelled: overdue first (most days late first), then newest first. */
  loans: DashboardLoan[];
}

export interface DashboardInput {
  today: IsoDate;
  loans: LoanCase[];
  /** Display names for borrowers, by person id. */
  names: Record<PersonId, string>;
}

const STATUSES: LoanStatus[] = ['collecting', 'signing', 'active', 'repaid', 'cancelled'];

export function bankDashboard(input: DashboardInput, rules: Rules = DEFAULT_RULES): BankDashboard {
  const live = input.loans.filter((l) => l.status !== 'cancelled');
  const funded = live.filter((l) => l.fundedAt);
  const paidInstallments = funded.flatMap((l) => l.schedule.filter((i) => i.paidAt));
  const lenderParts = (l: LoanCase, paidOnly: boolean) =>
    l.schedule.filter((i) => !paidOnly || i.paidAt).flatMap((i) => i.parts.filter((p) => p.to !== 'fee'));
  const feeParts = (l: LoanCase) => l.schedule.filter((i) => i.paidAt).flatMap((i) => i.parts.filter((p) => p.to === 'fee'));
  const principal = (l: LoanCase) => sum(l.agreements.map((a) => a.principal));
  const repaidToLenders = (l: LoanCase) => sum(lenderParts(l, true).map((p) => p.amount));

  const rows: DashboardLoan[] = live.map((l) => {
    const o = overdueOf(l, input.today, rules);
    const total = sum(l.agreements.map((a) => a.total));
    return {
      loanId: l.id,
      borrowerId: l.borrowerId,
      borrowerName: input.names[l.borrowerId] ?? l.borrowerId,
      status: l.status,
      reason: l.reason,
      createdAt: l.createdAt,
      requested: l.amount,
      funded: l.fundedAt ? principal(l) : 0,
      people: l.agreements.length || l.offers.length,
      paid: sum(l.schedule.filter((i) => i.paidAt).map((i) => i.amount)),
      total,
      ...(l.status === 'active' && nextInstallment(l) ? { nextDue: nextInstallment(l)!.dueDate } : {}),
      ...(o ? { overdue: { amount: o.amount, installments: o.installments, since: o.since, daysLate: o.daysLate } } : {}),
    };
  });
  rows.sort((a, b) => (b.overdue?.daysLate ?? -1) - (a.overdue?.daysLate ?? -1) || b.createdAt.localeCompare(a.createdAt));

  const overdueRows = rows.filter((r) => r.overdue);
  const overdueLoans = funded.filter((l) => overdueRows.some((r) => r.loanId === l.id));
  const onTime = paidInstallments.filter((i) => i.onTime).length;

  return {
    asOf: input.today,
    customers: {
      borrowers: new Set(live.map((l) => l.borrowerId)).size,
      lenders: new Set(funded.flatMap((l) => l.agreements.map((a) => a.lenderId))).size,
      restricted: new Set(overdueRows.map((r) => r.borrowerId)).size,
    },
    requests: {
      total: input.loans.length,
      byStatus: Object.fromEntries(STATUSES.map((s) => [s, input.loans.filter((l) => l.status === s).length])) as Record<LoanStatus, number>,
    },
    money: {
      requested: sum(live.map((l) => l.amount)),
      funded: sum(funded.map(principal)),
      repaidToLenders: sum(funded.map(repaidToLenders)),
      outstanding: sum(funded.filter((l) => l.status === 'active').map((l) => principal(l) - repaidToLenders(l))),
      feesCollected: sum(funded.flatMap(feeParts).map((p) => p.amount)),
      feesContracted: sum(funded.flatMap((l) => l.agreements.map((a) => a.fee))),
    },
    payments: {
      made: paidInstallments.length,
      onTime,
      late: paidInstallments.length - onTime,
      onTimeRate: paidInstallments.length ? onTime / paidInstallments.length : null,
    },
    overdue: {
      loans: overdueRows.length,
      amount: sum(overdueRows.map((r) => r.overdue!.amount)),
      atRisk: sum(overdueLoans.map((l) => principal(l) - repaidToLenders(l))),
    },
    loans: rows,
  };
}
