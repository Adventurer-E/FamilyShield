import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@familyshield/core';
import type { AccountSummary, LoanCase, MockupPerson } from '@familyshield/core';
import type { HostEvent } from '@familyshield/sdk';
import { BankHome, entrySubtitle } from './BankHome';
import { CsvPanel } from './CsvPanel';
import { FamilyShieldSheet } from './FamilyShieldSheet';
import type { EmbedMode } from './FamilyShieldSheet';
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

interface BankData {
  people: MockupPerson[];
  account: AccountSummary | null;
  myLoan: LoanCase | null;
  incoming: LoanCase[];
  error: string | null;
}

/** Everything the bank screen shows, re-fetched whenever the data changes. */
function useBankData(userId: string): BankData & { refresh: () => void } {
  const [data, setData] = useState<BankData>({ people: [], account: null, myLoan: null, incoming: [], error: null });

  const refresh = useCallback(() => {
    const api = host.apiFor(userId);
    Promise.all([host.people(), host.account(userId), api.getMyLoan(), api.getIncoming()])
      .then(([people, account, myLoan, incoming]) => setData({ people, account, myLoan, incoming, error: null }))
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
  const [open, setOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
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

  return (
    <div className="demo">
      <header className="demo-bar">
        <div className="demo-brand">
          FamilyShield <span>functional mockup</span>
        </div>
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
          Reset functional mockup
        </button>
      </header>

      {bank.error ? (
        <div className="data-error" role="alert">
          <strong>Can’t load the data.</strong> {bank.error}
          {host.mode === 'server' ? ' Is the backend server running? Start everything with npm run dev.' : ''}
        </div>
      ) : null}

      <div className="stage">
        <div className="phone">
          <BankHome
            firstName={me?.firstName ?? ''}
            accountLabel={me?.accountLabel ?? 'Checking'}
            account={bank.account}
            entry={entrySubtitle(userId, bank.myLoan, bank.incoming)}
            onOpenFamilyShield={() => setOpen(true)}
          />
          {open ? (
            <FamilyShieldSheet
              userId={userId}
              mode={mode}
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
            <li>Cousin Maya and Aunt Lisa answer on their own within a few seconds.</li>
            <li>Switch to <strong>Grace (Mom)</strong> above. Her bank app shows Alex’s request; offer privately.</li>
            <li>Back as Alex, accept both offers and sign. Maya signs automatically; switch to Mom to sign hers.</li>
            <li>Watch both balances move. Make payments (or skip to the last one), then claim a partner reward.</li>
          </ol>
          <p>
            Every number comes from the <strong>CSV files</strong> in <code>data/</code>: people, balances, the fee, limits, points and
            rewards. Change them and the app follows. {host.mode === 'server' ? 'The backend server writes new activity back to those files.' : 'Here, new activity is saved in this browser; use the Data button to download it.'}
          </p>
          <p>
            <strong>Inline SDK</strong> mounts the module straight into the bank’s page. <strong>WebView</strong> loads the standalone embed page
            in a frame and talks over postMessage, exactly like a native iOS/Android app would.
          </p>
          <p className="fine">All people, partners and money here are fictional. “Reset functional mockup” clears all activity.</p>
        </aside>
      </div>

      {csvOpen ? <CsvPanel onClose={() => setCsvOpen(false)} /> : null}
    </div>
  );
}
