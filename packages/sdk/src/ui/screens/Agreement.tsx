import { addMonths, draftAgreements, formatDate, formatMoney, sum, toIsoDate } from '@familyshield/core';
import type { Agreement as AgreementT, LoanCase } from '@familyshield/core';
import { useFs } from '../context';
import { Button, DemoHint, Notice, Screen, Terms } from '../kit';
import { DocIcon } from '../icons';

export function AgreementDoc(props: { agreement: AgreementT; months: number; borrowerId: string; firstDue?: string }) {
  const { fullNameOf, nameOf } = useFs();
  const { agreement: a, months } = props;
  const monthly = Math.ceil(a.total / months);
  const start = props.firstDue ?? addMonths(toIsoDate(new Date()), 1);
  return (
    <article className="fs-card outline flush">
      <div className="fs-doc-head">
        <DocIcon stroke="#163A70" />
        Family loan · {nameOf(a.lenderId)}
      </div>
      <Terms
        rows={[
          ['Loan amount', formatMoney(a.principal)],
          ['Interest', `${a.interestRate}%`],
          [`Service fee (${a.principal ? +((a.fee / a.principal) * 100).toFixed(2) : 0}%)`, formatMoney(a.fee)],
          ['Total to repay', <strong key="t">{formatMoney(a.total)}</strong>],
          ['Monthly payment', `about ${formatMoney(monthly)} × ${months}`],
          ['Schedule', `${formatDate(start, false)} – ${formatDate(addMonths(start, months - 1))}`],
          ['Reminders', 'Automatic, both sides'],
        ]}
      />
      <div className="fs-sigs">
        <div className="fs-sig">
          <div className="who">BORROWER</div>
          {a.borrowerSignedAt ? <div className="ink">{fullNameOf(props.borrowerId)}</div> : <div className="fs-small fs-muted" style={{ paddingTop: 10 }}>Not signed yet</div>}
        </div>
        <div className="fs-sig">
          <div className="who">LENDER</div>
          {a.lenderSignedAt ? <div className="ink">{fullNameOf(a.lenderId)}</div> : <div className="fs-small fs-muted" style={{ paddingTop: 10 }}>{a.borrowerSignedAt ? 'Waiting to sign…' : 'Signs after you'}</div>}
        </div>
      </div>
    </article>
  );
}

/** Borrower's view: preview and sign (collecting), then wait for lenders (signing). */
export function Agreement({ loan }: { loan: LoanCase }) {
  const { api, run, go, nameOf, data } = useFs();
  const signed = loan.status !== 'collecting';
  const agreements = signed ? loan.agreements : draftAgreements(loan, data.config.rules);
  const fee = sum(agreements.map((a) => a.fee));
  const total = sum(agreements.map((a) => a.total));
  const waitingOn = loan.agreements.filter((a) => !a.lenderSignedAt).map((a) => nameOf(a.lenderId));

  return (
    <Screen title={signed ? 'Waiting for signatures' : 'Sign the agreement'} step={3}>
      <p className="fs-small" style={{ margin: 0, color: '#3B4659' }}>
        One plain-language agreement per lender. Only you and that lender see its terms, and a signed copy is saved for both of you.
      </p>
      {agreements.map((a) => (
        <AgreementDoc key={a.lenderId} agreement={a} months={loan.months} borrowerId={loan.borrowerId} firstDue={loan.schedule[0]?.dueDate} />
      ))}
      <div className="fs-between" style={{ padding: '0 2px' }}>
        <span className="fs-small">Total to repay (incl. {formatMoney(fee)} fee)</span>
        <strong>{formatMoney(total)}</strong>
      </div>

      {signed ? (
        <>
          <Notice kind="info">
            You’ve signed. The money moves to your account as soon as {waitingOn.join(' and ') || 'everyone'} sign{waitingOn.length === 1 ? 's' : ''}.
          </Notice>
          {waitingOn.length > 0 ? <DemoHint>To sign as a lender, switch users in the functional mockup bar.</DemoHint> : null}
          {loan.status === 'active' ? <Button onClick={() => go({ name: 'repay' }, { replace: true })}>See my repayment plan</Button> : null}
        </>
      ) : (
        <>
          <Notice kind="info">By signing you agree to repay each lender on the schedule above. You can ask for a one-month pause once.</Notice>
          <Button onClick={() => run(() => api.signAsBorrower(loan.id))}>
            {agreements.length > 1 ? `Sign ${agreements.length} agreements` : 'Sign agreement'}
          </Button>
        </>
      )}
    </Screen>
  );
}
