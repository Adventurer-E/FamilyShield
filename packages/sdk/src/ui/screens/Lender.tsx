import { useState } from 'react';
import { formatDate, formatMoney, lenderSummary } from '@familyshield/core';
import type { LoanCase } from '@familyshield/core';
import { useFs } from '../context';
import { Avatar, Button, Notice, Progress, Screen } from '../kit';
import { CheckIcon } from '../icons';
import { AgreementDoc } from './Agreement';

const REASON_LABEL: Record<LoanCase['reason'], string> = {
  car: 'Car repair',
  medical: 'Medical bill',
  job: 'Job loss',
  other: 'Something else',
};

function RequestSummary({ loan }: { loan: LoanCase }) {
  const { nameOf, fullNameOf } = useFs();
  return (
    <section className="fs-card">
      <div className="fs-row">
        <Avatar id={loan.borrowerId} />
        <div className="fs-grow">
          <div style={{ fontWeight: 800 }}>{fullNameOf(loan.borrowerId)}</div>
          <div className="fs-small fs-muted">Asked their circle for support</div>
        </div>
        <span className="fs-pill warn">{REASON_LABEL[loan.reason]}</span>
      </div>
      <div className="fs-big">{formatMoney(loan.amount)}</div>
      <p className="fs-small" style={{ margin: 0, color: '#3B4659' }}>{loan.purpose}</p>
      <div className="fs-quote fs-small" style={{ fontWeight: 600 }}>
        {nameOf(loan.borrowerId)} would like to repay over {loan.months} months, interest-free.
      </div>
    </section>
  );
}

/** A circle member answers a request privately. */
export function Respond({ loan }: { loan: LoanCase }) {
  const { api, run, nameOf } = useFs();
  const mine = loan.offers[0];
  const presets = [25_000, 50_000, 100_000].filter((v) => v <= loan.amount);
  const [amount, setAmount] = useState(presets[presets.length - 1] ?? loan.amount);
  const [note, setNote] = useState('');
  const who = nameOf(loan.borrowerId);

  return (
    <Screen title={`A request from ${who}`}>
      <RequestSummary loan={loan} />
      <Notice>Your answer is private. {who} sees it, but no one else in the family does, and “not this time” is always fine.</Notice>

      {loan.status !== 'collecting' && mine?.status === 'pending' ? (
        <Notice kind="info">This request has closed.</Notice>
      ) : null}

      {loan.status === 'collecting' && mine?.status === 'pending' ? (
        <>
          <fieldset className="fs-stack" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="fs-h3" style={{ marginBottom: 10 }}>How much can you offer?</legend>
            <div className="fs-grid-3">
              {presets.map((v) => (
                <button key={v} type="button" className="fs-chip" aria-pressed={amount === v} onClick={() => setAmount(v)}>
                  {formatMoney(v)}
                </button>
              ))}
            </div>
            {loan.amount > 100_000 ? (
              <button type="button" className="fs-chip" aria-pressed={amount === loan.amount} onClick={() => setAmount(loan.amount)}>
                The full {formatMoney(loan.amount)}
              </button>
            ) : null}
          </fieldset>
          <div className="fs-field">
            <label htmlFor="fs-note">A note for {who} <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>· optional</span></label>
            <textarea id="fs-note" className="fs-input" rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Happy to help. Take the time you need." />
          </div>
          <p className="fs-tiny fs-muted" style={{ margin: 0 }}>Interest-free. You’ll both sign the terms before any money moves.</p>
          <Button onClick={() => run(() => api.respond(loan.id, { kind: 'offer', amount, note }))}>Offer {formatMoney(amount)} privately</Button>
          <Button variant="secondary" onClick={() => run(() => api.respond(loan.id, { kind: 'decline', note }))}>Not this time</Button>
        </>
      ) : null}

      {mine && mine.status !== 'pending' ? (
        <section className="fs-card soft">
          <div className="fs-row">
            <span className="fs-avatar" style={{ background: 'var(--fs-brand)', color: '#fff', border: 'none', width: 32, height: 32 }}>
              <CheckIcon size={18} />
            </span>
            <span className="fs-h3">
              {mine.status === 'offered' ? `You offered ${formatMoney(mine.amount)}` : mine.status === 'declined' ? 'You replied kindly' : 'This request closed'}
            </span>
          </div>
          <p className="fs-small" style={{ margin: 0, color: '#3B4659' }}>
            {mine.status === 'offered'
              ? loan.status === 'collecting'
                ? `${who} will see your offer. If they accept, you’ll both review and e-sign the terms before any money moves.`
                : `${who} didn’t take this offer, and nothing was signed. Thank you for offering.`
              : mine.status === 'declined'
                ? `${who} sees “not this time”. No reason needed, and nobody else in the family will know.`
                : `${who} went ahead with the offers they had.`}
          </p>
        </section>
      ) : null}
    </Screen>
  );
}

/** A lender's view of a loan they're part of: sign, approve pauses, follow repayment. */
export function LenderLoan({ loan }: { loan: LoanCase }) {
  const { api, run, data, nameOf } = useFs();
  const me = data.profile.me.id;
  const ls = lenderSummary(loan, me);
  const who = nameOf(loan.borrowerId);
  if (!ls.agreement) return <Respond loan={loan} />;
  const nextMine = loan.schedule.find((i) => !i.paidAt);

  return (
    <Screen title={`Your loan to ${who}`}>
      {loan.status === 'signing' ? (
        <>
          <AgreementDoc agreement={ls.agreement} months={loan.months} borrowerId={loan.borrowerId} />
          <Notice kind="info">
            The {+((ls.agreement.fee / ls.agreement.principal) * 100).toFixed(2)}% service fee is paid by {who} to FamilyShield. You get back exactly the {formatMoney(ls.lent)} you lend.
          </Notice>
          {ls.agreement.lenderSignedAt ? (
            <Notice kind="info">You’ve signed. The money moves once everyone has signed.</Notice>
          ) : (
            <Button onClick={() => run(() => api.signAsLender(loan.id))}>Sign and send {formatMoney(ls.lent)}</Button>
          )}
        </>
      ) : (
        <>
          <section className="fs-card">
            <div className="fs-between">
              <span className="fs-small" style={{ fontWeight: 600 }}>Repaid to you</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>
                {formatMoney(ls.received)} <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>/ {formatMoney(ls.lent)}</span>
              </span>
            </div>
            <Progress value={ls.progress} label="Repaid to you" />
            <div className="fs-tiny fs-muted">
              {loan.status === 'repaid'
                ? `Fully repaid${loan.repaidAt ? ` on ${formatDate(loan.repaidAt.slice(0, 10))}` : ''}. Your family’s partner rewards are open.`
                : nextMine
                  ? `Next: ${formatMoney(nextMine.amount)} on ${formatDate(nextMine.dueDate)}, deposited automatically`
                  : ''}
            </div>
          </section>

          {loan.pause?.status === 'pending' && loan.pause.approvals[me] === null ? (
            <section className="fs-card outline">
              <h2 className="fs-h3">{who} asked to pause one month</h2>
              <p className="fs-small" style={{ margin: 0, color: '#3B4659' }}>
                If everyone who lent approves, the remaining payments move back one month. Your answer is private.
              </p>
              <Button onClick={() => run(() => api.respondToPause(loan.id, true))}>Approve pause</Button>
              <Button variant="secondary" onClick={() => run(() => api.respondToPause(loan.id, false))}>Not this time</Button>
            </section>
          ) : null}

          <section className="fs-card">
            <div className="fs-h3">Family points</div>
            <div className="fs-small fs-muted">
              Your circle has {loan.points.toLocaleString('en-US')} points on this loan. When {who} finishes repaying, the partner rewards are shared with you.
            </div>
          </section>
        </>
      )}
    </Screen>
  );
}
