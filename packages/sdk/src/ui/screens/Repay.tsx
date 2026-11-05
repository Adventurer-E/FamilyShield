import { MAX_PAUSES, POINTS, REWARDS, formatDate, formatMoney, nextInstallment, pointsToGo, repaymentSummary, rewardStatus } from '@familyshield/core';
import type { LoanCase } from '@familyshield/core';
import { useFs } from '../context';
import { Button, DemoHint, Progress, Screen } from '../kit';
import { CheckIcon, PauseIcon, StarIcon } from '../icons';

export function Repay({ loan }: { loan: LoanCase }) {
  const { api, run, go, emit, nameOf, demo } = useFs();
  const s = repaymentSummary(loan);
  const next = nextInstallment(loan);
  const repaid = loan.status === 'repaid';
  const unlocked = REWARDS.filter((r) => ['available', 'claimed'].includes(rewardStatus(loan, r)));
  const pause = loan.pause;

  const pay = async () => {
    const after = await run(() => api.makePayment(loan.id));
    if (after && next) emit({ type: 'payment.made', loanId: loan.id, amount: next.amount, remaining: repaymentSummary(after).remaining });
  };

  // Demo only: run the remaining payments back to back.
  const payAll = async () => {
    let current: LoanCase | undefined = loan;
    while (current && current.status === 'active') {
      current = await run(() => api.makePayment(loan.id));
    }
  };

  return (
    <Screen title="Repay & earn" step={4}>
      {repaid ? (
        <section className="fs-card night">
          <div className="fs-row">
            <span className="fs-avatar" style={{ background: 'var(--fs-accent)', color: 'var(--fs-night)', border: 'none', width: 36, height: 36 }}>
              <StarIcon />
            </span>
            <span className="fs-tiny" style={{ fontWeight: 800, letterSpacing: '.06em', color: 'var(--fs-accent)' }}>REWARDS UNLOCKED</span>
          </div>
          <h2 className="fs-h2" style={{ fontSize: 20 }}>
            Your family unlocked {unlocked.length} partner offer{unlocked.length === 1 ? '' : 's'}
          </h2>
          <p className="fs-small" style={{ margin: 0, color: '#C9D6EC' }}>
            Fully repaid with every payment made. Partner offers are open to you and everyone who helped. Pick one below.
          </p>
        </section>
      ) : null}

      <section className="fs-card">
        <div className="fs-row">
          <span className="fs-avatar" style={{ background: 'var(--fs-brand)', color: '#fff', border: 'none', width: 32, height: 32 }}>
            <CheckIcon size={18} />
          </span>
          <div className="fs-grow">
            <div style={{ fontWeight: 800 }}>{repaid ? 'Fully repaid' : pause?.status === 'pending' ? 'Pause requested' : 'On track'}</div>
            <div className="fs-small fs-muted">
              {repaid ? `Finished ${loan.repaidAt ? formatDate(loan.repaidAt.slice(0, 10)) : ''}` : s.paymentsMade ? `${s.paymentsMade} payment${s.paymentsMade === 1 ? '' : 's'} made` : `Autopay starts ${next ? formatDate(next.dueDate) : ''}`}
            </div>
          </div>
        </div>
        <div className="fs-between">
          <span className="fs-small" style={{ fontWeight: 600 }}>Repaid</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>
            {formatMoney(s.paid)} <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>/ {formatMoney(s.total)}</span>
          </span>
        </div>
        <Progress value={s.progress} label="Repaid so far" />
        <div className="fs-tiny fs-muted">
          {formatMoney(s.principal)} borrowed + {formatMoney(s.fee)} service fee (5%) · {s.paymentsMade} of {s.paymentsTotal} payments
        </div>
      </section>

      {!repaid && next ? (
        <section className="fs-card">
          <div className="fs-between">
            <div>
              <div className="fs-tiny fs-muted" style={{ fontWeight: 700 }}>NEXT PAYMENT</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{formatMoney(next.amount)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="fs-tiny fs-muted" style={{ fontWeight: 700 }}>AUTOPAY ON</div>
              <div style={{ fontWeight: 700 }}>{formatDate(next.dueDate)}</div>
            </div>
          </div>
          <div className="fs-quote fs-small">
            Split automatically:{' '}
            {next.parts.map((p) => `${p.to === 'fee' ? 'service fee' : nameOf(p.to)} ${formatMoney(p.amount)}`).join(' · ')}
          </div>
          <Button onClick={pay}>Pay {formatMoney(next.amount)} now</Button>
          {demo ? (
            <Button variant="ghost" onClick={payAll}>
              Functional mockup: make all remaining payments
            </Button>
          ) : null}

          {pause?.status === 'pending' ? (
            <div className="fs-small" style={{ border: '1px dashed #B6BFCD', borderRadius: 12, padding: 12, color: '#3B4659' }}>
              <div className="fs-row" style={{ gap: 8, fontWeight: 800, color: 'var(--fs-ink)', marginBottom: 6 }}>
                <PauseIcon size={16} /> Pause request sent privately
              </div>
              {Object.entries(pause.approvals)
                .map(([id, answer]) => `${nameOf(id)}: ${answer === null ? 'waiting' : answer ? 'approved' : 'declined'}`)
                .join(' · ')}
              <div>If everyone approves, your remaining payments shift one month. No awkward conversation needed.</div>
              <button type="button" className="fs-btn ghost small" style={{ padding: 0, marginTop: 4 }} onClick={() => run(() => api.cancelPause(loan.id))}>
                Cancel request
              </button>
            </div>
          ) : loan.pausesUsed < MAX_PAUSES ? (
            <Button variant="secondary" onClick={() => run(() => api.requestPause(loan.id))}>
              Need flexibility? Ask to pause a month
            </Button>
          ) : (
            <div className="fs-tiny fs-muted">
              {pause?.status === 'approved' ? 'Your pause was approved. Payments moved back one month.' : 'You’ve used the pause on this loan.'}
            </div>
          )}
          {pause?.status === 'declined' ? (
            <div className="fs-tiny fs-muted">Your last pause request wasn’t approved. Your schedule is unchanged.</div>
          ) : null}
          {pause?.status === 'pending' ? <DemoHint>Switch users in the functional mockup bar to answer the pause as a lender.</DemoHint> : null}
        </section>
      ) : null}

      <section className="fs-card" aria-labelledby="fs-points">
        <div className="fs-row">
          <StarIcon stroke="var(--fs-brand)" />
          <h2 id="fs-points" className="fs-grow fs-h3">Family points</h2>
          <div style={{ fontWeight: 800 }}>{loan.points.toLocaleString('en-US')} pts</div>
        </div>
        <Progress value={loan.points / (REWARDS[REWARDS.length - 1]?.threshold ?? 1)} label="Family points" />
        <div className="fs-tiny fs-muted">
          +{POINTS.HELP} per family member who helps · +{POINTS.ON_TIME} per on-time payment · +{POINTS.COMPLETE} when fully repaid. Offers
          open at full repayment.
        </div>
        {REWARDS.map((r) => {
          const status = rewardStatus(loan, r);
          return (
            <div key={r.id} className="fs-row" style={{ paddingTop: 10, borderTop: '1px solid #EEF1F6' }}>
              <span className="fs-tile">{r.shortLabel}</span>
              <div className="fs-grow">
                <div className="fs-small" style={{ fontWeight: 800 }}>{r.name}</div>
                <div className="fs-tiny fs-muted">
                  {r.category} · {r.threshold.toLocaleString('en-US')} pts
                </div>
              </div>
              {status === 'available' || status === 'claimed' ? (
                <Button small onClick={() => go({ name: 'reward', rewardId: r.id })}>
                  {status === 'claimed' ? 'View code' : 'View offer'}
                </Button>
              ) : (
                <span className={`fs-pill${status === 'awaiting-repayment' ? ' brand' : ''}`}>
                  {status === 'locked' ? `${pointsToGo(loan, r).toLocaleString('en-US')} to go` : 'At full repayment'}
                </span>
              )}
            </div>
          );
        })}
      </section>
    </Screen>
  );
}
