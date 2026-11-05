import { formatDate, formatMoney, lenderSummary, nextInstallment, repaymentSummary } from '@familyshield/core';
import type { LoanCase } from '@familyshield/core';
import { useFs } from '../context';
import type { Route } from '../context';
import { Avatar, Button, Progress, Screen } from '../kit';
import { ChevronIcon, DocIcon, LockIcon, StarIcon } from '../icons';

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
  const { go } = useFs();
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

export function Hub() {
  const { data, go, nameOf } = useFs();
  const { myLoan, incoming, profile } = data;
  const open = myLoan && myLoan.status !== 'repaid';

  return (
    <Screen title="FamilyShield" eyebrow={profile.account.label} root>
      {myLoan ? <MyLoanCard loan={myLoan} /> : null}

      {!open ? (
        <section className="fs-card soft" aria-labelledby="fs-start">
          <div className="fs-small" style={{ fontWeight: 700, color: 'var(--fs-brand-strong)' }}>When life happens, you’re not alone.</div>
          <h2 id="fs-start" className="fs-h2">Get support from your trusted circle.</h2>
          <p className="fs-small" style={{ margin: 0, color: '#3B4659' }}>
            Ask privately, receive private offers and keep clear, signed terms, without leaving your bank.
          </p>
          <Button onClick={() => go({ name: 'request' })}>{myLoan ? 'Start a new request' : 'Start a request'}</Button>
        </section>
      ) : null}

      {incoming.length > 0 ? (
        <>
          <h2 className="fs-section-title">Your family’s requests</h2>
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
        </>
      ) : null}

      <section className="fs-card">
        <div className="fs-row">
          <div className="fs-avatars">
            {profile.circle.map((p) => (
              <Avatar key={p.id} id={p.id} />
            ))}
          </div>
          <div className="fs-grow">
            <div style={{ fontWeight: 800 }}>Trusted circle</div>
            <div className="fs-small fs-muted">{profile.circle.map((p) => p.nickname ?? p.firstName).join(', ') || 'Nobody yet'}</div>
          </div>
        </div>
      </section>

      {myLoan ? (
        <div className="fs-card flush">
          <button type="button" className="fs-list-btn" onClick={() => go(borrowerRoute(myLoan))}>
            <span className="fs-tile"><LockIcon /></span>
            <span className="fs-grow">
              <span style={{ display: 'block', fontWeight: 800 }}>Private offers</span>
              <span className="fs-small fs-muted">
                {myLoan.offers.filter((o) => o.status === 'offered').length} offers ·{' '}
                {myLoan.offers.filter((o) => o.status !== 'pending').length} of {myLoan.offers.length} replied
              </span>
            </span>
            <ChevronIcon size={18} stroke="#5A6478" />
          </button>
          <button type="button" className="fs-list-btn" onClick={() => go(myLoan.status === 'collecting' ? { name: 'agreement' } : borrowerRoute(myLoan))}>
            <span className="fs-tile"><DocIcon /></span>
            <span className="fs-grow">
              <span style={{ display: 'block', fontWeight: 800 }}>Agreements &amp; repayment</span>
              <span className="fs-small fs-muted">
                {myLoan.status === 'collecting' ? 'Nothing signed yet' : myLoan.status === 'signing' ? 'Waiting for signatures' : myLoan.status === 'repaid' ? 'Fully repaid' : 'Signed · repayment on track'}
              </span>
            </span>
            <ChevronIcon size={18} stroke="#5A6478" />
          </button>
        </div>
      ) : null}

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
    </Screen>
  );
}
