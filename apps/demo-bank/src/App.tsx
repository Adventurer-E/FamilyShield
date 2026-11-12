import { useCallback, useEffect, useState } from 'react';
import { addMonths, daysBetween, formatDate, formatMoney } from '@familyshield/core';
import type { AccountSummary, Eligibility, LoanCase, MockupClock, MockupPerson } from '@familyshield/core';
import type { HostEvent } from '@familyshield/sdk';
import { BankDashboard } from './BankDashboard';
import { BankHome, entrySubtitle } from './BankHome';
import { CsvPanel } from './CsvPanel';
import { FamilyShieldSheet } from './FamilyShieldSheet';
import type { EmbedMode } from './FamilyShieldSheet';
import { readFreeOption, saveFreeOption } from './freeOption';
import { host } from './host';

function remembered<T extends string>(key: string, fallback: T, allowed?: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && (!allowed || allowed.includes(v)) ? v : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: fine */
  }
}

/** What the stage shows: the customer's phone or the bank's staff dashboard. */
type View = 'customer' | 'bank';

interface BankData {
  people: MockupPerson[];
  account: AccountSummary | null;
  myLoan: LoanCase | null;
  incoming: LoanCase[];
  eligibility: Eligibility | null;
  /** The mockup's calendar ("Skip ahead"). */
  clock: MockupClock | null;
  error: string | null;
}

/** Everything the bank screen shows, re-fetched whenever the data changes. */
function useBankData(userId: string): BankData & { refresh: () => void } {
  const [data, setData] = useState<BankData>({ people: [], account: null, myLoan: null, incoming: [], eligibility: null, clock: null, error: null });

  const refresh = useCallback(() => {
    const api = host.apiFor(userId);
    Promise.all([host.people(), host.account(userId), api.getMyLoan(), api.getIncoming(), api.getEligibility(), host.clock()])
      .then(([people, account, myLoan, incoming, eligibility, clock]) => setData({ people, account, myLoan, incoming, eligibility, clock, error: null }))
      .catch((e: unknown) => setData((d) => ({ ...d, error: e instanceof Error ? e.message : String(e) })));
  }, [userId]);

  useEffect(() => {
    refresh();
    return host.subscribe(refresh);
  }, [refresh]);

  return { ...data, refresh };
}

function toastFor(event: HostEvent): string | null {
  switch (event.type) {
    case 'request.sent':
      return `Request for ${formatMoney(event.amount)} sent to your trusted circle`;
    case 'loan.funded':
      return `${formatMoney(event.amount)} from your family arrived in your account`;
    case 'payment.made':
      return `Family payment of ${formatMoney(event.amount)} sent`;
    case 'loan.repaid':
      return 'Fully repaid. Nice work!';
    case 'reward.claimed':
      return `Offer claimed with ${event.partner}`;
    case 'error':
      return 'FamilyShield hit a problem. Please try again.';
    default:
      return null;
  }
}

export function App() {
  const [userId, setUserId] = useState<string>(() => remembered<string>('mockup-user', 'alex'));
  const [mode, setMode] = useState<EmbedMode>(() => remembered<EmbedMode>('mockup-embed', 'inline', ['inline', 'webview']));
  // Customer app (the phone) or the bank's staff dashboard (C4).
  const [view, setView] = useState<View>(() => remembered<View>('mockup-view', 'customer', ['customer', 'bank']));
  const [open, setOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  // Free option (fee experiment arm B): the toolbar switch, or null to follow settings.csv.
  const [freeOption, setFreeOption] = useState<boolean | null>(() => readFreeOption());
  const [freeOptionInData, setFreeOptionInData] = useState(false);
  const [toast, setToast] = useState<{ text: string; via: EmbedMode } | null>(null);
  const bank = useBankData(userId);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3_500);
    return () => clearTimeout(t);
  }, [toast]);

  // If the remembered person was removed from people.csv, fall back to the first one.
  useEffect(() => {
    if (bank.people.length && !bank.people.some((p) => p.id === userId)) setUserId(bank.people[0]!.id);
  }, [bank.people, userId]);

  useEffect(() => {
    host
      .apiFor(userId)
      .getConfig()
      .then((c) => setFreeOptionInData(c.rules.showFreeOption))
      .catch(() => {});
  }, [userId]);
  const freeOptionShown = freeOption ?? freeOptionInData;

  const me = bank.people.find((p) => p.id === userId);

  const switchUser = (id: string) => {
    setUserId(id);
    remember('mockup-user', id);
    setOpen(false);
  };
  const switchMode = (m: EmbedMode) => {
    setMode(m);
    remember('mockup-embed', m);
  };
  const switchFreeOption = (on: boolean) => {
    setFreeOption(on);
    saveFreeOption(on);
  };
  const switchView = (v: View) => {
    setView(v);
    remember('mockup-view', v);
    setOpen(false);
  };
  const today = bank.clock?.today;
  const skip = (days: number) => void host.skipAhead(days).then(bank.refresh);

  return (
    <div className="demo">
      <header className="demo-bar">
        <div className="demo-brand">
          FamilyShield
        </div>
        <div className="seg" role="group" aria-label="View">
          <span className="seg-label">View</span>
          <button type="button" aria-pressed={view === 'customer'} onClick={() => switchView('customer')}>Customer app</button>
          <button type="button" aria-pressed={view === 'bank'} onClick={() => switchView('bank')}>Bank dashboard</button>
        </div>
        {view === 'customer' ? (
          <>
            <label className="seg">
              <span className="seg-label">Viewing as</span>
              <select value={userId} onChange={(e) => switchUser(e.target.value)}>
                {bank.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </label>
            <div className="seg" role="group" aria-label="Embed as">
              <span className="seg-label">Embed as</span>
              <button type="button" aria-pressed={mode === 'inline'} onClick={() => switchMode('inline')}>Inline SDK</button>
              <button type="button" aria-pressed={mode === 'webview'} onClick={() => switchMode('webview')}>WebView</button>
            </div>
          </>
        ) : null}
        <div className="seg" role="group" aria-label="Mockup date">
          <span className="seg-label seg-date" title="The date the mockup is on. Skip ahead so payments come due; Reset goes back to today.">
            {today ? formatDate(today) : 'Today'}
            {bank.clock?.daysAhead ? <span className="ahead"> · +{bank.clock.daysAhead} days</span> : null}
          </span>
          <button type="button" onClick={() => skip(7)} disabled={!today} title="Skip ahead one week">+1 week</button>
          <button type="button" onClick={() => today && skip(daysBetween(today, addMonths(today, 1)))} disabled={!today} title="Skip ahead one month">
            +1 month
          </button>
        </div>
        <div className="seg" role="group" aria-label="Free option (fee experiment)">
          <span className="seg-label" title="Fee experiment: before a request, offer a choice between FamilyShield and arranging the loan for free">
            Free option
          </span>
          <button type="button" aria-pressed={!freeOptionShown} onClick={() => switchFreeOption(false)}>Off</button>
          <button type="button" aria-pressed={freeOptionShown} onClick={() => switchFreeOption(true)}>On</button>
        </div>
        <button type="button" className="data-chip" onClick={() => setCsvOpen(true)} title="Where the data lives">
          <span className={`dot ${host.mode}`} aria-hidden="true" />
          {host.mode === 'server' ? 'Data: CSV files via server' : 'Data: CSV files in this browser'}
        </button>
        <button
          type="button"
          className="reset"
          onClick={() => {
            setOpen(false);
            void host.reset().then(bank.refresh);
          }}
        >
          Reset
        </button>
      </header>

      {bank.error ? (
        <div className="data-error" role="alert">
          <strong>Can’t load the data.</strong> {bank.error}
          {host.mode === 'server' ? ' Is the backend server running? Start everything with npm run dev.' : ''}
        </div>
      ) : null}

      {view === 'bank' ? (
        <div className="stage">
          <BankDashboard />
        </div>
      ) : (
        <div className="stage">
          <div className="phone">
            <BankHome
              firstName={me?.firstName ?? ''}
              accountLabel={me?.accountLabel ?? 'Checking'}
              account={bank.account}
              entry={entrySubtitle(userId, bank.myLoan, bank.incoming, bank.eligibility)}
              onOpenFamilyShield={() => setOpen(true)}
            />
            {open ? (
              <FamilyShieldSheet
                userId={userId}
                mode={mode}
                freeOption={freeOption}
                onClose={() => setOpen(false)}
                onEvent={(e) => {
                  const text = toastFor(e);
                  if (text) setToast({ text, via: mode });
                  bank.refresh();
                }}
              />
            ) : null}
            {toast ? (
              <div className="toast" role="status">
                {toast.text}
                <span>BlueRiver received this via the {toast.via === 'inline' ? 'SDK callback' : 'WebView bridge'}</span>
              </div>
            ) : null}
          </div>

          <aside className="notes">
            <h2>Try the whole story</h2>
            <ol>
              <li>As <strong>Alex</strong>, tap the FamilyShield card and send a request.</li>
              <li>
                Switch to <strong>Grace (Mom)</strong>, <strong>Maya</strong> or <strong>Lisa</strong> above. Each one’s bank app shows Alex’s
                request; offer or decline privately.
              </li>
              <li>Back as Alex, accept the offers and sign. Then switch to each lender, and they sign their own agreement.</li>
              <li>Watch the balances move. Make the payments, then claim a partner reward.</li>
              <li>
                Or don’t pay: use <strong>+1 month</strong> above. A payment more than a few days late is overdue, and the borrower can’t offer to
                lend to family until they catch up.
              </li>
            </ol>
            <p>
              Every number comes from the <strong>CSV files</strong> in <code>data/</code>: people, balances, the fee, limits, points and
              rewards. Change them and the app follows. {host.mode === 'server' ? 'The backend server writes your activity to a git-ignored working copy in data/local/.' : 'Here, new activity is saved in this browser; use the Data button to download it.'}
            </p>
            <p>
              <strong>Inline SDK</strong> mounts the module straight into the bank’s page. <strong>WebView</strong> loads the standalone embed page
              in a frame and talks over postMessage, exactly like a native iOS/Android app would.
            </p>
            <p>
              <strong>Bank dashboard</strong> (top bar) is what BlueRiver’s staff see: money lent and repaid, fees, on-time payments and overdue
              loans across every customer.
            </p>
            <p>
              <strong>Free option</strong> is the fee experiment (hypothesis #8): when it’s on, starting a request first asks whether to use
              FamilyShield or arrange the loan with family for free. Send participants a link ending in <code>?free_option=yes</code> or{' '}
              <code>?free_option=no</code> to put them in one group.
            </p>
          <p className="fine">All people, partners and money here are fictional. “Reset” goes back to the shared starting state in data/.</p>
          </aside>
        </div>
      )}

      {csvOpen ? <CsvPanel onClose={() => setCsvOpen(false)} /> : null}
    </div>
  );
}
