import { useState } from 'react';
import { acceptedTotal, formatMoney, takenFrom } from '@familyshield/core';
import type { LoanCase, Offer } from '@familyshield/core';
import { useFs } from '../context';
import { Avatar, Button, Notice, Screen } from '../kit';

/**
 * Accept an offer, or part of it (B5). Accepting takes as much of it as the request still
 * needs, so two $1,000 offers on a $1,500 request become $1,000 + $500; the amount can then
 * be changed (e.g. $750 + $750). Each amount is at most the offer; the total at most the request.
 */
function TakeOffer({ loan, offer }: { loan: LoanCase; offer: Offer }) {
  const { api, run, nameOf } = useFs();
  const taken = takenFrom(offer);
  const stillNeeded = Math.max(0, loan.amount - acceptedTotal(loan) + taken);
  const [draft, setDraft] = useState(String(taken / 100));
  const who = nameOf(offer.memberId);
  const inputId = `fs-take-${offer.memberId}`;

  const setTaken = (amount: number) => run(() => api.setOfferTaken(loan.id, offer.memberId, amount));
  const commit = () => {
    const dollars = Math.round(Number(draft));
    if (!Number.isFinite(dollars) || dollars * 100 === taken) return setDraft(String(taken / 100));
    // If it's refused (more than the offer or the request), the error shows and the field goes back.
    return setTaken(Math.max(0, dollars) * 100).then((ok) => ok || setDraft(String(taken / 100)));
  };

  if (!taken) {
    const take = Math.min(offer.amount, stillNeeded);
    return (
      <Button variant="secondary" disabled={take === 0} onClick={() => setTaken(take)}>
        {take === 0 ? 'Your request is covered' : take < offer.amount ? `Accept ${formatMoney(take)} of ${formatMoney(offer.amount)}` : `Accept ${formatMoney(offer.amount)}`}
      </Button>
    );
  }
  return (
    <div className="fs-stack" style={{ gap: 8 }}>
      <div className="fs-field">
        <label htmlFor={inputId}>
          Take from {who} <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>· up to {formatMoney(Math.min(offer.amount, stillNeeded))}</span>
        </label>
        <div className="fs-row">
          <span style={{ fontWeight: 800 }} aria-hidden="true">$</span>
          <input
            id={inputId}
            className="fs-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={Math.min(offer.amount, stillNeeded) / 100}
            step={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
          />
        </div>
      </div>
      {taken < offer.amount ? (
        <p className="fs-tiny fs-muted" style={{ margin: 0 }}>
          {who} offered {formatMoney(offer.amount)}. They’ll see you’re taking {formatMoney(taken)} before they sign.
        </p>
      ) : null}
      <Button variant="ghost" small onClick={() => setTaken(0)}>Don’t take this offer</Button>
    </div>
  );
}

export function Offers({ loan }: { loan: LoanCase }) {
  const { api, run, go, goHome, nameOf } = useFs();
  const accepted = acceptedTotal(loan);
  const pending = loan.offers.filter((o) => o.status === 'pending');
  const replied = loan.offers.length - pending.length;

  return (
    <Screen title="Private offers" step={2}>
      <section className="fs-card">
        <div className="fs-between">
          <div>
            <div className="fs-tiny fs-muted" style={{ fontWeight: 700 }}>YOUR REQUEST</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatMoney(loan.amount)}</div>
          </div>
          <div className="fs-small" style={{ fontWeight: 600, color: '#3B4659', textAlign: 'right' }}>over {loan.months} months</div>
        </div>
      </section>

      <Notice>Only you see who offered. Your family members don’t see each other’s answers.</Notice>

      <ul className="fs-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-live="polite">
        {loan.offers.map((offer) => (
          <li key={offer.memberId} className="fs-card outline">
            <div className="fs-row">
              <Avatar id={offer.memberId} />
              <div className="fs-grow">
                <div style={{ fontWeight: 800 }}>{nameOf(offer.memberId)}</div>
                <div className="fs-tiny fs-muted">
                  {offer.status === 'pending' ? 'Hasn’t replied yet' : offer.status === 'offered' ? 'Offered support' : 'Replied privately'}
                </div>
              </div>
              {offer.status === 'offered' ? <div style={{ fontSize: 20, fontWeight: 800 }}>{formatMoney(offer.amount)}</div> : null}
              {offer.status === 'declined' ? <span className="fs-pill">Not this time</span> : null}
              {offer.status === 'pending' ? <span className="fs-dot" aria-hidden="true" /> : null}
            </div>
            {offer.note ? <div className="fs-quote">“{offer.note}”</div> : null}
            {/* Keyed by the amount taken, so the field resets whenever the saved amount changes. */}
            {offer.status === 'offered' ? <TakeOffer key={`${offer.memberId}:${takenFrom(offer)}`} loan={loan} offer={offer} /> : null}
          </li>
        ))}
      </ul>

      {pending.length > 0 ? (
        <div className="fs-row fs-small" style={{ padding: '12px 16px', border: '1px dashed #B6BFCD', borderRadius: 16, fontWeight: 600 }}>
          <span className="fs-dot" aria-hidden="true" />
          Waiting for replies · {replied} of {loan.offers.length} replied
        </div>
      ) : null}

      <div className="fs-between" style={{ padding: '4px 2px 0' }}>
        <span className="fs-small" style={{ fontWeight: 600 }}>Taking</span>
        <span style={{ fontWeight: 800 }}>
          {formatMoney(accepted)} <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>of {formatMoney(loan.amount)}</span>
        </span>
      </div>

      <Button disabled={accepted === 0} onClick={() => go({ name: 'agreement' })}>Review agreement</Button>
      {pending.length > 0 && accepted > 0 ? (
        <p className="fs-tiny fs-muted" style={{ margin: 0, textAlign: 'center' }}>
          Signing now closes the request: anyone who hasn’t replied won’t be able to join.
        </p>
      ) : null}
      <Button variant="ghost" onClick={() => run(() => api.cancelRequest(loan.id)).then((r) => r && goHome())}>
        Cancel request
      </Button>
    </Screen>
  );
}
