import { describe, expect, it } from 'vitest';
import {
  cancelRequest,
  createLoanCase,
  lenderAction,
  lenderHome,
  recordPayment,
  requestPause,
  respondToPause,
  respondToRequest,
  setOfferAccepted,
  signAsBorrower,
  signAsLender,
} from '../src';
import type { LoanCase } from '../src';

const T0 = '2026-11-05T15:00:00.000Z';
const TODAY = '2026-11-20';

function newRequest(id = 'loan_1', borrowerId = 'alex', circle = ['mom', 'maya', 'lisa']): LoanCase {
  return createLoanCase({ id, borrowerId, circle, reason: 'car', purpose: 'Car broke down.', amount: 150_000, months: 10, now: T0 });
}

/** Mom offers $1,000 and Maya $500; Alex accepts both and signs. Lisa never answers. */
function signing(): LoanCase {
  let loan = newRequest();
  loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: 100_000 }, T0);
  loan = respondToRequest(loan, 'maya', { kind: 'offer', amount: 50_000 }, T0);
  loan = setOfferAccepted(loan, 'mom', true);
  loan = setOfferAccepted(loan, 'maya', true);
  return signAsBorrower(loan, T0);
}

function active(): LoanCase {
  return signAsLender(signAsLender(signing(), 'mom', T0), 'maya', T0);
}

/** The same as the backend's redactForLender: only this lender's own share. */
function redact(loan: LoanCase, viewer: string): LoanCase {
  const copy = structuredClone(loan);
  copy.offers = copy.offers.filter((o) => o.memberId === viewer);
  copy.agreements = copy.agreements.filter((a) => a.lenderId === viewer);
  copy.schedule = copy.schedule.map((i) => {
    const parts = i.parts.filter((p) => p.to === viewer);
    return { ...i, parts, amount: parts.reduce((t, p) => t + p.amount, 0) };
  });
  if (copy.pause) copy.pause.approvals = viewer in copy.pause.approvals ? { [viewer]: copy.pause.approvals[viewer] ?? null } : {};
  return copy;
}

describe('requests waiting for my answer', () => {
  it('lists open requests I have not answered, with a reply action', () => {
    const loan = newRequest();
    const view = lenderHome([loan], 'mom', TODAY);
    expect(view.requests.map((l) => l.id)).toEqual(['loan_1']);
    expect(view.offers).toEqual([]);
    expect(view.agreements).toEqual([]);
    expect(lenderAction(loan, 'mom')).toBe('reply');
  });

  it('leaves out my own requests and loans I was not asked about', () => {
    const mine = newRequest('loan_3', 'mom', ['alex']);
    const other = newRequest('loan_4', 'alex', ['maya']);
    const view = lenderHome([mine, other], 'mom', TODAY);
    expect(view).toMatchObject({ requests: [], offers: [], agreements: [] });
  });
});

describe('my offers', () => {
  it('follows an offer from waiting to accepted', () => {
    let loan = respondToRequest(newRequest(), 'mom', { kind: 'offer', amount: 100_000 }, T0);
    expect(lenderHome([loan], 'mom', TODAY).offers).toMatchObject([{ state: 'waiting', offer: { amount: 100_000 } }]);
    expect(lenderHome([loan], 'mom', TODAY).requests).toEqual([]);
    loan = setOfferAccepted(loan, 'mom', true);
    expect(lenderHome([loan], 'mom', TODAY).offers).toMatchObject([{ state: 'accepted' }]);
  });

  it('shows a decline, an offer that was not taken, and a request that closed before I answered', () => {
    let loan = newRequest();
    loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: 100_000 }, T0);
    loan = respondToRequest(loan, 'maya', { kind: 'offer', amount: 50_000 }, T0);
    loan = respondToRequest(loan, 'lisa', { kind: 'decline' }, T0);
    expect(lenderHome([loan], 'lisa', TODAY).offers).toMatchObject([{ state: 'declined' }]);

    loan = signAsBorrower(setOfferAccepted(loan, 'mom', true), T0); // Maya's offer not taken
    expect(lenderHome([loan], 'maya', TODAY).offers).toMatchObject([{ state: 'not-taken' }]);

    const unanswered = signAsBorrower(setOfferAccepted(respondToRequest(newRequest(), 'mom', { kind: 'offer', amount: 100_000 }, T0), 'mom', true), T0);
    expect(lenderHome([unanswered], 'lisa', TODAY).offers).toMatchObject([{ state: 'closed' }]);
  });
  it('keeps a cancelled request for everyone asked, whatever they had answered', () => {
    let loan = newRequest();
    loan = respondToRequest(loan, 'mom', { kind: 'offer', amount: 100_000 }, T0);
    loan = setOfferAccepted(loan, 'mom', true);
    loan = respondToRequest(loan, 'lisa', { kind: 'decline' }, T0);
    loan = cancelRequest(loan); // Maya hadn't replied
    for (const who of ['mom', 'maya', 'lisa']) {
      const view = lenderHome([redact(loan, who)], who, TODAY);
      expect(view.offers).toMatchObject([{ state: 'cancelled' }]);
      expect(view.requests).toEqual([]);
      expect(lenderAction(loan, who)).toBeNull();
    }
  });
});

describe('my agreements', () => {
  it('asks me to sign, then waits on the others', () => {
    let loan = signing();
    expect(lenderHome([loan], 'mom', TODAY).agreements).toMatchObject([{ state: 'to-sign', action: 'sign', lent: 100_000, received: 0, next: null }]);
    loan = signAsLender(loan, 'mom', T0);
    expect(lenderHome([loan], 'mom', TODAY).agreements).toMatchObject([{ state: 'signed', action: null }]);
    expect(lenderHome([loan], 'mom', TODAY).totals).toEqual({ lent: 0, received: 0, outstanding: 0, count: 0 });
  });

  it('shows what I lent, what came back and my share of the next repayment', () => {
    let loan = active();
    expect(lenderHome([loan], 'mom', TODAY).agreements[0]).toMatchObject({
      state: 'repaying',
      lent: 100_000,
      received: 0,
      outstanding: 100_000,
      next: { amount: 10_000, dueDate: '2026-12-05' },
      late: null,
    });
    loan = recordPayment(loan, '2026-12-05T12:00:00.000Z');
    const view = lenderHome([loan], 'mom', '2026-12-06');
    expect(view.agreements[0]).toMatchObject({ received: 10_000, outstanding: 90_000, progress: 0.1, next: { amount: 10_000, dueDate: '2027-01-05' } });
    expect(view.totals).toEqual({ lent: 100_000, received: 10_000, outstanding: 90_000, count: 1 });
  });

  it('flags my share of a late repayment', () => {
    const view = lenderHome([active()], 'maya', '2027-01-10');
    expect(view.agreements[0]).toMatchObject({ state: 'late', late: { amount: 10_000, since: '2026-12-05' } });
  });

  it('puts a pause waiting for my answer first', () => {
    const quiet = { ...active(), id: 'loan_9' };
    let paused = requestPause(active(), T0);
    expect(lenderHome([quiet, paused], 'mom', TODAY).agreements.map((a) => [a.loan.id, a.action])).toEqual([
      ['loan_1', 'pause'],
      ['loan_9', null],
    ]);
    paused = respondToPause(paused, 'mom', true);
    expect(lenderHome([paused], 'mom', TODAY).agreements[0]!.action).toBeNull();
  });

  it('shows a loan repaid in full', () => {
    let loan = active();
    while (loan.status === 'active') loan = recordPayment(loan, T0);
    expect(lenderHome([loan], 'mom', TODAY).agreements[0]).toMatchObject({ state: 'repaid', received: 100_000, progress: 1, next: null });
  });

  it('gives the same figures on a loan redacted for the lender', () => {
    let loan = recordPayment(active(), '2026-12-05T12:00:00.000Z');
    loan = requestPause(loan, '2026-12-06T12:00:00.000Z');
    for (const who of ['mom', 'maya']) {
      const full = lenderHome([loan], who, '2027-02-10').agreements[0]!;
      const redacted = lenderHome([redact(loan, who)], who, '2027-02-10').agreements[0]!;
      expect({ ...redacted, loan: null }).toEqual({ ...full, loan: null });
    }
  });
});
