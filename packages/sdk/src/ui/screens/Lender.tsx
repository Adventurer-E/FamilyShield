import { useState } from 'react';
import { formatDate, formatMoney, lenderSummary, overdueOf, reasonLabelOf, takenFrom } from '@familyshield/core';
import type { LoanCase } from '@familyshield/core';
import { useFs } from '../context';
import { Avatar, Button, DollarInput, Notice, Progress, Screen } from '../kit';
import { CheckIcon } from '../icons';
import { AgreementDoc } from './Agreement';

function RequestSummary({ loan }: { loan: LoanCase }) {
  const { nameOf, fullNameOf, data } = useFs();
  // Same labels as the borrower's "What happened?" chips (data/reasons.csv),
  // or the borrower's own words when they wrote their own reason.
  const reason = reasonLabelOf(loan, data.config.reasons);
  return (
    <section className="fs-card">
      <div className="fs-row">
        <Avatar id={loan.borrowerId} />
        <div className="fs-grow">
          <div style={{ fontWeight: 800 }}>{fullNameOf(loan.borrowerId)}</div>
          <div className="fs-small fs-muted">Asked their circle for support</div>
        </div>
        <span className="fs-pill warn">{reason}</span>
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
  const { api, run, nameOf, data } = useFs();
  const mine = loan.offers[0];
  // Quick-pick amounts from settings.csv (lender_offer_amounts), up to the request.
  const { offerAmounts } = data.config.rules;
  const presets = offerAmounts.filter((v) => v <= loan.amount);
  const largestPreset = Math.max(0, ...offerAmounts);
  const [amount, setAmount] = useState(presets[presets.length - 1] ?? loan.amount);
  const [note, setNote] = useState('');
  const who = nameOf(loan.borrowerId);
  // Same rule as respondToRequest: a whole-dollar amount from $1 up to the request.
  const amountOk = amount >= 100 && amount <= loan.amount;

  return (
    <Screen title={`A request from ${who}`}>
      <RequestSummary loan={loan} />
      <Notice>Your answer is private. {who} sees it, but no one else in the family does, and “not this time” is always fine.</Notice>

      {loan.status === 'cancelled' ? (
        <Notice kind="info">{who} cancelled this request. Nothing was signed and no money moved.</Notice>
      ) : loan.status !== 'collecting' && mine?.status === 'pending' ? (
        <Notice kind="info">This request has closed.</Notice>
      ) : null}

      {loan.status === 'collecting' && mine?.status === 'pending' && !data.eligibility.lending.allowed ? (
        <>
          <Notice kind="info">{data.eligibility.lending.message}</Notice>
          <Button variant="secondary" onClick={() => run(() => api.respond(loan.id, { kind: 'decline', note }))}>Not this time</Button>
        </>
      ) : null}

      {loan.status === 'collecting' && mine?.status === 'pending' && data.eligibility.lending.allowed ? (
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
            {loan.amount > largestPreset ? (
              <button type="button" className="fs-chip" aria-pressed={amount === loan.amount} onClick={() => setAmount(loan.amount)}>
                The full {formatMoney(loan.amount)}
              </button>
            ) : null}
          </fieldset>
          {/* Or any whole-dollar amount up to the request; the chips above are shortcuts. */}
          <div className="fs-field">
            <label htmlFor="fs-offer-amount">Or type an amount</label>
            <DollarInput id="fs-offer-amount" value={amount} invalid={!amountOk} describedBy="fs-offer-amount-help" onChange={setAmount} />
            <span id="fs-offer-amount-help" className="fs-tiny fs-muted" style={{ color: amountOk ? undefined : '#8A1C1C' }}>
              Any whole-dollar amount up to the {formatMoney(loan.amount)} {who} asked for
            </span>
          </div>
          <div className="fs-field">
            <label htmlFor="fs-note">A note for {who} <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>· optional</span></label>
            <textarea id="fs-note" className="fs-input" rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Happy to help. Take the time you need." />
          </div>
          <p className="fs-tiny fs-muted" style={{ margin: 0 }}>Interest-free. You’ll both sign the terms before any money moves.</p>
          <Button disabled={!amountOk} onClick={() => run(() => api.respond(loan.id, { kind: 'offer', amount, note }))}>
            {amountOk ? `Offer ${formatMoney(amount)} privately` : 'Choose an amount to offer'}
          </Button>
          <Button variant="secondary" onClick={() => run(() => api.respond(loan.id, { kind: 'decline', note }))}>Not this time</Button>
        </>
      ) : null}

      {mine && mine.status !== 'pending' && loan.status !== 'cancelled' ? (
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
                ? mine.accepted && takenFrom(mine) < mine.amount
                  ? `${who} accepted ${formatMoney(takenFrom(mine))} of it. You’ll both review and e-sign the terms for ${formatMoney(takenFrom(mine))} before any money moves.`
                  : mine.accepted
                    ? `${who} accepted your offer. You’ll both review and e-sign the terms before any money moves.`
                    : `${who} will see your offer. If they accept, you’ll both review and e-sign the terms before any money moves.`
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
  // What I offered: more than I lend when the borrower took only part of it (B5).
  const offered = loan.offers.find((o) => o.memberId === me)?.amount ?? ls.lent;
  const nextMine = loan.schedule.find((i) => !i.paidAt);
  // A payment to me that hasn't arrived (C2). The amounts here are my share only.
  const late = overdueOf(loan, data.eligibility.today, data.config.rules);

  return (
    <Screen title={`Your loan to ${who}`}>
      {loan.status === 'signing' ? (
        <>
          {offered > ls.lent ? (
            <Notice kind="info">
              {who} accepted {formatMoney(ls.lent)} of your {formatMoney(offered)} offer, so this agreement is for {formatMoney(ls.lent)}. You lend {formatMoney(ls.lent)}, not {formatMoney(offered)}.
            </Notice>
          ) : null}
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

          {late ? (
            <Notice kind="info">
              {who}’s payment {late.installments.join(', ')} was due {formatDate(late.since)} and hasn’t arrived yet ({formatMoney(late.amount)} to
              you). FamilyShield reminds them automatically; you don’t need to chase it.
            </Notice>
          ) : null}

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
