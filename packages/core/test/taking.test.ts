import { describe, expect, it } from 'vitest';
import {
  acceptedTotal,
  createLoanCase,
  draftAgreements,
  respondToRequest,
  setOfferAccepted,
  setOfferTaken,
  signAsBorrower,
  signAsLender,
  takenFrom,
  withdrawMember,
} from '../src';
import type { LoanCase } from '../src';

const T0 = '2026-11-05T15:00:00.000Z';

/** Alex asks for $1,500; Maya and Grace (mom) each offer $1,000; Lisa says not this time. */
function twoBigOffers(): LoanCase {
  let loan = createLoanCase({ id: 'loan_1', borrowerId: 'alex', circle: ['mom', 'maya', 'lisa'], reason: 'car', purpose: 'Car broke down.', amount: 150_000, months: 10, now: T0 });
  loan = respondToRequest(loan, 'maya', { kind: 'offer', amount: 100_000 }, T0);
  loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: 100_000 }, T0);
  return respondToRequest(loan, 'lisa', { kind: 'decline' }, T0);
}

describe('taking part of an offer (B5)', () => {
  it('combines two offers that add up to more than the request', () => {
    let loan = twoBigOffers();
    loan = setOfferAccepted(loan, 'maya', true);
    expect(() => setOfferAccepted(loan, 'mom', true)).toThrow(/more than you asked for/);

    loan = setOfferTaken(loan, 'maya', 75_000);
    loan = setOfferTaken(loan, 'mom', 75_000);
    expect(acceptedTotal(loan)).toBe(150_000);
    expect(loan.offers.map((o) => [o.memberId, o.amount, takenFrom(o)])).toEqual([
      ['mom', 100_000, 75_000],
      ['maya', 100_000, 75_000],
      ['lisa', 0, 0],
    ]);
  });

  it('draws up each agreement, fee and schedule for the amount taken', () => {
    let loan = setOfferTaken(setOfferTaken(twoBigOffers(), 'maya', 75_000), 'mom', 75_000);
    expect(draftAgreements(loan)).toEqual([
      { lenderId: 'mom', principal: 75_000, interestRate: 0, fee: 3_750, total: 78_750 },
      { lenderId: 'maya', principal: 75_000, interestRate: 0, fee: 3_750, total: 78_750 },
    ]);
    loan = signAsBorrower(loan, T0);
    loan = signAsLender(signAsLender(loan, 'mom', T0), 'maya', T0);
    expect(loan.status).toBe('active');
    const toMaya = loan.schedule.flatMap((i) => i.parts.filter((p) => p.to === 'maya').map((p) => p.amount));
    expect(toMaya.reduce((a, b) => a + b, 0)).toBe(75_000);
    expect(loan.schedule.reduce((t, i) => t + i.amount, 0)).toBe(157_500);
  });

  it('keeps each amount within the offer, whole dollars, and the total within the request', () => {
    const loan = twoBigOffers();
    expect(() => setOfferTaken(loan, 'maya', 100_100)).toThrow(/up to the \$1,000 offered/);
    expect(() => setOfferTaken(loan, 'maya', 75_050)).toThrow(/whole-dollar/);
    expect(() => setOfferTaken(loan, 'maya', -100)).toThrow(/whole-dollar/);
    expect(() => setOfferTaken(setOfferTaken(loan, 'maya', 100_000), 'mom', 50_100)).toThrow(/more than you asked for/);
    expect(() => setOfferTaken(loan, 'lisa', 10_000)).toThrow(/Only offers that were made/);
  });

  it('treats $0 as not taking it, and accepting as taking the whole offer', () => {
    let loan = setOfferTaken(twoBigOffers(), 'maya', 50_000);
    loan = setOfferTaken(loan, 'maya', 0);
    expect(loan.offers.find((o) => o.memberId === 'maya')).toMatchObject({ accepted: false });
    expect(loan.offers.find((o) => o.memberId === 'maya')!.taken).toBeUndefined();
    loan = setOfferAccepted(setOfferTaken(loan, 'maya', 50_000), 'maya', true);
    expect(takenFrom(loan.offers.find((o) => o.memberId === 'maya')!)).toBe(100_000);
  });

  it('reads an accepted offer with no amount taken (older data) as the whole offer', () => {
    const loan = setOfferAccepted(twoBigOffers(), 'maya', true);
    const maya = { ...loan.offers.find((o) => o.memberId === 'maya')! };
    delete maya.taken;
    expect(takenFrom(maya)).toBe(100_000);
  });

  it('drops the amount taken when the person is removed from the circle', () => {
    const loan = withdrawMember(setOfferTaken(twoBigOffers(), 'maya', 75_000), 'maya');
    expect(loan.offers.find((o) => o.memberId === 'maya')).toMatchObject({ status: 'expired', accepted: false });
    expect(acceptedTotal(loan)).toBe(0);
  });

  it('can only change before signing', () => {
    const signed = signAsBorrower(setOfferTaken(twoBigOffers(), 'maya', 75_000), T0);
    expect(() => setOfferTaken(signed, 'maya', 50_000)).toThrow(/before you sign/);
  });
});
