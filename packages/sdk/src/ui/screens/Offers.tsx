import { useState } from 'react';
import { acceptedTotal, formatMoney, takenFrom } from '@familyshield/core';
import type { LoanCase, Offer } from '@familyshield/core';
import { useFs } from '../context';
import { Avatar, Button, DollarInput, Notice, Screen } from '../kit';

/**
 * How much to take from one offer (B5): the borrower types it straight away, $0 = not taking it.
 * "Take $1,000" fills in as much of the offer as the request still needs, so two $1,000 offers
 * on a $1,500 request can be $1,000 + $500, or typed as $750 + $750. Each amount is at most
 * the offer, and the total at most the request (the rules refuse anything else).
 */
function TakeOffer({ loan, offer }: { loan: LoanCase; offer: Offer }) {
  const { api, run, nameOf } = useFs();
  const taken = takenFrom(offer);
  const most = Math.min(offer.amount, Math.max(0, loan.amount - acceptedTotal(loan) + taken));
  const [draft, setDraft] = useState(taken);
  const who = nameOf(offer.memberId);
  const id = `fs-take-${offer.memberId}`;

  const save = (cents: number) => {
    setDraft(cents);
    if (cents === taken) return;
    // If it's refused (more than the offer or the request), the error shows and the box goes back.
    void run(() => api.setOfferTaken(loan.id, offer.memberId, cents)).then((ok) => ok || setDraft(taken));
  };

  return (
    <div className="fs-field">
      <label htmlFor={id}>How much to take from {who}</label>
      <div className="fs-row">
        <span className="fs-grow">
          <DollarInput id={id} value={draft} invalid={draft > most} describedBy={`${id}-help`} onChange={setDraft} onCommit={() => save(draft)} />
        </span>
        {most > 0 && draft !== most ? (
          // onMouseDown keeps focus in the box, so leaving it doesn't save the typed amount first.
          <button type="button" className="fs-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => save(most)}>
            Take {formatMoney(most)}
          </button>
        ) : null}
      </div>
      <p id={`${id}-help`} className="fs-tiny fs-muted" style={{ margin: 0, color: draft > most ? '#8A1C1C' : undefined }}>
        {most === 0 && taken === 0
          ? 'Your request is already covered. Lower another amount to take some of this offer.'
          : `Up to ${formatMoney(most)} · $0 means you’re not taking it.`}
        {taken > 0 && taken < offer.amount ? ` ${who} will see you’re taking ${formatMoney(taken)} of ${formatMoney(offer.amount)} before they sign.` : ''}
      </p>
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
