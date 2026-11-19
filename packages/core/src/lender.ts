import { DEFAULT_RULES } from './config';
import type { Rules } from './config';
import type { IsoDate } from './dates';
import { sum } from './money';
import type { Cents } from './money';
import { overdueOf } from './overdue';
import type { Agreement, LoanCase, Offer, PersonId } from './types';

/**
 * The lender home (B2): everything one person is doing as a lender, split into
 * requests waiting for their answer, offers they made, and agreements they signed.
 *
 * Works on loans as a lender receives them (redactForLender) as well as on full
 * loans: every amount here is this lender's own share only.
 */

/** What a lender needs to do on a loan, if anything. */
export type LenderAction = 'reply' | 'sign' | 'pause';

export function lenderAction(loan: LoanCase, lenderId: PersonId): LenderAction | null {
  if (loan.status === 'collecting') {
    return loan.offers.find((o) => o.memberId === lenderId)?.status === 'pending' ? 'reply' : null;
  }
  const agreement = loan.agreements.find((a) => a.lenderId === lenderId);
  if (!agreement) return null;
  if (loan.status === 'signing') return agreement.lenderSignedAt ? null : 'sign';
  if (loan.status === 'active' && loan.pause?.status === 'pending' && loan.pause.approvals[lenderId] === null) return 'pause';
  return null;
}

/**
 * Where an offer I made stands, once I've answered and before there's an agreement:
 * - waiting: the request is still open and the borrower hasn't chosen yet
 * - accepted: the borrower accepted it; the agreement comes once they sign
 * - not-taken: the borrower went ahead without it, and nothing was signed
 * - declined: I said "not this time"
 * - closed: the request closed before I answered
 */
export type LenderOfferState = 'waiting' | 'accepted' | 'not-taken' | 'declined' | 'closed';

export interface LenderOfferItem {
  loan: LoanCase;
  offer: Offer;
  state: LenderOfferState;
}

/**
 * - to-sign: the agreement is waiting for my signature
 * - signed: I signed; waiting for the others before the money moves
 * - repaying: money moved; repayments are coming in on time
 * - late: a repayment to me is overdue (C2)
 * - repaid: every repayment to me has arrived
 */
export type LenderAgreementState = 'to-sign' | 'signed' | 'repaying' | 'late' | 'repaid';

export interface LenderAgreementItem {
  loan: LoanCase;
  agreement: Agreement;
  state: LenderAgreementState;
  /** 'sign' or 'pause' when the agreement needs my answer. */
  action: LenderAction | null;
  lent: Cents;
  received: Cents;
  outstanding: Cents;
  /** 0–1 */
  progress: number;
  /** My share of the next unpaid installment. */
  next: { amount: Cents; dueDate: IsoDate } | null;
  /** My share of what is overdue, and since when. */
  late: { amount: Cents; since: IsoDate } | null;
}

export interface LenderHomeView {
  /** Open requests waiting for my answer. */
  requests: LoanCase[];
  /** Offers I answered that never became an agreement. */
  offers: LenderOfferItem[];
  /** Agreements I'm part of: ones that need me first, then late, repaying, signed and repaid. */
  agreements: LenderAgreementItem[];
  /** Across agreements where the money has moved (active or repaid). */
  totals: { lent: Cents; received: Cents; outstanding: Cents; count: number };
}

const AGREEMENT_ORDER: Record<LenderAgreementState, number> = { 'to-sign': 0, late: 1, repaying: 2, signed: 3, repaid: 4 };

function myShare(loan: LoanCase, lenderId: PersonId, installments: LoanCase['schedule']): Cents {
  return sum(installments.flatMap((i) => i.parts.filter((p) => p.to === lenderId).map((p) => p.amount)));
}

function agreementItem(loan: LoanCase, agreement: Agreement, lenderId: PersonId, today: IsoDate, rules: Rules): LenderAgreementItem {
  const parts = loan.schedule.flatMap((i) => i.parts.filter((p) => p.to === lenderId).map((p) => ({ amount: p.amount, paid: !!i.paidAt })));
  const received = sum(parts.filter((p) => p.paid).map((p) => p.amount));
  const lent = agreement.principal;
  const moneyMoved = loan.status === 'active' || loan.status === 'repaid';

  const nextInstallment = moneyMoved ? loan.schedule.find((i) => !i.paidAt && i.parts.some((p) => p.to === lenderId)) : undefined;
  const overdue = overdueOf(loan, today, rules);
  const lateInstallments = overdue ? loan.schedule.filter((i) => overdue.installments.includes(i.index + 1)) : [];
  const lateAmount = myShare(loan, lenderId, lateInstallments);

  let state: LenderAgreementState;
  if (loan.status === 'signing') state = agreement.lenderSignedAt ? 'signed' : 'to-sign';
  else if (loan.status === 'repaid' || (moneyMoved && received >= lent && lent > 0)) state = 'repaid';
  else if (overdue && lateAmount > 0) state = 'late';
  else state = 'repaying';

  return {
    loan,
    agreement,
    state,
    action: lenderAction(loan, lenderId),
    lent,
    received,
    outstanding: Math.max(0, lent - received),
    progress: lent === 0 ? 0 : Math.min(1, received / lent),
    next: nextInstallment ? { amount: myShare(loan, lenderId, [nextInstallment]), dueDate: nextInstallment.dueDate } : null,
    late: state === 'late' && overdue ? { amount: lateAmount, since: overdue.since } : null,
  };
}

function offerState(loan: LoanCase, offer: Offer): LenderOfferState {
  if (offer.status === 'declined') return 'declined';
  if (offer.status === 'offered') {
    if (loan.status === 'collecting') return offer.accepted ? 'accepted' : 'waiting';
    return 'not-taken';
  }
  return 'closed';
}

/** Sorts the loans I was asked about into the three sections of the lender home. */
export function lenderHome(incoming: LoanCase[], lenderId: PersonId, today: IsoDate, rules: Rules = DEFAULT_RULES): LenderHomeView {
  const requests: LoanCase[] = [];
  const offers: LenderOfferItem[] = [];
  const agreements: LenderAgreementItem[] = [];

  for (const loan of incoming) {
    if (loan.status === 'cancelled' || loan.borrowerId === lenderId) continue;
    const agreement = loan.agreements.find((a) => a.lenderId === lenderId);
    if (agreement) {
      agreements.push(agreementItem(loan, agreement, lenderId, today, rules));
      continue;
    }
    const offer = loan.offers.find((o) => o.memberId === lenderId);
    if (!offer) continue;
    if (lenderAction(loan, lenderId) === 'reply') requests.push(loan);
    else offers.push({ loan, offer, state: offerState(loan, offer) });
  }

  // Anything that needs me first; otherwise keep the incoming order (newest first).
  agreements.sort((a, b) => Number(!!b.action) - Number(!!a.action) || AGREEMENT_ORDER[a.state] - AGREEMENT_ORDER[b.state]);

  const funded = agreements.filter((a) => a.loan.status === 'active' || a.loan.status === 'repaid');
  const lent = sum(funded.map((a) => a.lent));
  const received = sum(funded.map((a) => a.received));
  return { requests, offers, agreements, totals: { lent, received, outstanding: Math.max(0, lent - received), count: funded.length } };
}
