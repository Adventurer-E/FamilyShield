import { DEFAULT_RULES, feeFor } from './config';
import type { Rules } from './config';
import { addMonths, toIsoDate } from './dates';
import type { IsoTimestamp } from './dates';
import { invariant } from './errors';
import { splitEvenly, sum } from './money';
import type { Cents } from './money';
import type { Agreement, Installment, LoanCase, Offer, PersonId, PointsEntry, Reason } from './types';

/**
 * The loan lifecycle as pure functions: each takes a LoanCase and returns a
 * new one (the input is never mutated) or throws a FamilyShieldError.
 * A backend applies these inside a transaction; the mock backend applies
 * them in memory.
 */

const clone = <T>(value: T): T => structuredClone(value);

const REASONS: readonly Reason[] = ['car', 'medical', 'job', 'other'];

export interface NewRequest {
  id: string;
  borrowerId: PersonId;
  /** Circle members to ask. The borrower is never in this list. */
  circle: PersonId[];
  reason: Reason;
  purpose: string;
  amount: Cents;
  months: number;
  now: IsoTimestamp;
}

const dollars = (c: Cents) => `$${(c / 100).toLocaleString('en-US')}`;

export function validateAmount(amount: Cents, rules: Rules = DEFAULT_RULES): void {
  invariant(Number.isInteger(amount), 'INVALID_INPUT', 'Amount must be whole cents.');
  invariant(
    amount >= rules.amountMin && amount <= rules.amountMax,
    'INVALID_INPUT',
    `Requests must be between ${dollars(rules.amountMin)} and ${dollars(rules.amountMax)}.`,
  );
  invariant((amount - rules.amountMin) % rules.amountStep === 0, 'INVALID_INPUT', `Requests go in steps of ${dollars(rules.amountStep)}.`);
}

export function isTerm(months: number, rules: Rules = DEFAULT_RULES): boolean {
  return rules.terms.includes(months);
}

export function createLoanCase(input: NewRequest, rules: Rules = DEFAULT_RULES): LoanCase {
  validateAmount(input.amount, rules);
  invariant(isTerm(input.months, rules), 'INVALID_INPUT', `Choose a term of ${rules.terms.join(', ')} months.`);
  invariant(REASONS.includes(input.reason), 'INVALID_INPUT', 'Choose what happened.');
  const purpose = input.purpose.trim();
  invariant(purpose.length > 0, 'INVALID_INPUT', 'Tell your circle what the money is for.');
  invariant(purpose.length <= 500, 'INVALID_INPUT', 'Keep the description under 500 characters.');
  const circle = [...new Set(input.circle)].filter((id) => id !== input.borrowerId);
  invariant(circle.length > 0, 'INVALID_INPUT', 'Add at least one person to your trusted circle first.');

  return {
    id: input.id,
    borrowerId: input.borrowerId,
    reason: input.reason,
    purpose,
    amount: input.amount,
    months: input.months,
    status: 'collecting',
    createdAt: input.now,
    offers: circle.map((memberId) => ({ memberId, status: 'pending', amount: 0, accepted: false })),
    agreements: [],
    schedule: [],
    points: 0,
    pointsLog: [],
    pause: null,
    pausesUsed: 0,
    claimedRewards: {},
  };
}

function findOffer(loan: LoanCase, memberId: PersonId): Offer {
  const offer = loan.offers.find((o) => o.memberId === memberId);
  invariant(offer, 'NOT_FOUND', 'That person was not asked on this request.');
  return offer;
}

export type LenderResponse = { kind: 'offer'; amount: Cents; note?: string } | { kind: 'decline'; note?: string };

/** A circle member answers privately. */
export function respondToRequest(loan: LoanCase, memberId: PersonId, response: LenderResponse, now: IsoTimestamp): LoanCase {
  invariant(loan.status === 'collecting', 'INVALID_STATE', 'This request is no longer taking offers.');
  const next = clone(loan);
  const offer = findOffer(next, memberId);
  invariant(offer.status === 'pending', 'INVALID_STATE', 'You have already answered this request.');
  const note = response.note?.trim() || undefined;
  invariant(!note || note.length <= 280, 'INVALID_INPUT', 'Keep your note under 280 characters.');

  if (response.kind === 'offer') {
    invariant(
      Number.isInteger(response.amount) && response.amount >= 100 && response.amount % 100 === 0,
      'INVALID_INPUT',
      'Offer a whole-dollar amount.',
    );
    invariant(response.amount <= loan.amount, 'INVALID_INPUT', 'You can’t offer more than was asked for.');
    offer.status = 'offered';
    offer.amount = response.amount;
  } else {
    offer.status = 'declined';
    offer.amount = 0;
  }
  offer.note = note;
  offer.respondedAt = now;
  return next;
}

/** The borrower picks which offers to take. */
export function setOfferAccepted(loan: LoanCase, memberId: PersonId, accepted: boolean): LoanCase {
  invariant(loan.status === 'collecting', 'INVALID_STATE', 'Offers can only be changed before you sign.');
  const next = clone(loan);
  const offer = findOffer(next, memberId);
  invariant(offer.status === 'offered', 'INVALID_STATE', 'Only offers that were made can be accepted.');
  offer.accepted = accepted;
  invariant(
    acceptedTotal(next) <= next.amount,
    'INVALID_INPUT',
    'Accepted offers can’t add up to more than you asked for.',
  );
  return next;
}

/**
 * The borrower removed this person from their circle. While the request is
 * still collecting, their offer is withdrawn: an unanswered or made offer
 * becomes 'expired' (and un-accepted), so it can't be accepted or signed.
 * A decline stays a decline. Once the borrower has signed, the agreements
 * stand, so the loan is returned unchanged.
 */
export function withdrawMember(loan: LoanCase, memberId: PersonId): LoanCase {
  if (loan.status !== 'collecting') return loan;
  const offer = loan.offers.find((o) => o.memberId === memberId);
  if (!offer || (offer.status !== 'pending' && offer.status !== 'offered')) return loan;
  const next = clone(loan);
  const o = findOffer(next, memberId);
  o.status = 'expired';
  o.accepted = false;
  return next;
}

export function acceptedTotal(loan: LoanCase): Cents {
  return sum(loan.offers.filter((o) => o.status === 'offered' && o.accepted).map((o) => o.amount));
}

/** The agreements the borrower would sign right now (used for the preview too). */
export function draftAgreements(loan: LoanCase, rules: Rules = DEFAULT_RULES): Agreement[] {
  return loan.offers
    .filter((o) => o.status === 'offered' && o.accepted)
    .map((o) => {
      const fee = feeFor(o.amount, rules);
      return { lenderId: o.memberId, principal: o.amount, interestRate: 0, fee, total: o.amount + fee };
    });
}

export function signAsBorrower(loan: LoanCase, now: IsoTimestamp, rules: Rules = DEFAULT_RULES): LoanCase {
  invariant(loan.status === 'collecting', 'INVALID_STATE', 'This request has already been signed.');
  const agreements = draftAgreements(loan, rules);
  invariant(agreements.length > 0, 'INVALID_STATE', 'Accept at least one offer before signing.');
  const next = clone(loan);
  next.agreements = agreements.map((a) => ({ ...a, borrowerSignedAt: now }));
  // Anyone who hasn't answered can no longer join this loan.
  for (const offer of next.offers) if (offer.status === 'pending') offer.status = 'expired';
  next.status = 'signing';
  return next;
}

export function signAsLender(loan: LoanCase, lenderId: PersonId, now: IsoTimestamp, rules: Rules = DEFAULT_RULES): LoanCase {
  invariant(loan.status === 'signing', 'INVALID_STATE', 'There is nothing to sign right now.');
  const next = clone(loan);
  const agreement = next.agreements.find((a) => a.lenderId === lenderId);
  invariant(agreement, 'FORBIDDEN', 'You are not a lender on this loan.');
  invariant(!agreement.lenderSignedAt, 'INVALID_STATE', 'You have already signed.');
  agreement.lenderSignedAt = now;
  return next.agreements.every((a) => a.lenderSignedAt) ? activate(next, now, rules) : next;
}

/** Build the repayment schedule: every lender's principal and the fee, spread evenly. */
export function buildSchedule(agreements: Agreement[], months: number, startDate: string): Installment[] {
  const feeTotal = sum(agreements.map((a) => a.fee));
  const lenderSplits = agreements.map((a) => ({ to: a.lenderId, parts: splitEvenly(a.principal, months) }));
  const feeSplit = splitEvenly(feeTotal, months);
  return Array.from({ length: months }, (_, index) => {
    const parts = [
      ...lenderSplits.map((s) => ({ to: s.to, amount: s.parts[index]! })),
      { to: 'fee' as const, amount: feeSplit[index]! },
    ];
    return { index, dueDate: addMonths(startDate, index + 1), amount: sum(parts.map((p) => p.amount)), parts };
  });
}

function award(loan: LoanCase, entry: PointsEntry): void {
  loan.points += entry.points;
  loan.pointsLog.push(entry);
}

function activate(loan: LoanCase, now: IsoTimestamp, rules: Rules): LoanCase {
  loan.status = 'active';
  loan.fundedAt = now;
  loan.schedule = buildSchedule(loan.agreements, loan.months, toIsoDate(now));
  award(loan, {
    at: now,
    points: rules.points.help * loan.agreements.length,
    reason: 'help',
    label: `${loan.agreements.length} family member${loan.agreements.length === 1 ? '' : 's'} helped`,
  });
  return loan;
}

export function nextInstallment(loan: LoanCase): Installment | undefined {
  return loan.schedule.find((i) => !i.paidAt);
}

export function recordPayment(loan: LoanCase, now: IsoTimestamp, rules: Rules = DEFAULT_RULES): LoanCase {
  invariant(loan.status === 'active', 'INVALID_STATE', 'There is no payment due.');
  const next = clone(loan);
  const installment = nextInstallment(next);
  invariant(installment, 'INVALID_STATE', 'This loan is already repaid.');
  installment.paidAt = now;
  installment.onTime = toIsoDate(now) <= installment.dueDate;
  if (installment.onTime) {
    award(next, { at: now, points: rules.points.onTime, reason: 'on-time', label: `Payment ${installment.index + 1} on time` });
  }
  // Paying while a pause is pending withdraws the pause request.
  if (next.pause?.status === 'pending') next.pause = null;
  if (!nextInstallment(next)) {
    next.status = 'repaid';
    next.repaidAt = now;
    award(next, { at: now, points: rules.points.complete, reason: 'complete', label: 'Fully repaid' });
  }
  return next;
}

export function requestPause(loan: LoanCase, now: IsoTimestamp, rules: Rules = DEFAULT_RULES): LoanCase {
  invariant(loan.status === 'active', 'INVALID_STATE', 'You can only pause an active loan.');
  invariant(loan.pause?.status !== 'pending', 'INVALID_STATE', 'A pause request is already waiting for an answer.');
  invariant(loan.pausesUsed < rules.maxPauses, 'LIMIT_REACHED', 'You’ve used the pause available on this loan.');
  const next = clone(loan);
  next.pause = {
    status: 'pending',
    requestedAt: now,
    approvals: Object.fromEntries(next.agreements.map((a) => [a.lenderId, null])),
  };
  return next;
}

export function cancelPause(loan: LoanCase): LoanCase {
  invariant(loan.pause?.status === 'pending', 'INVALID_STATE', 'There is no pause request to cancel.');
  const next = clone(loan);
  next.pause = null;
  return next;
}

/** Each lender answers privately. All must approve; any decline ends the request. */
export function respondToPause(loan: LoanCase, lenderId: PersonId, approve: boolean): LoanCase {
  invariant(loan.pause?.status === 'pending', 'INVALID_STATE', 'There is no pause request to answer.');
  invariant(lenderId in loan.pause.approvals, 'FORBIDDEN', 'You are not a lender on this loan.');
  invariant(loan.pause.approvals[lenderId] === null, 'INVALID_STATE', 'You have already answered.');
  const next = clone(loan);
  const pause = next.pause!;
  pause.approvals[lenderId] = approve;
  const answers = Object.values(pause.approvals);
  if (answers.some((a) => a === false)) {
    pause.status = 'declined';
  } else if (answers.every((a) => a === true)) {
    pause.status = 'approved';
    next.pausesUsed += 1;
    for (const i of next.schedule) if (!i.paidAt) i.dueDate = addMonths(i.dueDate, 1);
  }
  return next;
}

export function cancelRequest(loan: LoanCase): LoanCase {
  invariant(loan.status === 'collecting', 'INVALID_STATE', 'Only an unsigned request can be cancelled.');
  const next = clone(loan);
  next.status = 'cancelled';
  return next;
}
