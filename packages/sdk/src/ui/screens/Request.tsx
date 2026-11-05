import { useState } from 'react';
import { AMOUNT_MAX, AMOUNT_MIN, AMOUNT_STEP, FEE_RATE, TERM_OPTIONS, estimateMonthly, feeFor, formatMoney } from '@familyshield/core';
import type { Reason } from '@familyshield/core';
import { useFs } from '../context';
import { Button, Notice, Screen } from '../kit';

const REASONS: Array<{ id: Reason; label: string; template: string }> = [
  { id: 'car', label: 'Car repair', template: 'My car broke down and I need it to get to work. The shop can fix it this week if I pay upfront.' },
  { id: 'medical', label: 'Medical bill', template: 'An urgent-care visit left a bill my insurance didn’t fully cover, and it’s due this month.' },
  { id: 'job', label: 'Job loss', template: 'I was laid off and need help covering rent and essentials while I look for a new job.' },
  { id: 'other', label: 'Something else', template: 'An unexpected expense came up and I need a short bridge until my next paychecks.' },
];

export function Request() {
  const { api, run, go, emit, data } = useFs();
  const [reason, setReason] = useState<Reason>('car');
  const [purpose, setPurpose] = useState(REASONS[0]!.template);
  const [edited, setEdited] = useState(false);
  const [amount, setAmount] = useState(150_000);
  const [months, setMonths] = useState<number>(10);

  const pickReason = (id: Reason) => {
    setReason(id);
    // Swap in the new template unless the user has written their own words.
    if (!edited) setPurpose(REASONS.find((r) => r.id === id)!.template);
  };

  const send = async () => {
    const loan = await run(() => api.createRequest({ reason, purpose, amount, months }));
    if (loan) {
      emit({ type: 'request.sent', loanId: loan.id, amount: loan.amount });
      go({ name: 'offers' }, { replace: true });
    }
  };

  return (
    <Screen title="Ask for support" step={1}>
      <fieldset className="fs-stack" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="fs-h3" style={{ marginBottom: 10 }}>What happened?</legend>
        <div className="fs-grid-2">
          {REASONS.map((r) => (
            <button key={r.id} type="button" className="fs-chip" aria-pressed={reason === r.id} onClick={() => pickReason(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>

      <section className="fs-card" aria-labelledby="fs-amount">
        <h2 id="fs-amount" className="fs-h3">How much do you need?</h2>
        <div className="fs-stepper">
          <button type="button" className="fs-round" aria-label="Decrease amount" disabled={amount <= AMOUNT_MIN} onClick={() => setAmount((a) => Math.max(AMOUNT_MIN, a - AMOUNT_STEP))}>
            −
          </button>
          <output className="fs-big" aria-live="polite">{formatMoney(amount)}</output>
          <button type="button" className="fs-round" aria-label="Increase amount" disabled={amount >= AMOUNT_MAX} onClick={() => setAmount((a) => Math.min(AMOUNT_MAX, a + AMOUNT_STEP))}>
            +
          </button>
        </div>
        <div className="fs-tiny fs-muted" style={{ textAlign: 'center' }}>
          In steps of {formatMoney(AMOUNT_STEP)}, from {formatMoney(AMOUNT_MIN)} to {formatMoney(AMOUNT_MAX)}
        </div>
      </section>

      <div className="fs-field">
        <label htmlFor="fs-purpose">
          What it’s for <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>· your circle sees this</span>
        </label>
        <textarea
          id="fs-purpose"
          className="fs-input"
          rows={3}
          maxLength={500}
          value={purpose}
          onChange={(e) => {
            setPurpose(e.target.value);
            setEdited(true);
          }}
        />
      </div>

      <fieldset className="fs-stack" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="fs-h3" style={{ marginBottom: 10 }}>Preferred repayment</legend>
        <div role="radiogroup" aria-label="Preferred repayment" className="fs-stack" style={{ gap: 8 }}>
          {TERM_OPTIONS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={months === m} className="fs-option" onClick={() => setMonths(m)}>
              <span className="fs-radio" />
              <span className="fs-grow" style={{ fontWeight: 700 }}>{m} months</span>
              <span className="fs-small" style={{ fontWeight: 700, color: '#3B4659' }}>
                {formatMoney(estimateMonthly(amount, m, FEE_RATE))} / month
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <Notice>
        Only your trusted circle ({data.profile.circle.map((p) => p.nickname ?? p.firstName).join(', ')}) sees this. Each person answers
        privately; nobody sees anyone else’s answer. A one-time {Math.round(FEE_RATE * 100)}% service fee (
        {formatMoney(feeFor(amount))} if fully funded) is added to what you repay and spread across your monthly payments.
      </Notice>

      <Button onClick={send}>Send to my trusted circle</Button>
    </Screen>
  );
}
