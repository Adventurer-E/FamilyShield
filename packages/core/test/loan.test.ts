import { describe, expect, it } from 'vitest';
import {
  FamilyShieldError,
  POINTS,
  REWARDS,
  claimReward,
  createLoanCase,
  getReward,
  recordPayment,
  repaymentSummary,
  requestPause,
  respondToPause,
  respondToRequest,
  rewardStatus,
  setOfferAccepted,
  signAsBorrower,
  signAsLender,
  sum,
  lenderSummary,
} from '../src';
import type { LoanCase } from '../src';

const T0 = '2026-11-05T15:00:00.000Z';

function newRequest(overrides: Partial<Parameters<typeof createLoanCase>[0]> = {}): LoanCase {
  return createLoanCase({
    id: 'loan_1',
    borrowerId: 'alex',
    circle: ['mom', 'maya', 'lisa'],
    reason: 'car',
    purpose: 'Car broke down; need it for work.',
    amount: 150_000,
    months: 10,
    now: T0,
    ...overrides,
  });
}

/** The demo story: Mom offers $1,000, Maya $500, Lisa declines; both accepted and signed. */
function fundedLoan(): LoanCase {
  let loan = newRequest();
  loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: 100_000, note: 'Happy to help.' }, T0);
  loan = respondToRequest(loan, 'maya', { kind: 'offer', amount: 50_000 }, T0);
  loan = respondToRequest(loan, 'lisa', { kind: 'decline', note: 'Wish I could.' }, T0);
  loan = setOfferAccepted(loan, 'mom', true);
  loan = setOfferAccepted(loan, 'maya', true);
  loan = signAsBorrower(loan, T0);
  loan = signAsLender(loan, 'mom', T0);
  loan = signAsLender(loan, 'maya', T0);
  return loan;
}

function payAll(loan: LoanCase, at = T0): LoanCase {
  while (loan.status === 'active') loan = recordPayment(loan, at);
  return loan;
}

describe('creating a request', () => {
  it('asks everyone in the circle except the borrower', () => {
    const loan = newRequest({ circle: ['mom', 'alex', 'mom', 'maya'] });
    expect(loan.offers.map((o) => o.memberId)).toEqual(['mom', 'maya']);
    expect(loan.status).toBe('collecting');
  });

  it('enforces amount limits and steps', () => {
    expect(() => newRequest({ amount: 40_000 })).toThrow(FamilyShieldError);
    expect(() => newRequest({ amount: 600_000 })).toThrow(/between/);
    expect(() => newRequest({ amount: 160_000 })).toThrow(/steps/);
  });

  it('only allows the supported terms', () => {
    expect(() => newRequest({ months: 7 })).toThrow(/term/);
  });
});

describe('offers', () => {
  it('lets each member answer once', () => {
    const loan = respondToRequest(newRequest(), 'mom', { kind: 'offer', amount: 100_000 }, T0);
    expect(() => respondToRequest(loan, 'mom', { kind: 'decline' }, T0)).toThrow(/already answered/);
  });

  it('caps an offer at the requested amount', () => {
    expect(() => respondToRequest(newRequest(), 'mom', { kind: 'offer', amount: 200_000 }, T0)).toThrow();
  });

  it('stops accepted offers exceeding the request', () => {
    let loan = newRequest({ amount: 100_000 });
    loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: 100_000 }, T0);
    loan = respondToRequest(loan, 'maya', { kind: 'offer', amount: 50_000 }, T0);
    loan = setOfferAccepted(loan, 'mom', true);
    expect(() => setOfferAccepted(loan, 'maya', true)).toThrow(/more than you asked/);
  });

  it('can’t accept a declined offer', () => {
    const loan = respondToRequest(newRequest(), 'lisa', { kind: 'decline' }, T0);
    expect(() => setOfferAccepted(loan, 'lisa', true)).toThrow();
  });
});

describe('signing', () => {
  it('needs at least one accepted offer', () => {
    expect(() => signAsBorrower(newRequest(), T0)).toThrow(/Accept at least one/);
  });

  it('expires unanswered offers and waits for every lender', () => {
    let loan = newRequest();
    loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: 100_000 }, T0);
    loan = setOfferAccepted(loan, 'mom', true);
    loan = signAsBorrower(loan, T0);
    expect(loan.status).toBe('signing');
    expect(loan.offers.find((o) => o.memberId === 'maya')!.status).toBe('expired');
    expect(() => signAsLender(loan, 'maya', T0)).toThrow(/not a lender/);
    loan = signAsLender(loan, 'mom', T0);
    expect(loan.status).toBe('active');
  });

  it('adds the 5% fee to each agreement', () => {
    const loan = fundedLoan();
    const mom = loan.agreements.find((a) => a.lenderId === 'mom')!;
    expect(mom).toMatchObject({ principal: 100_000, fee: 5_000, total: 105_000, interestRate: 0 });
  });
});

describe('repayment schedule', () => {
  it('includes the fee in what the borrower repays', () => {
    const loan = fundedLoan();
    const summary = repaymentSummary(loan);
    expect(summary).toMatchObject({ principal: 150_000, fee: 7_500, total: 157_500, paid: 0 });
    expect(loan.schedule).toHaveLength(10);
    expect(loan.schedule[0]!.amount).toBe(15_750); // $157.50 / month
  });

  it('pays every lender exactly their principal, and the fee in full', () => {
    const loan = fundedLoan();
    const to = (id: string) => sum(loan.schedule.flatMap((i) => i.parts.filter((p) => p.to === id).map((p) => p.amount)));
    expect(to('mom')).toBe(100_000);
    expect(to('maya')).toBe(50_000);
    expect(to('fee')).toBe(7_500);
    expect(sum(loan.schedule.map((i) => i.amount))).toBe(157_500);
  });

  it('starts one month after funding', () => {
    const loan = fundedLoan();
    expect(loan.schedule[0]!.dueDate).toBe('2026-12-05');
    expect(loan.schedule[9]!.dueDate).toBe('2027-09-05');
  });

  it('tracks what each lender has received', () => {
    let loan = fundedLoan();
    loan = recordPayment(loan, T0);
    expect(lenderSummary(loan, 'mom')).toMatchObject({ lent: 100_000, received: 10_000, outstanding: 90_000 });
  });
});

describe('points', () => {
  it('gives the demo family 1,200 points: 2 helpers + 10 on-time payments + completion', () => {
    let loan = fundedLoan();
    expect(loan.points).toBe(2 * POINTS.HELP);
    loan = payAll(loan);
    expect(loan.status).toBe('repaid');
    expect(loan.points).toBe(2 * POINTS.HELP + 10 * POINTS.ON_TIME + POINTS.COMPLETE);
    expect(loan.points).toBe(1_200);
  });

  it('gives no on-time points for late payments', () => {
    const loan = recordPayment(fundedLoan(), '2027-01-20T00:00:00.000Z');
    expect(loan.schedule[0]!.onTime).toBe(false);
    expect(loan.points).toBe(2 * POINTS.HELP);
  });
});

describe('pausing', () => {
  it('shifts unpaid installments a month once every lender approves', () => {
    let loan = recordPayment(fundedLoan(), T0);
    loan = requestPause(loan, T0);
    loan = respondToPause(loan, 'mom', true);
    expect(loan.pause!.status).toBe('pending');
    loan = respondToPause(loan, 'maya', true);
    expect(loan.pause!.status).toBe('approved');
    expect(loan.schedule[0]!.dueDate).toBe('2026-12-05'); // already paid, unchanged
    expect(loan.schedule[1]!.dueDate).toBe('2027-02-05'); // was 2027-01-05
  });

  it('ends on any decline and allows one pause per loan', () => {
    let loan = requestPause(fundedLoan(), T0);
    loan = respondToPause(loan, 'maya', false);
    expect(loan.pause!.status).toBe('declined');
    expect(loan.schedule[0]!.dueDate).toBe('2026-12-05');

    let other = requestPause(fundedLoan(), T0);
    other = respondToPause(respondToPause(other, 'mom', true), 'maya', true);
    expect(() => requestPause(other, T0)).toThrow(/used the pause/);
  });
});

describe('rewards', () => {
  it('only unlock at full repayment, even with enough points', () => {
    let loan = fundedLoan();
    for (let i = 0; i < 9; i++) loan = recordPayment(loan, T0);
    expect(loan.points).toBe(200 + 9 * 80); // 920
    expect(rewardStatus(loan, getReward('dinner'))).toBe('awaiting-repayment');
    expect(rewardStatus(loan, getReward('trip'))).toBe('locked');
    expect(() => claimReward(loan, 'dinner', 'CODE', T0)).toThrow(/fully repaid/);

    loan = recordPayment(loan, T0);
    expect(REWARDS.map((r) => rewardStatus(loan, r))).toEqual(['available', 'available', 'locked']);
  });

  it('can be claimed once', () => {
    let loan = payAll(fundedLoan());
    loan = claimReward(loan, 'trip', 'FS-HARBOR-1', T0);
    expect(rewardStatus(loan, getReward('trip'))).toBe('claimed');
    expect(() => claimReward(loan, 'trip', 'X', T0)).toThrow(/already claimed/);
  });
});

it('never mutates its input', () => {
  const before = fundedLoan();
  const snapshot = JSON.stringify(before);
  recordPayment(before, T0);
  requestPause(before, T0);
  expect(JSON.stringify(before)).toBe(snapshot);
});
