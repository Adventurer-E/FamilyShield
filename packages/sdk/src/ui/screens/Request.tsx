import { useState } from 'react';
import { CUSTOM_REASON_CHIP, CUSTOM_REASON_MAX, estimateMonthly, feeFor, feeLabel, formatMoney } from '@familyshield/core';
import type { Reason } from '@familyshield/core';
import { useFs } from '../context';
import { Button, NotEligible, Notice, Screen } from '../kit';

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
/** The amount box holds digits only (whole dollars); empty reads as 0. */
const dollarsFrom = (text: string) => Number(text.replace(/\D/g, '') || '0');

export function Request() {
  const { api, run, go, emit, data } = useFs();
  // Reasons, limits and starting values all come from the data API (reasons.csv, settings.csv).
  const { rules, reasons: REASONS } = data.config;
  const { amountMin: AMOUNT_MIN, amountMax: AMOUNT_MAX, amountStep: AMOUNT_STEP, termMin: TERM_MIN, termMax: TERM_MAX } = rules;
  const SUGGESTED_TERMS = rules.terms.filter((m) => m >= TERM_MIN && m <= TERM_MAX);

  const [reason, setReason] = useState<Reason>(() => REASONS[0]?.id ?? 'custom');
  const [ownReason, setOwnReason] = useState('');
  const [purpose, setPurpose] = useState(() => REASONS[0]?.template ?? '');
  const [edited, setEdited] = useState(false);

  // Any whole-dollar amount between the limits. The text box holds what the borrower is
  // typing; `amount` (cents) is what's sent and priced, kept inside the limits.
  const [amount, setAmount] = useState(() => clamp(Math.round(rules.defaultAmount / 100) * 100, AMOUNT_MIN, AMOUNT_MAX));
  const [amountText, setAmountText] = useState(() => String(amount / 100));
  const typedAmount = dollarsFrom(amountText) * 100;
  const amountOutOfRange = typedAmount < AMOUNT_MIN || typedAmount > AMOUNT_MAX;
  const setAmountTo = (cents: number) => {
    const next = clamp(cents, AMOUNT_MIN, AMOUNT_MAX);
    setAmount(next);
    setAmountText(String(next / 100));
  };

  // Any whole number of months between the limits: a suggested term, or one the borrower types.
  const [months, setMonths] = useState<number>(() => clamp(rules.defaultTerm, TERM_MIN, TERM_MAX));
  const [otherTerm, setOtherTerm] = useState(() => !SUGGESTED_TERMS.includes(months));
  const [termText, setTermText] = useState(() => String(months));
  const typedTerm = Number(termText);
  const termOutOfRange = otherTerm && !(Number.isInteger(typedTerm) && typedTerm >= TERM_MIN && typedTerm <= TERM_MAX);

  const pickReason = (id: Reason) => {
    setReason(id);
    // Swap in the new template unless the user has written their own words.
    if (!edited) setPurpose(id === 'custom' ? '' : REASONS.find((r) => r.id === id)?.template ?? '');
  };

  const send = async () => {
    const loan = await run(() =>
      api.createRequest({ reason, ...(reason === 'custom' ? { reasonLabel: ownReason } : {}), purpose, amount, months }),
    );
    if (loan) {
      emit({ type: 'request.sent', loanId: loan.id, amount: loan.amount });
      go({ name: 'offers' }, { replace: true });
    }
  };

  // Someone who can't ask right now sees why instead of the form (the backend refuses anyway).
  if (!data.eligibility.eligible) {
    return (
      <Screen title="Ask for support" step={1}>
        <NotEligible />
      </Screen>
    );
  }

  const monthlyLabel = (m: number) => `${formatMoney(estimateMonthly(amount, m, rules.feeRate))} / month`;

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
          <button type="button" className="fs-chip" aria-pressed={reason === 'custom'} onClick={() => pickReason('custom')}>
            {CUSTOM_REASON_CHIP}
          </button>
        </div>
        {reason === 'custom' && (
          <div className="fs-field">
            <label htmlFor="fs-own-reason">
              In a few words <span className="fs-small fs-muted" style={{ fontWeight: 600 }}>· shown as the tag your circle sees</span>
            </label>
            <input
              id="fs-own-reason"
              className="fs-input"
              maxLength={CUSTOM_REASON_MAX}
              placeholder="e.g. Broken water heater"
              value={ownReason}
              onChange={(e) => setOwnReason(e.target.value)}
              autoFocus
            />
            <span className="fs-tiny fs-muted">
              {ownReason.length}/{CUSTOM_REASON_MAX}
            </span>
          </div>
        )}
      </fieldset>

      <section className="fs-card" aria-labelledby="fs-amount">
        <h2 id="fs-amount" className="fs-h3">How much do you need?</h2>
        <div className="fs-stepper">
          <button type="button" className="fs-round" aria-label="Decrease amount" disabled={amount <= AMOUNT_MIN} onClick={() => setAmountTo(amount - AMOUNT_STEP)}>
            −
          </button>
          <label className="fs-amount" aria-label="Amount in dollars">
            <span aria-hidden="true">$</span>
            <input
              className="fs-amount-input"
              inputMode="numeric"
              value={amountText ? Number(amountText).toLocaleString('en-US') : ''}
              aria-invalid={amountOutOfRange}
              aria-describedby="fs-amount-help"
              onChange={(e) => {
                const text = e.target.value.replace(/[^\d]/g, '').slice(0, 7);
                setAmountText(text);
                const cents = dollarsFrom(text) * 100;
                if (cents >= AMOUNT_MIN && cents <= AMOUNT_MAX) setAmount(cents);
              }}
              onBlur={() => setAmountTo(typedAmount)}
            />
          </label>
          <button type="button" className="fs-round" aria-label="Increase amount" disabled={amount >= AMOUNT_MAX} onClick={() => setAmountTo(amount + AMOUNT_STEP)}>
            +
          </button>
        </div>
        <div id="fs-amount-help" className="fs-tiny fs-muted" style={{ textAlign: 'center', color: amountOutOfRange ? '#8A1C1C' : undefined }}>
          Any amount from {formatMoney(AMOUNT_MIN)} to {formatMoney(AMOUNT_MAX)}
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
          placeholder="Tell your circle what the money is for"
          onChange={(e) => {
            setPurpose(e.target.value);
            setEdited(true);
          }}
        />
      </div>

      <fieldset className="fs-stack" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend className="fs-h3" style={{ marginBottom: 10 }}>Preferred repayment</legend>
        <div role="radiogroup" aria-label="Preferred repayment" className="fs-stack" style={{ gap: 8 }}>
          {SUGGESTED_TERMS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={!otherTerm && months === m}
              className="fs-option"
              onClick={() => {
                setOtherTerm(false);
                setMonths(m);
                setTermText(String(m));
              }}
            >
              <span className="fs-radio" />
              <span className="fs-grow" style={{ fontWeight: 700 }}>{m} months</span>
              <span className="fs-small" style={{ fontWeight: 700, color: '#3B4659' }}>{monthlyLabel(m)}</span>
            </button>
          ))}
          <div role="radio" aria-checked={otherTerm} tabIndex={0} className="fs-option" onClick={() => setOtherTerm(true)} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setOtherTerm(true)}>
            <span className="fs-radio" />
            <span className="fs-grow" style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              {otherTerm ? (
                <>
                  <input
                    className="fs-input fs-term-input"
                    inputMode="numeric"
                    aria-label={`Months, from ${TERM_MIN} to ${TERM_MAX}`}
                    aria-invalid={termOutOfRange}
                    value={termText}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const text = e.target.value.replace(/\D/g, '').slice(0, 3);
                      setTermText(text);
                      const n = Number(text);
                      if (n >= TERM_MIN && n <= TERM_MAX) setMonths(n);
                    }}
                    onBlur={() => {
                      const n = clamp(Number(termText) || months, TERM_MIN, TERM_MAX);
                      setMonths(n);
                      setTermText(String(n));
                    }}
                  />
                  months
                </>
              ) : (
                'Another term'
              )}
            </span>
            <span className="fs-small" style={{ fontWeight: 700, color: termOutOfRange ? '#8A1C1C' : '#3B4659' }}>
              {otherTerm ? (termOutOfRange ? `${TERM_MIN}–${TERM_MAX} months` : monthlyLabel(months)) : `${TERM_MIN}–${TERM_MAX} months`}
            </span>
          </div>
        </div>
      </fieldset>

      <Notice>
        Only your trusted circle ({data.profile.circle.map((p) => p.nickname ?? p.firstName).join(', ')}) sees this. Each person answers
        privately; nobody sees anyone else’s answer. A one-time {feeLabel(rules)} service fee (
        {formatMoney(feeFor(amount, rules))} if fully funded) is added to what you repay and spread across your monthly payments.
      </Notice>

      <Button onClick={send}>Send to my trusted circle</Button>
    </Screen>
  );
}
