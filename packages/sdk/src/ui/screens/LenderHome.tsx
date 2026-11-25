import { formatDate, formatMoney, lenderHome, reasonLabelOf } from '@familyshield/core';
import type { LenderAgreementItem, LenderOfferItem, LoanCase } from '@familyshield/core';
import { useFs } from '../context';
import { Avatar, Progress, Screen } from '../kit';
import { ChevronIcon } from '../icons';
import { PilotSignup, RoleSwitch, TrustedCircle } from './Home';

type Pill = { text: string; tone: '' | 'brand' | 'solid' | 'warn' };

function PillTag({ pill }: { pill: Pill }) {
  return <span className={`fs-pill${pill.tone ? ` ${pill.tone}` : ''}`}>{pill.text}</span>;
}

/** A tappable row: who, the headline, one line of detail, and optionally a progress bar. */
function Row(props: { personId: string; title: string; detail: string; pill: Pill; progress?: { value: number; label: string }; onClick(): void }) {
  return (
    <button type="button" className="fs-list-btn" onClick={props.onClick}>
      <Avatar id={props.personId} />
      <span className="fs-grow fs-stack" style={{ gap: 4 }}>
        <span style={{ fontWeight: 800 }}>{props.title}</span>
        <span className="fs-small fs-muted">{props.detail}</span>
        {props.progress ? <Progress value={props.progress.value} label={props.progress.label} /> : null}
      </span>
      <PillTag pill={props.pill} />
      <ChevronIcon size={18} stroke="#5A6478" />
    </button>
  );
}

/** Requests from family that are waiting for my answer. */
function RequestsList({ loans }: { loans: LoanCase[] }) {
  const { go, nameOf, data } = useFs();
  return (
    <section aria-labelledby="fs-lender-requests" className="fs-stack" style={{ gap: 14 }}>
      <h2 id="fs-lender-requests" className="fs-section-title">Waiting for your answer</h2>
      <div className="fs-card flush">
        {loans.map((loan) => (
          <Row
            key={loan.id}
            personId={loan.borrowerId}
            title={`${nameOf(loan.borrowerId)} · ${formatMoney(loan.amount)}`}
            detail={`${reasonLabelOf(loan, data.config.reasons)} · over ${loan.months} months, interest-free`}
            pill={{ text: 'Reply', tone: 'solid' }}
            onClick={() => go({ name: 'respond', loanId: loan.id })}
          />
        ))}
      </div>
    </section>
  );
}

function offerText(item: LenderOfferItem, who: string): { detail: string; pill: Pill } {
  switch (item.state) {
    case 'waiting':
      return { detail: `Waiting for ${who} to choose`, pill: { text: 'Offered', tone: 'brand' } };
    case 'accepted':
      return item.taken < item.offer.amount
        ? { detail: `${who} accepted ${formatMoney(item.taken)} of your ${formatMoney(item.offer.amount)} offer · you’ll both sign the terms next`, pill: { text: 'Accepted', tone: 'brand' } }
        : { detail: `${who} accepted · you’ll both sign the terms next`, pill: { text: 'Accepted', tone: 'brand' } };
    case 'not-taken':
      return { detail: `${who} went ahead without it · nothing was signed`, pill: { text: 'Not taken', tone: '' } };
    case 'declined':
      return { detail: 'You said “not this time” · only they know', pill: { text: 'Declined', tone: '' } };
    case 'closed':
      return { detail: 'The request closed before you answered', pill: { text: 'Closed', tone: '' } };
    case 'cancelled':
      return { detail: `${who} cancelled the request · nothing was signed`, pill: { text: 'Cancelled', tone: '' } };
  }
}

/** Offers I made (or declined) that haven't become an agreement, and cancelled requests. */
function OffersList({ items }: { items: LenderOfferItem[] }) {
  const { go, nameOf } = useFs();
  return (
    <section aria-labelledby="fs-lender-offers" className="fs-stack" style={{ gap: 14 }}>
      <h2 id="fs-lender-offers" className="fs-section-title">My offers</h2>
      <div className="fs-card flush">
        {items.map((item) => {
          const who = nameOf(item.loan.borrowerId);
          const t = offerText(item, who);
          // My own offer when I made one; otherwise what they asked for, so it doesn't read as if I offered it.
          const amount = item.offer.status === 'offered' ? `you offered ${formatMoney(item.offer.amount)}` : `asked for ${formatMoney(item.loan.amount)}`;
          return (
            <Row
              key={item.loan.id}
              personId={item.loan.borrowerId}
              title={`${who} · ${amount}`}
              detail={t.detail}
              pill={t.pill}
              onClick={() => go({ name: 'respond', loanId: item.loan.id })}
            />
          );
        })}
      </div>
    </section>
  );
}

function agreementText(item: LenderAgreementItem, who: string): { detail: string; pill: Pill } {
  const next = item.next ? ` · next ${formatMoney(item.next.amount)} on ${formatDate(item.next.dueDate)}` : '';
  if (item.action === 'pause') return { detail: `${who} asked to pause one month`, pill: { text: 'Answer', tone: 'solid' } };
  switch (item.state) {
    case 'to-sign':
      return {
        detail: item.offered > item.lent ? `${who} accepted ${formatMoney(item.lent)} of your ${formatMoney(item.offered)} offer · ready for your signature` : 'Agreement ready for your signature',
        pill: { text: 'Sign', tone: 'solid' },
      };
    case 'signed':
      return { detail: 'You signed · the money moves once everyone signs', pill: { text: 'Signed', tone: '' } };
    case 'late':
      return {
        detail: `${formatMoney(item.late!.amount)} due ${formatDate(item.late!.since)} hasn’t arrived · received ${formatMoney(item.received)} so far`,
        pill: { text: 'Late', tone: 'warn' },
      };
    case 'repaying':
      return { detail: `Received ${formatMoney(item.received)} so far${next}`, pill: { text: 'Repaying', tone: 'brand' } };
    case 'repaid':
      return { detail: `Repaid in full · ${formatMoney(item.received)}`, pill: { text: 'Repaid', tone: 'brand' } };
  }
}

/** Agreements I signed (or need to sign): amount lent, received so far, next repayment. */
function AgreementsList({ items }: { items: LenderAgreementItem[] }) {
  const { go, nameOf } = useFs();
  return (
    <section aria-labelledby="fs-lender-agreements" className="fs-stack" style={{ gap: 14 }}>
      <h2 id="fs-lender-agreements" className="fs-section-title">My agreements</h2>
      <div className="fs-card flush">
        {items.map((item) => {
          const who = nameOf(item.loan.borrowerId);
          const t = agreementText(item, who);
          const moneyMoved = item.state === 'repaying' || item.state === 'late' || item.state === 'repaid';
          return (
            <Row
              key={item.loan.id}
              personId={item.loan.borrowerId}
              title={`${who} · ${formatMoney(item.lent)} lent`}
              detail={t.detail}
              pill={t.pill}
              progress={moneyMoved ? { value: item.progress, label: `Repaid to you by ${who}` } : undefined}
              onClick={() => go({ name: 'lender', loanId: item.loan.id })}
            />
          );
        })}
      </div>
    </section>
  );
}

/** Lender home (B2): family requests waiting for me, my offers, my agreements. */
export function LenderHome() {
  const { data } = useFs();
  const { profile, incoming, eligibility, config } = data;
  const view = lenderHome(incoming, profile.me.id, eligibility.today, config.rules);
  const empty = view.requests.length + view.offers.length + view.agreements.length === 0;

  return (
    <Screen title="FamilyShield" eyebrow={profile.account.label} root>
      <RoleSwitch />

      {view.totals.count > 0 ? (
        <section className="fs-card brand" aria-label="Your lending">
          <span className="fs-tiny" style={{ fontWeight: 800, letterSpacing: '.06em', opacity: 0.85 }}>HELPING YOUR FAMILY</span>
          <span className="fs-h2">{formatMoney(view.totals.lent)} lent</span>
          <span className="fs-small" style={{ opacity: 0.9 }}>
            {formatMoney(view.totals.received)} back so far
            {view.totals.outstanding > 0 ? ` · ${formatMoney(view.totals.outstanding)} still to come` : ' · all repaid'}
          </span>
          <Progress value={view.totals.lent === 0 ? 0 : view.totals.received / view.totals.lent} label="Repaid to you so far" />
        </section>
      ) : null}

      {view.requests.length > 0 ? <RequestsList loans={view.requests} /> : null}
      {view.offers.length > 0 ? <OffersList items={view.offers} /> : null}
      {view.agreements.length > 0 ? <AgreementsList items={view.agreements} /> : null}

      {empty ? (
        <section className="fs-card">
          <div className="fs-small fs-muted">No one in your family has asked for help right now. When they do, their request shows up here.</div>
        </section>
      ) : null}

      <TrustedCircle />
      <PilotSignup />
    </Screen>
  );
}
