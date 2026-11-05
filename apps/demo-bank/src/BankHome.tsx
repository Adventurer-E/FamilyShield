import { formatDate, formatMoney, isOpen, nextInstallment } from '@familyshield/core';
import type { AccountSummary, LoanCase } from '@familyshield/core';

const BASE_TRANSACTIONS = [
  { id: 'base-1', name: 'Corner Grocery', meta: 'Groceries · Oct 30', amount: -8_624 },
  { id: 'base-2', name: 'Westside Auto Shop', meta: 'Auto · Oct 28', amount: -32_000 },
  { id: 'base-3', name: 'Payroll deposit', meta: 'Income · Oct 25', amount: 250_000 },
];

/** What the FamilyShield entry card says, from the FamilyShield API. */
export function entrySubtitle(userId: string, myLoan: LoanCase | null, incoming: LoanCase[]): { text: string; badge?: string } {
  const needsMe = incoming.filter((l) => {
    const offer = l.offers.find((o) => o.memberId === userId);
    const agreement = l.agreements.find((a) => a.lenderId === userId);
    return (
      (l.status === 'collecting' && offer?.status === 'pending') ||
      (l.status === 'signing' && agreement && !agreement.lenderSignedAt) ||
      (l.pause?.status === 'pending' && l.pause.approvals[userId] === null)
    );
  });
  if (needsMe.length) return { text: `Your family needs you · ${needsMe.length} to review`, badge: String(needsMe.length) };
  if (myLoan && isOpen(myLoan)) {
    if (myLoan.status === 'collecting') return { text: 'Your request is collecting private offers' };
    if (myLoan.status === 'signing') return { text: 'Waiting for everyone to sign' };
    const next = nextInstallment(myLoan);
    return { text: next ? `Next family payment ${formatMoney(next.amount)} · ${formatDate(next.dueDate)}` : 'Repayment on track' };
  }
  if (myLoan?.status === 'repaid') return { text: 'Fully repaid. Your family rewards are ready.' };
  return { text: 'Get help from trusted family during a life shock.', badge: 'NEW' };
}

const Icon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export function BankHome(props: {
  firstName: string;
  accountLabel: string;
  account: AccountSummary | null;
  entry: { text: string; badge?: string };
  onOpenFamilyShield: () => void;
}) {
  const transactions = [
    ...(props.account?.transactions ?? []).map((t) => ({ id: t.id, name: t.memo, meta: `FamilyShield · ${formatDate(t.at.slice(0, 10), false)}`, amount: t.amount })),
    ...BASE_TRANSACTIONS,
  ].slice(0, 6);

  return (
    <div className="bank">
      <div className="bank-scroll">
        <header className="bank-top">
          <div className="logo">
            <svg width="34" height="22" viewBox="0 0 34 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <path d="M2 8c5-5 10-5 15 0s10 5 15 0" />
              <path d="M2 16c5-5 10-5 15 0s10 5 15 0" />
            </svg>
            BlueRiver Bank
          </div>
          <button type="button" className="round" aria-label="Notifications">
            <Icon d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
          </button>
        </header>
        <p className="greeting">Good afternoon, {props.firstName}</p>

        <section className="balance" aria-label={props.accountLabel}>
          <div className="balance-label">{props.accountLabel}</div>
          <div className="balance-amount">{props.account ? formatMoney(props.account.balance) : '…'}</div>
          <div className="balance-label">Available balance</div>
        </section>

        <nav className="quick" aria-label="Quick actions">
          {[
            ['Transfer', 'M5 12h14M13 6l6 6-6 6'],
            ['Pay bills', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5'],
            ['Deposit', 'M12 3v12M7 10l5 5 5-5M5 21h14'],
            ['Insights', 'M6 20V12M12 20V5M18 20v-9'],
          ].map(([label, d]) => (
            <button key={label} type="button">
              <span className="round">
                <Icon d={d!} />
              </span>
              {label}
            </button>
          ))}
        </nav>

        {/* The one place FamilyShield appears in the bank's own UI. */}
        <button type="button" className="fs-entry" onClick={props.onOpenFamilyShield}>
          <span className="fs-entry-icon">
            <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
          </span>
          <span className="fs-entry-text">
            <span className="fs-entry-title">
              FamilyShield {props.entry.badge ? <span className="badge">{props.entry.badge}</span> : null}
            </span>
            <span className="fs-entry-sub">{props.entry.text}</span>
          </span>
          <Icon d="M9 18l6-6-6-6" />
        </button>

        <section className="card">
          <div className="card-head">
            <h2>Recent transactions</h2>
            <a href="#transactions">See all</a>
          </div>
          <ul className="txns">
            {transactions.map((t) => (
              <li key={t.id}>
                <div>
                  <div className="txn-name">{t.name}</div>
                  <div className="txn-meta">{t.meta}</div>
                </div>
                <div className={`txn-amount${t.amount > 0 ? ' in' : ''}`}>
                  {t.amount > 0 ? '+' : '−'}
                  {formatMoney(Math.abs(t.amount))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <nav className="tabs" aria-label="Main">
        {[
          ['Home', 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
          ['Accounts', 'M3 7h18v12H3zM3 11h18'],
          ['Cards', 'M2 6h20v13H2zM6 15h4'],
          ['More', 'M5 12h.01M12 12h.01M19 12h.01'],
        ].map(([label, d], i) => (
          <button key={label} type="button" className={i === 0 ? 'active' : ''} aria-current={i === 0 ? 'page' : undefined}>
            <Icon d={d!} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
