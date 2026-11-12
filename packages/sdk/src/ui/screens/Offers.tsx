import { acceptedTotal, formatMoney } from '@familyshield/core';
import type { LoanCase } from '@familyshield/core';
import { useFs } from '../context';
import { Avatar, Button, DemoHint, Notice, Screen } from '../kit';

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
            {offer.status === 'offered' ? (
              <Button
                variant="secondary"
                pressed={offer.accepted}
                onClick={() => run(() => api.setOfferAccepted(loan.id, offer.memberId, !offer.accepted))}
              >
                {offer.accepted ? 'Accepted ✓' : `Accept ${formatMoney(offer.amount)}`}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {pending.length > 0 ? (
        <div className="fs-row fs-small" style={{ padding: '12px 16px', border: '1px dashed #B6BFCD', borderRadius: 16, fontWeight: 600 }}>
          <span className="fs-dot" aria-hidden="true" />
          Waiting for replies · {replied} of {loan.offers.length} replied
        </div>
      ) : null}

      {pending.length > 0 ? (
        <DemoHint>To answer as someone in your circle, switch users in the functional mockup bar.</DemoHint>
      ) : null}

      <div className="fs-between" style={{ padding: '4px 2px 0' }}>
        <span className="fs-small" style={{ fontWeight: 600 }}>Accepted</span>
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
