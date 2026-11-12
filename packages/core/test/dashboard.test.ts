import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  bankDashboard,
  cancelRequest,
  createLoanCase,
  recordPayment,
  respondToRequest,
  setOfferAccepted,
  signAsBorrower,
  signAsLender,
} from '../src';
import type { LoanCase, Rules } from '../src';

const rules: Rules = { ...DEFAULT_RULES, overdueGraceDays: 3 };
const T = '2026-11-05T15:00:00.000Z';
const customers = [
  { id: 'alex', name: 'Alex Chen', circle: 3 },
  { id: 'mom', name: 'Grace Chen', circle: 2 },
  { id: 'maya', name: 'Maya Lin', circle: 1 },
  { id: 'lisa', name: 'Lisa Park', circle: 0 },
  { id: 'sam', name: 'Sam Ortiz', circle: 0 },
];

const request = (id: string, borrowerId: string, amount: number, months: number, circle: string[], now = T) =>
  createLoanCase({ id, borrowerId, circle, reason: 'car', purpose: 'private words', amount, months, now }, rules);

/** Signed with every offer for the full amount split as given. */
function funded(id: string, borrowerId: string, offers: Record<string, number>, months: number): LoanCase {
  const amount = Object.values(offers).reduce((a, b) => a + b, 0);
  let l = request(id, borrowerId, amount, months, Object.keys(offers));
  for (const [m, v] of Object.entries(offers)) {
    l = respondToRequest(l, m, { kind: 'offer', amount: v }, T);
    l = setOfferAccepted(l, m, true);
  }
  l = signAsBorrower(l, T, rules);
  for (const m of Object.keys(offers)) l = signAsLender(l, m, T, rules);
  return l;
}

describe('the bank dashboard', () => {
  // Alex: $1,500 from Mom ($900) and Maya ($600), 6 months, 1 payment on time, then nothing (overdue by Jan 20).
  // Lisa: $1,000 from Mom, 6 months, repaid in full on time.
  // Mom: a $500 request still collecting. Maya: a cancelled request.
  let alex = funded('alex1', 'alex', { mom: 90_000, maya: 60_000 }, 6);
  alex = recordPayment(alex, '2026-12-01T12:00:00.000Z', rules);
  let lisa = funded('lisa1', 'lisa', { mom: 100_000 }, 6);
  while (lisa.status === 'active') lisa = recordPayment(lisa, '2026-11-20T12:00:00.000Z', rules);
  const mom = request('mom1', 'mom', 50_000, 6, ['alex', 'lisa'], '2027-01-10T09:00:00.000Z');
  const maya = cancelRequest(request('maya1', 'maya', 50_000, 6, ['alex']));
  const d = bankDashboard({ today: '2027-01-20', loans: [lisa, mom, maya, alex], customers }, rules);

  it('counts requests by status, cancelled included', () => {
    expect(d.requests).toEqual({ total: 4, byStatus: { collecting: 1, signing: 0, active: 1, repaid: 1, cancelled: 1 } });
  });

  it('counts customers', () => {
    expect(d.customers).toEqual({ borrowers: 3, lenders: 2, restricted: 1 });
  });

  it('adds up the money, to the cent', () => {
    expect(d.money).toEqual({
      requested: 150_000 + 100_000 + 50_000,
      funded: 250_000,
      repaidToLenders: 25_000 + 100_000, // one sixth of Alex's $1,500, all of Lisa's $1,000
      outstanding: 125_000,
      feesCollected: 1_250 + 5_000,
      feesContracted: 7_500 + 5_000,
    });
  });

  it('tracks on-time payments', () => {
    expect(d.payments).toEqual({ made: 7, onTime: 7, late: 0, onTimeRate: 1 });
  });

  it('lists overdue loans first, with what it takes to catch up', () => {
    // Alex's payment 2 was due Jan 5: 15 days late on Jan 20. Payment 3 (Feb 5) isn't due yet.
    expect(d.overdue).toEqual({ loans: 1, amount: 26_250, atRisk: 125_000 });
    expect(d.loans.map((l) => l.loanId)).toEqual(['alex1', 'mom1', 'lisa1']); // overdue first, then newest first
    expect(d.loans[0]).toMatchObject({
      borrowerName: 'Alex Chen',
      status: 'active',
      requested: 150_000,
      funded: 150_000,
      people: 2,
      paid: 26_250,
      total: 157_500,
      nextDue: '2027-01-05',
      overdue: { amount: 26_250, installments: [2], since: '2027-01-05', daysLate: 15 },
    });
    expect(d.loans[1]).toMatchObject({ status: 'collecting', funded: 0, people: 2 });
  });

  it('lists every customer, restricted first, then those using FamilyShield, then the rest', () => {
    expect(d.people.map((p) => p.name)).toEqual(['Alex Chen', 'Grace Chen', 'Lisa Park', 'Maya Lin', 'Sam Ortiz']);
    const [alexRow, momRow, lisaRow, mayaRow, samRow] = d.people;
    expect(alexRow).toEqual({
      personId: 'alex',
      name: 'Alex Chen',
      circle: 3,
      borrowing: { loanId: 'alex1', status: 'active', owed: 157_500 - 26_250, nextDue: '2027-01-05' },
      lending: { loans: 0, lent: 0, owedToThem: 0 },
      overdue: { amount: 26_250, daysLate: 15 },
    });
    // Mom lent on both funded loans: $900 to Alex (one payment back), $1,000 to Lisa (repaid).
    expect(momRow).toMatchObject({ borrowing: { status: 'collecting', owed: 0 }, lending: { loans: 2, lent: 190_000, owedToThem: 75_000 } });
    expect(lisaRow).toMatchObject({ borrowing: { status: 'repaid', owed: 0 } });
    expect(mayaRow).toMatchObject({ borrowing: null, lending: { loans: 1, lent: 60_000, owedToThem: 50_000 } }); // her own request was cancelled
    expect(samRow).toEqual({ personId: 'sam', name: 'Sam Ortiz', circle: 0, borrowing: null, lending: { loans: 0, lent: 0, owedToThem: 0 } });
  });

  it('never shows what a request was for', () => {
    expect(JSON.stringify(d)).not.toContain('private words');
  });

  it('is all zeros before anyone uses FamilyShield', () => {
    const empty = bankDashboard({ today: '2026-11-05', loans: [], customers }, rules);
    expect(empty.payments.onTimeRate).toBeNull();
    expect(empty.money.funded).toBe(0);
    expect(empty.loans).toEqual([]);
    expect(empty.people).toHaveLength(5);
  });
});
