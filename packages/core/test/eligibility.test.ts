import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, FamilyShieldError, addDays, assertEligible, checkEligibility, createLoanCase, daysBetween, overdueOf, recordPayment, respondToRequest, setOfferAccepted, signAsBorrower, signAsLender } from '../src';
import type { LoanCase, Rules } from '../src';

const rules: Rules = { ...DEFAULT_RULES, overdueGraceDays: 3 };

/** Just the fields eligibility looks at. */
const loan = (status: LoanCase['status']) => ({ id: `l-${status}`, status, schedule: [] }) as unknown as LoanCase;

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-11-15', 30)).toBe('2026-12-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-15', '2026-12-15')).toBe(30);
    expect(daysBetween('2026-12-15', '2026-11-15')).toBe(-30);
  });
});

describe('who may start a request', () => {
  it('lets someone with no open loan ask', () => {
    expect(checkEligibility({ today: '2026-11-12', loans: [] }, rules)).toEqual({
      today: '2026-11-12',
      eligible: true,
      blocks: [],
      overdue: null,
      lending: { allowed: true },
    });
  });

  it('allows one open request or loan at a time', () => {
    for (const status of ['collecting', 'signing', 'active'] as const) {
      expect(checkEligibility({ today: '2026-11-12', loans: [loan(status)] }, rules).blocks.map((b) => b.code)).toEqual(['open-loan']);
    }
    for (const status of ['repaid', 'cancelled'] as const) {
      expect(checkEligibility({ today: '2026-11-12', loans: [loan(status)] }, rules).eligible).toBe(true);
    }
  });

  it('refuses with the first reason', () => {
    const result = checkEligibility({ today: '2026-11-12', loans: [loan('active')] }, rules);
    expect(() => assertEligible(result)).toThrow(FamilyShieldError);
    expect(() => assertEligible(result)).toThrow(/already have an open request/);
  });
});

/** Alex borrows $1,500 from Mom over 6 months ($262.50 a month with the fee), funded on Nov 5: payments due Dec 5, Jan 5, … */
function activeLoan(): LoanCase {
  const T = '2026-11-05T15:00:00.000Z';
  let l = createLoanCase({ id: 'loan_1', borrowerId: 'alex', circle: ['mom'], reason: 'car', purpose: 'Car', amount: 150_000, months: 6, now: T }, rules);
  l = respondToRequest(l, 'mom', { kind: 'offer', amount: 150_000 }, T);
  l = setOfferAccepted(l, 'mom', true);
  l = signAsBorrower(l, T, rules);
  return signAsLender(l, 'mom', T, rules);
}

describe('customers who aren’t repaying', () => {
  it('counts a payment as overdue after the grace days', () => {
    const l = activeLoan();
    expect(l.schedule[0]!.dueDate).toBe('2026-12-05');
    expect(overdueOf(l, '2026-12-08', rules)).toBeNull(); // 3 days: still in the grace period
    expect(overdueOf(l, '2026-12-09', rules)).toEqual({ installments: [1], amount: 26_250, since: '2026-12-05', daysLate: 4 });
    expect(overdueOf(l, '2027-01-10', rules)).toMatchObject({ installments: [1, 2], amount: 52_500, daysLate: 36 });
  });

  it('paying the oldest payments clears it', () => {
    let l = activeLoan();
    l = recordPayment(l, '2027-01-10T12:00:00.000Z', rules);
    expect(overdueOf(l, '2027-01-10', rules)).toMatchObject({ installments: [2] });
    l = recordPayment(l, '2027-01-10T12:00:00.000Z', rules);
    expect(overdueOf(l, '2027-01-10', rules)).toBeNull();
  });

  it('blocks new requests and offers to lend while overdue', () => {
    const e = checkEligibility({ today: '2026-12-20', loans: [activeLoan()] }, rules);
    expect(e.blocks.map((b) => b.code)).toEqual(['overdue', 'open-loan']);
    expect(e.blocks[0]!.message).toBe('Payment 1 on your family loan is late (15 days). Pay $262.50 to catch up.');
    expect(e.overdue).toMatchObject({ amount: 26_250 });
    expect(e.lending).toEqual({ allowed: false, message: 'Catch up on your own family loan first: $262.50 is overdue. You can still reply “not this time”.' });
    expect(checkEligibility({ today: '2026-12-01', loans: [activeLoan()] }, rules).lending).toEqual({ allowed: true });
  });
});
