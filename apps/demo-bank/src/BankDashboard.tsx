import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_REASONS, formatDate, formatMoney } from '@familyshield/core';
import type { BankDashboard as Dashboard, DashboardLoan, LoanStatus } from '@familyshield/core';
import { host } from './host';

/**
 * The partner bank's FamilyShield dashboard (C4), for bank staff: activity and
 * risk across every customer, from GET /v1/bank/dashboard. Not part of the
 * customer app. Names, amounts and payment history only: never what a request
 * was for or what family members wrote to each other.
 */

const STATUS_LABEL: Record<LoanStatus, string> = {
  collecting: 'Collecting offers',
  signing: 'Signing',
  active: 'Repaying',
  repaid: 'Repaid',
  cancelled: 'Cancelled',
};

const reasonLabel = (id: string) => DEFAULT_REASONS.find((r) => r.id === id)?.label ?? id;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

function useDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    host
      .bankDashboard()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    refresh();
    return host.subscribe(refresh);
  }, [refresh]);
  return { data, error };
}

function Tile(props: { label: string; value: string; detail?: string; alert?: boolean }) {
  return (
    <div className={`dash-tile${props.alert ? ' alert' : ''}`}>
      <div className="dash-tile-label">{props.label}</div>
      <div className="dash-tile-value">{props.value}</div>
      {props.detail ? (
        <div className="dash-tile-detail">
          {props.alert ? <AlertMark /> : null}
          {props.detail}
        </div>
      ) : null}
    </div>
  );
}

function AlertMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5h.01" />
    </svg>
  );
}

/** One named row, a bar against its whole, and the figure. */
function Meter(props: { name: string; value: number; of: number; figure: string; tone?: 'accent' | 'muted' }) {
  const share = props.of > 0 ? props.value / props.of : 0;
  const title = `${props.name}: ${props.figure}${props.of > 0 ? ` (${pct(share)})` : ''}`;
  return (
    <li className="meter" title={title}>
      <span className="meter-name">{props.name}</span>
      <span className="meter-track" role="img" aria-label={title}>
        {share > 0 ? <span className={`meter-fill ${props.tone ?? 'accent'}`} style={{ width: `${Math.max(share * 100, 1.5)}%` }} /> : null}
      </span>
      <span className="meter-figure">{props.figure}</span>
    </li>
  );
}

function Overdue({ loan }: { loan: DashboardLoan }) {
  if (!loan.overdue) return null;
  return (
    <span className="dash-status critical">
      <AlertMark /> {loan.overdue.daysLate} days late
    </span>
  );
}

export function BankDashboard() {
  const { data, error } = useDashboard();
  if (error) return <div className="dash-empty" role="alert">Can’t load the dashboard. {error}</div>;
  if (!data) return <div className="dash-empty">Loading…</div>;

  const { money, payments, overdue, requests, customers } = data;
  const overdueLoans = data.loans.filter((l) => l.overdue);
  const statuses: LoanStatus[] = ['collecting', 'signing', 'active', 'repaid', 'cancelled'];

  return (
    <main className="dash" aria-labelledby="dash-title">
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">BlueRiver Bank · staff only</div>
          <h1 id="dash-title">FamilyShield dashboard</h1>
        </div>
        <div className="dash-asof">As of {formatDate(data.asOf)}</div>
      </header>

      {requests.total === 0 ? (
        <p className="dash-note">
          No FamilyShield activity yet. Switch to <strong>Customer app</strong> and send a request as Alex; the figures here follow.
        </p>
      ) : null}

      <section className="dash-tiles" aria-label="Headline figures">
        <Tile label="Lent by families" value={formatMoney(money.funded)} detail={`${plural(customers.lenders, 'lender')} · ${plural(customers.borrowers, 'borrower')}`} />
        <Tile label="Still owed to lenders" value={formatMoney(money.outstanding)} detail={`${formatMoney(money.repaidToLenders)} repaid so far`} />
        <Tile label="Service fees collected" value={formatMoney(money.feesCollected)} detail={`of ${formatMoney(money.feesContracted)} on signed loans`} />
        <Tile
          label="Payments on time"
          value={payments.onTimeRate === null ? '—' : pct(payments.onTimeRate)}
          detail={payments.made ? `${payments.onTime} of ${plural(payments.made, 'payment')}` : 'No payments yet'}
        />
        <Tile
          label="Overdue"
          value={formatMoney(overdue.amount)}
          alert={overdue.loans > 0}
          detail={overdue.loans ? `${plural(overdue.loans, 'loan')} · ${plural(customers.restricted, 'customer')} restricted` : 'Every loan is up to date'}
        />
      </section>

      <div className="dash-grid">
        <section className="dash-card" aria-labelledby="dash-requests">
          <h2 id="dash-requests">Requests by status</h2>
          <p className="dash-sub">{plural(requests.total, 'request')} in all</p>
          <ul className="meters">
            {statuses.map((s) => (
              <Meter key={s} name={STATUS_LABEL[s]} value={requests.byStatus[s]} of={requests.total} figure={String(requests.byStatus[s])} tone={s === 'cancelled' ? 'muted' : 'accent'} />
            ))}
          </ul>
        </section>

        <section className="dash-card" aria-labelledby="dash-money">
          <h2 id="dash-money">Repayment</h2>
          <p className="dash-sub">{formatMoney(money.requested)} asked for · {formatMoney(money.funded)} lent</p>
          <ul className="meters">
            <Meter name="Repaid to lenders" value={money.repaidToLenders} of={money.funded} figure={formatMoney(money.repaidToLenders)} />
            <Meter name="Still owed" value={money.outstanding} of={money.funded} figure={formatMoney(money.outstanding)} tone="muted" />
            <Meter name="Owed on overdue loans" value={overdue.atRisk} of={money.funded} figure={formatMoney(overdue.atRisk)} tone="muted" />
            <Meter name="Fees collected" value={money.feesCollected} of={money.feesContracted} figure={formatMoney(money.feesCollected)} />
          </ul>
        </section>
      </div>

      <section className="dash-card" aria-labelledby="dash-overdue">
        <h2 id="dash-overdue">Overdue loans</h2>
        <p className="dash-sub">
          Unpaid more than a few days after the due date (overdue_grace_days). These customers can’t offer to lend to family until they catch up.
        </p>
        {overdueLoans.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th scope="col">Borrower</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">To catch up</th>
                  <th scope="col">Payments</th>
                  <th scope="col">Due since</th>
                  <th scope="col" className="num">Left to repay</th>
                  <th scope="col" className="num">Lenders</th>
                </tr>
              </thead>
              <tbody>
                {overdueLoans.map((l) => (
                  <tr key={l.loanId}>
                    <th scope="row">{l.borrowerName}</th>
                    <td><Overdue loan={l} /></td>
                    <td className="num">{formatMoney(l.overdue!.amount)}</td>
                    <td>{l.overdue!.installments.map((n) => `#${n}`).join(', ')}</td>
                    <td>{formatDate(l.overdue!.since)}</td>
                    <td className="num">{formatMoney(l.total - l.paid)}</td>
                    <td className="num">{l.people}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dash-ok">No overdue payments. To see one, repay nothing and use <strong>+1 month</strong> in the top bar.</p>
        )}
      </section>

      <section className="dash-card" aria-labelledby="dash-all">
        <h2 id="dash-all">All requests</h2>
        <p className="dash-sub">Overdue first, then newest first. Cancelled requests are left out.</p>
        {data.loans.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th scope="col">Borrower</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Asked on</th>
                  <th scope="col" className="num">Amount asked</th>
                  <th scope="col" className="num">Lent</th>
                  <th scope="col" className="num">Repaid</th>
                  <th scope="col">Next due</th>
                </tr>
              </thead>
              <tbody>
                {data.loans.map((l) => (
                  <tr key={l.loanId}>
                    <th scope="row">{l.borrowerName}</th>
                    <td>{l.overdue ? <Overdue loan={l} /> : <span className="dash-status">{STATUS_LABEL[l.status]}</span>}</td>
                    <td>{reasonLabel(l.reason)}</td>
                    <td>{formatDate(l.createdAt.slice(0, 10))}</td>
                    <td className="num">{formatMoney(l.requested)}</td>
                    <td className="num">{l.funded ? formatMoney(l.funded) : '—'}</td>
                    <td className="num">{l.total ? `${formatMoney(l.paid)} of ${formatMoney(l.total)}` : '—'}</td>
                    <td>{l.nextDue ? formatDate(l.nextDue) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dash-ok">No requests yet.</p>
        )}
      </section>

      <p className="dash-fine">
        The bank sees its customers’ names, amounts and payment history, but never what a request was for or the notes family members write to each
        other. In production this page sits behind the bank’s staff sign-in.
      </p>
    </main>
  );
}
