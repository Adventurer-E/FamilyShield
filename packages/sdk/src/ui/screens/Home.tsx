import { formatDate, formatMoney, isOpen, lenderSummary, nextInstallment, repaymentSummary } from '@familyshield/core';
import type { Agreement, LoanCase, Offer } from '@familyshield/core';
import { lenderNeedsAction, useFs } from '../context';
import type { Role, Route } from '../context';
import { Avatar, Button, NotEligible, Progress, Screen } from '../kit';
import { ChevronIcon, StarIcon } from '../icons';

/** Where the borrower's own loan should open, given its state. */
export function borrowerRoute(loan: LoanCase): Route {
  switch (loan.status) {
    case 'collecting':
      return { name: 'offers' };
    case 'signing':
      return { name: 'agreement' };
    default:
      return { name: 'repay' };
  }
}

function MyLoanCard({ loan }: { loan: LoanCase }) {
  const { go, data } = useFs();
  const overdue = loan.status === 'active' ? data.eligibility.overdue : null;
  const pending = loan.offers.filter((o) => o.status === 'pending').length;
  const offered = loan.offers.filter((o) => o.status === 'offered').length;

  if (loan.status === 'collecting' || loan.status === 'signing') {
    return (
      <button type="button" className="fs-card brand" style={{ border: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => go(borrowerRoute(loan))}>
        <span className="fs-tiny" style={{ fontWeight: 800, letterSpacing: '.06em', opacity: 0.85 }}>YOUR REQUEST</span>
        <span className="fs-h2">{formatMoney(loan.amount)}</span>
        <span className="fs-small" style={{ opacity: 0.9 }}>
          {loan.status === 'collecting'
            ? `${offered} offer${offered === 1 ? '' : 's'} so far${pending ? ` · waiting on ${pending}` : ''}`
            : 'Waiting for everyone to sign'}
        </span>
      </button>
    );
  }

  const s = repaymentSummary(loan);
  const next = nextInstallment(loan);
  return (
    <button type="button" className="fs-card brand" style={{ border: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => go({ name: 'repay' })}>
      <span className="fs-tiny" style={{ fontWeight: 800, letterSpacing: '.06em', opacity: 0.85 }}>
        {loan.status === 'repaid' ? 'FULLY REPAID' : 'ACTIVE FAMILY LOAN'}
      </span>
      <span className="fs-h2">{formatMoney(s.total)}</span>
      <span className="fs-small" style={{ opacity: 0.9 }}>
        {loan.status === 'repaid'
          ? 'Every payment made. Your family rewards are open.'
          : `${s.paymentsMade} of ${s.paymentsTotal} payments made · next ${next ? formatDate(next.dueDate) : ''}`}
      </span>
      {overdue ? (
        <span className="fs-pill warn" style={{ alignSelf: 'flex-start' }}>
          Payment late · {formatMoney(overdue.amount)} to catch up
        </span>
      ) : null}
      <Progress value={s.progress} label="Repaid so far" />
    </button>
  );
}

/** One line per request I was asked about, with what (if anything) I need to do. */
function incomingStatus(loan: LoanCase, meId: string): { text: string; action: boolean; route: Route } {
  const mine = loan.offers[0];
  const agreement = loan.agreements.find((a) => a.lenderId === meId);
  const respond: Route = { name: 'respond', loanId: loan.id };
  const lender: Route = { name: 'lender', loanId: loan.id };
  if (loan.status === 'collecting') {
    if (mine?.status === 'pending') return { text: 'Asked for your help', action: true, route: respond };
    if (mine?.status === 'offered') return { text: `You offered ${formatMoney(mine.amount)}`, action: false, route: respond };
    return { text: 'You replied privately', action: false, route: respond };
  }
  if (!agreement) return { text: 'Funded by others in the family', action: false, route: respond };
  if (loan.status === 'signing') {
    return agreement.lenderSignedAt
      ? { text: 'Signed · waiting on others', action: false, route: lender }
      : { text: 'Agreement ready to sign', action: true, route: lender };
  }
  if (loan.pause?.status === 'pending' && loan.pause.approvals[meId] === null) {
    return { text: 'Asked to pause a month', action: true, route: lender };
  }
  const ls = lenderSummary(loan, meId);
  if (loan.status === 'repaid') return { text: `Repaid you ${formatMoney(ls.received)} in full`, action: false, route: lender };
  return { text: `Repaying you · ${formatMoney(ls.received)} of ${formatMoney(ls.lent)}`, action: false, route: lender };
}

/** Borrower / lender toggle shown at the top of both homes. */
export function RoleSwitch() {
  const { role, switchRole, data } = useFs();
  const lenderAction = lenderNeedsAction(data);
  const tabs: Array<{ role: Role; label: string; badge: boolean }> = [
    { role: 'borrower', label: 'I need support', badge: false },
    { role: 'lender', label: 'I’m helping family', badge: lenderAction },
  ];
  return (
    <div className="fs-roles" role="tablist" aria-label="Switch between borrowing and lending">
      {tabs.map((t) => (
        <button
          key={t.role}
          type="button"
          role="tab"
          aria-selected={role === t.role}
          className="fs-role"
          onClick={() => role !== t.role && switchRole(t.role)}
        >
          {t.label}
          {t.badge ? <span className="fs-role-dot" aria-label="needs your answer" /> : null}
        </button>
      ))}
    </div>
  );
}

/** Summary of my circle on both homes; opens the circle screen (B3). */
function TrustedCircle() {
  const { data, go } = useFs();
  const { circle } = data.profile;
  return (
    <button
      type="button"
      className="fs-card"
      style={{ border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
      onClick={() => go({ name: 'circle' })}
      aria-label="Manage your trusted circle"
    >
      <div className="fs-row">
        <div className="fs-avatars">
          {circle.map((p) => (
            <Avatar key={p.id} id={p.id} />
          ))}
        </div>
        <div className="fs-grow">
          <div style={{ fontWeight: 800 }}>Trusted circle</div>
          <div className="fs-small fs-muted">{circle.map((p) => p.nickname ?? p.firstName).join(', ') || 'Nobody yet'}</div>
        </div>
        <ChevronIcon size={18} stroke="#5A6478" />
      </div>
    </button>
  );
}

/** How one private offer stands, in the borrower's words. */
function offerStatus(o: Offer): { text: string; pill: '' | 'brand' | 'solid' } {
  if (o.status === 'offered') return o.accepted ? { text: 'Accepted', pill: 'solid' } : { text: 'Offered', pill: 'brand' };
  if (o.status === 'pending') return { text: 'Waiting', pill: '' };
  if (o.status === 'declined') return { text: 'Declined', pill: '' };
  return { text: 'Expired', pill: '' };
}

/** The second line of an offer row. */
function offerDetail(o: Offer): string {
  if (o.status === 'offered') return formatMoney(o.amount);
  if (o.status === 'pending') return 'No reply yet';
  if (o.status === 'declined') return 'Not this time';
  return 'Offer withdrawn';
}

/** Offers on my open request: who, how much, where it stands. */
function OffersList({ loan }: { loan: LoanCase }) {
  const { go, nameOf } = useFs();
  return (
    <section aria-labelledby="fs-offers">
      <h2 id="fs-offers" className="fs-section-title">Private offers</h2>
      <div className="fs-card flush">
        {loan.offers.map((o) => {
          const st = offerStatus(o);
          return (
            <button key={o.memberId} type="button" className="fs-list-btn" onClick={() => go(borrowerRoute(loan))}>
              <Avatar id={o.memberId} />
              <span className="fs-grow">
                <span style={{ display: 'block', fontWeight: 800 }}>{nameOf(o.memberId)}</span>
                <span className="fs-small fs-muted">{offerDetail(o)}</span>
              </span>
              <span className={`fs-pill${st.pill ? ` ${st.pill}` : ''}`}>{st.text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Where one agreement stands: who still has to sign, or how much is repaid. */
function agreementStatus(loan: LoanCase, a: Agreement): string {
  if (!a.borrowerSignedAt) return 'Waiting for your signature';
  if (!a.lenderSignedAt) return 'Waiting for their signature';
  const ls = lenderSummary(loan, a.lenderId);
  if (loan.status === 'repaid' || ls.outstanding <= 0) return `Repaid in full · ${formatMoney(ls.lent)}`;
  if (loan.status === 'signing') return 'Signed by both · starts once everyone signs';
  return `Repaid ${formatMoney(ls.received)} of ${formatMoney(ls.lent)}`;
}

/** One agreement per lender: amount, signed or not, and repayment progress. */
function AgreementsList({ loan }: { loan: LoanCase }) {
  const { go, nameOf } = useFs();
  return (
    <section aria-labelledby="fs-agreements">
      <h2 id="fs-agreements" className="fs-section-title">Agreements &amp; repayment</h2>
      <div className="fs-card flush">
        {loan.agreements.map((a) => {
          const ls = lenderSummary(loan, a.lenderId);
          const signed = !!(a.borrowerSignedAt && a.lenderSignedAt);
          return (
            <button key={a.lenderId} type="button" className="fs-list-btn" onClick={() => go(borrowerRoute(loan))}>
              <Avatar id={a.lenderId} />
              <span className="fs-grow fs-stack" style={{ gap: 4 }}>
                <span style={{ fontWeight: 800 }}>
                  {nameOf(a.lenderId)} · {formatMoney(a.principal)}
                </span>
                <span className="fs-small fs-muted">{agreementStatus(loan, a)}</span>
                {signed && loan.status !== 'signing' ? <Progress value={ls.progress} label={`Repaid to ${nameOf(a.lenderId)}`} /> : null}
              </span>
              <span className={`fs-pill${signed ? ' brand' : ''}`}>{signed ? 'Signed' : 'Waiting'}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** "Initiate new request": always shown; only one open request or loan at a time. */
function NewRequest({ hasLoan }: { hasLoan: boolean }) {
  const { data, go } = useFs();
  const { eligible } = data.eligibility;
  return (
    <section className="fs-card soft" aria-labelledby="fs-start">
      {hasLoan ? null : (
        <>
          <div className="fs-small" style={{ fontWeight: 700, color: 'var(--fs-brand-strong)' }}>When life happens, you’re not alone.</div>
          <h2 id="fs-start" className="fs-h2">Get support from your trusted circle.</h2>
          <p className="fs-small" style={{ margin: 0, color: '#3B4659' }}>
            Ask privately, receive private offers and keep clear, signed terms, without leaving your bank.
          </p>
        </>
      )}
      {hasLoan ? <h2 id="fs-start" className="fs-section-title" style={{ margin: 0 }}>Need more help?</h2> : null}
      <Button onClick={() => go({ name: 'request' })} disabled={!eligible}>
        Initiate new request
      </Button>
      {eligible ? null : <NotEligible />}
    </section>
  );
}

/** Borrower home (B1): my request or loan, its offers and agreements, and a way to ask again. */
export function BorrowerHome() {
  const { data } = useFs();
  const { myLoan, profile } = data;
  const open = !!myLoan && isOpen(myLoan);
  const showOffers = !!myLoan && myLoan.status === 'collecting' && myLoan.offers.length > 0;
  const showAgreements = !!myLoan && myLoan.status !== 'cancelled' && myLoan.agreements.length > 0;

  return (
    <Screen title="FamilyShield" eyebrow={profile.account.label} root>
      <RoleSwitch />
      {myLoan && myLoan.status !== 'cancelled' ? <MyLoanCard loan={myLoan} /> : null}
      {showOffers ? <OffersList loan={myLoan} /> : null}
      {showAgreements ? <AgreementsList loan={myLoan} /> : null}
      <NewRequest hasLoan={open} />

      {myLoan && myLoan.points > 0 ? (
        <section className="fs-card">
          <div className="fs-row">
            <StarIcon stroke="var(--fs-brand)" />
            <div className="fs-grow" style={{ fontWeight: 800 }}>Family points</div>
            <div style={{ fontWeight: 800 }}>{myLoan.points.toLocaleString('en-US')}</div>
          </div>
          <div className="fs-small fs-muted">
            Your circle earns points when family helps and when you repay on time. Partner rewards open when the loan is fully repaid.
          </div>
        </section>
      ) : null}

      <TrustedCircle />
    </Screen>
  );
}

/**
 * Lender home. Placeholder content reused from the old shared hub;
 * the real layout is ticket B2 (#28).
 */
export function LenderHome() {
  const { data, go, nameOf } = useFs();
  const { incoming, profile } = data;

  return (
    <Screen title="FamilyShield" eyebrow={profile.account.label} root>
      <RoleSwitch />
      <h2 className="fs-section-title">Your family’s requests</h2>
      {incoming.length > 0 ? (
        <div className="fs-card flush">
          {incoming.map((loan) => {
            const st = incomingStatus(loan, profile.me.id);
            return (
              <button key={loan.id} type="button" className="fs-list-btn" onClick={() => go(st.route)}>
                <Avatar id={loan.borrowerId} />
                <span className="fs-grow">
                  <span style={{ display: 'block', fontWeight: 800 }}>
                    {nameOf(loan.borrowerId)} · {formatMoney(loan.amount)}
                  </span>
                  <span className="fs-small fs-muted">{st.text}</span>
                </span>
                {st.action ? <span className="fs-pill solid">Action</span> : null}
                <ChevronIcon size={18} stroke="#5A6478" />
              </button>
            );
          })}
        </div>
      ) : (
        <section className="fs-card">
          <div className="fs-small fs-muted">No one in your family has asked for help right now. When they do, their request shows up here.</div>
        </section>
      )}

      <TrustedCircle />
    </Screen>
  );
}
