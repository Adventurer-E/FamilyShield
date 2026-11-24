import { describe, expect, it } from 'vitest';
import {
  FamilyShieldError,
  DEFAULT_REWARDS,
  DEFAULT_RULES,
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
  reasonLabelOf,
  withdrawMember,
  CUSTOM_REASON_MAX,
} from '../src';
import type { LoanCase } from '../src';

const T0 = '2026-11-05T15:00:00.000Z';
const P = DEFAULT_RULES.points;

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

  it('enforces the amount limits', () => {
    expect(() => newRequest({ amount: 40_000 })).toThrow(FamilyShieldError);
    expect(() => newRequest({ amount: 49_900 })).toThrow(/between/);
    expect(() => newRequest({ amount: 600_000 })).toThrow(/between/);
    expect(() => newRequest({ amount: 500_100 })).toThrow(/between/);
  });

  it('allows any whole-dollar amount within the limits, not only steps', () => {
    expect(newRequest({ amount: 50_000 }).amount).toBe(50_000); // the minimum
    expect(newRequest({ amount: 500_000 }).amount).toBe(500_000); // the maximum
    expect(newRequest({ amount: 133_700 }).amount).toBe(133_700); // $1,337, between steps
    expect(newRequest({ amount: 160_000 }).amount).toBe(160_000);
  });

  it('refuses cents and non-numbers', () => {
    expect(() => newRequest({ amount: 133_750 })).toThrow(/whole-dollar/);
    expect(() => newRequest({ amount: 1500.5 })).toThrow(/whole-dollar/);
    expect(() => newRequest({ amount: Number.NaN })).toThrow(/whole-dollar/);
  });

  it('allows any whole number of months within the limits, not only the suggested terms', () => {
    for (const months of [3, 7, 9, 18, 24]) expect(newRequest({ months }).months).toBe(months);
  });

  it('refuses terms outside the limits or part months', () => {
    expect(() => newRequest({ months: 2 })).toThrow(/from 3 to 24 months/);
    expect(() => newRequest({ months: 25 })).toThrow(/term/);
    expect(() => newRequest({ months: 0 })).toThrow(/term/);
    expect(() => newRequest({ months: 6.5 })).toThrow(/term/);
  });
});

describe('writing your own reason', () => {
  it('keeps the borrower’s own words, tidied', () => {
    const loan = newRequest({ reason: 'custom', reasonLabel: '  Broken   water heater ' });
    expect(loan.reason).toBe('custom');
    expect(loan.reasonLabel).toBe('Broken water heater');
    expect(reasonLabelOf(loan)).toBe('Broken water heater');
  });

  it('needs a few words, but not a paragraph', () => {
    expect(() => newRequest({ reason: 'custom' })).toThrow(/what happened/);
    expect(() => newRequest({ reason: 'custom', reasonLabel: '   ' })).toThrow(/what happened/);
    expect(newRequest({ reason: 'custom', reasonLabel: 'x'.repeat(CUSTOM_REASON_MAX) }).reasonLabel).toHaveLength(CUSTOM_REASON_MAX);
    expect(() => newRequest({ reason: 'custom', reasonLabel: 'x'.repeat(CUSTOM_REASON_MAX + 1) })).toThrow(/under 40 characters/);
  });

  it('ignores own words sent with a preset reason', () => {
    const loan = newRequest({ reason: 'car', reasonLabel: 'Something else entirely' });
    expect(loan.reasonLabel).toBeUndefined();
    expect(reasonLabelOf(loan)).toBe('Car repair');
  });

  it('still refuses reasons that don’t exist', () => {
    expect(() => newRequest({ reason: 'rent' as never })).toThrow(/what happened/);
  });

  it('labels a custom reason generically for the bank', () => {
    const loan = newRequest({ reason: 'custom', reasonLabel: 'Broken water heater' });
    expect(reasonLabelOf(loan, undefined, { hideOwnWords: true })).toBe('Own reason');
  });
});

describe('schedules for any amount and term still add up to the cent', () => {
  /** Fund a request with offers from Mom and Maya, sign, and return the active loan. */
  function funded(amount: number, months: number, mom: number, maya: number): LoanCase {
    let loan = newRequest({ amount, months });
    loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: mom }, T0);
    loan = respondToRequest(loan, 'maya', { kind: 'offer', amount: maya }, T0);
    loan = setOfferAccepted(loan, 'mom', true);
    loan = setOfferAccepted(loan, 'maya', true);
    loan = signAsBorrower(loan, T0);
    loan = signAsLender(loan, 'mom', T0);
    return signAsLender(loan, 'maya', T0);
  }

  const cases: Array<[amount: number, months: number, mom: number, maya: number]> = [
    [133_700, 7, 100_000, 33_700], // $1,337 over 7 months
    [50_100, 3, 25_100, 25_000], // $501 over the shortest term
    [499_900, 24, 333_300, 166_600], // $4,999 over the longest term
    [123_400, 11, 61_700, 50_300], // partly funded, uneven everything
  ];

  for (const [amount, months, mom, maya] of cases) {
    it(`${amount / 100} dollars over ${months} months`, () => {
      const loan = funded(amount, months, mom, maya);
      expect(loan.schedule).toHaveLength(months);
      const fee = sum(loan.agreements.map((a) => a.fee));
      // Every installment is the sum of its parts, and they add up to principal + fee exactly.
      for (const i of loan.schedule) expect(i.amount).toBe(sum(i.parts.map((p) => p.amount)));
      expect(sum(loan.schedule.map((i) => i.amount))).toBe(mom + maya + fee);
      // Each lender gets exactly their principal; FamilyShield gets exactly the fee.
      const paidTo = (to: string) => sum(loan.schedule.flatMap((i) => i.parts.filter((p) => p.to === to).map((p) => p.amount)));
      expect(paidTo('mom')).toBe(mom);
      expect(paidTo('maya')).toBe(maya);
      expect(paidTo('fee')).toBe(fee);
      // Installments differ by at most a cent per payee, and never go negative.
      const amounts = loan.schedule.map((i) => i.amount);
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(payeesOf(loan));
      expect(Math.min(...amounts)).toBeGreaterThan(0);
    });
  }

  /** Lenders plus the fee: each can be one cent higher in the early installments. */
  function payeesOf(loan: LoanCase): number {
    return loan.schedule[0]!.parts.length;
  }
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

describe('removing someone from the circle', () => {
  it('withdraws their pending or made offer while the request is collecting', () => {
    let loan = respondToRequest(newRequest(), 'maya', { kind: 'offer', amount: 50_000 }, T0);
    loan = setOfferAccepted(loan, 'maya', true);
    const afterMaya = withdrawMember(loan, 'maya');
    expect(afterMaya.offers.find((o) => o.memberId === 'maya')).toMatchObject({ status: 'expired', accepted: false });
    expect(() => signAsBorrower(afterMaya, T0)).toThrow(/Accept at least one/);
    expect(withdrawMember(loan, 'mom').offers.find((o) => o.memberId === 'mom')!.status).toBe('expired');
    expect(loan.offers.find((o) => o.memberId === 'maya')!.status).toBe('offered'); // input not mutated
  });

  it('leaves declines, strangers and signed loans alone', () => {
    const declined = respondToRequest(newRequest(), 'lisa', { kind: 'decline' }, T0);
    expect(withdrawMember(declined, 'lisa')).toBe(declined);
    expect(withdrawMember(declined, 'nobody')).toBe(declined);
    const funded = fundedLoan();
    expect(withdrawMember(funded, 'mom')).toBe(funded);
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
    expect(loan.points).toBe(2 * P.help);
    loan = payAll(loan);
    expect(loan.status).toBe('repaid');
    expect(loan.points).toBe(2 * P.help + 10 * P.onTime + P.complete);
    expect(loan.points).toBe(1_200);
  });

  it('gives no on-time points for late payments', () => {
    const loan = recordPayment(fundedLoan(), '2027-01-20T00:00:00.000Z');
    expect(loan.schedule[0]!.onTime).toBe(false);
    expect(loan.points).toBe(2 * P.help);
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
    expect(DEFAULT_REWARDS.map((r) => rewardStatus(loan, r))).toEqual(['available', 'available', 'locked']);
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

describe('custom rules (e.g. from data/settings.csv)', () => {
  const rules = {
    ...DEFAULT_RULES,
    feeRate: 0.03,
    amountMin: 100_000,
    amountStep: 50_000,
    termMin: 3,
    termMax: 6,
    terms: [3, 6],
    points: { help: 50, onTime: 10, complete: 500 },
  };

  it('validates against the configured limits and terms', () => {
    expect(() => createLoanCase({ id: 'x', borrowerId: 'alex', circle: ['mom'], reason: 'car', purpose: 'p', amount: 50_000, months: 6, now: T0 }, rules)).toThrow(/between/);
    expect(() => createLoanCase({ id: 'x', borrowerId: 'alex', circle: ['mom'], reason: 'car', purpose: 'p', amount: 150_000, months: 10, now: T0 }, rules)).toThrow(/from 3 to 6 months/);
    // Between the configured limits, any amount and term works, not only steps and suggestions.
    const loan = createLoanCase({ id: 'x', borrowerId: 'alex', circle: ['mom'], reason: 'car', purpose: 'p', amount: 123_400, months: 4, now: T0 }, rules);
    expect([loan.amount, loan.months]).toEqual([123_400, 4]);
  });

  it('applies the configured fee and points', () => {
    let loan = createLoanCase({ id: 'x', borrowerId: 'alex', circle: ['mom'], reason: 'car', purpose: 'p', amount: 100_000, months: 3, now: T0 }, rules);
    loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: 100_000 }, T0);
    loan = setOfferAccepted(loan, 'mom', true);
    loan = signAsBorrower(loan, T0, rules);
    loan = signAsLender(loan, 'mom', T0, rules);
    expect(loan.agreements[0]).toMatchObject({ fee: 3_000, total: 103_000 });
    while (loan.status === 'active') loan = recordPayment(loan, T0, rules);
    expect(loan.points).toBe(50 + 3 * 10 + 500);
  });
});
