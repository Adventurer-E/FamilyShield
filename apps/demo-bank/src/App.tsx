import { useEffect, useState } from 'react';
import { formatMoney } from '@familyshield/core';
import type { HostEvent } from '@familyshield/sdk';
import { BankHome } from './BankHome';
import { FamilyShieldSheet } from './FamilyShieldSheet';
import type { EmbedMode } from './FamilyShieldSheet';
import { DEMO_USERS, backend } from './backend';
import type { DemoUserId } from './backend';

function remembered<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
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

/** Re-render whenever the mock backend changes (including from the WebView iframe). */
function useBackend() {
  const [, setTick] = useState(0);
  useEffect(() => backend.subscribe(() => setTick((t) => t + 1)), []);
  return backend;
}

function toastFor(event: HostEvent): string | null {
  switch (event.type) {
    case 'request.sent':
      return `Request for ${formatMoney(event.amount)} sent to your trusted circle`;
    case 'loan.funded':
      return `${formatMoney(event.amount)} from your family arrived in Everyday Checking`;
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
  const be = useBackend();
  const [userId, setUserId] = useState<DemoUserId>(() => remembered<DemoUserId>('demo-user', 'alex', DEMO_USERS.map((u) => u.id)));
  const [mode, setMode] = useState<EmbedMode>(() => remembered<EmbedMode>('demo-mode', 'inline', ['inline', 'webview']));
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; via: EmbedMode } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3_500);
    return () => clearTimeout(t);
  }, [toast]);

  const state = be.getState();
  const me = state.people.find((p) => p.id === userId)!;
  const account = be.getAccount(userId);

  const switchUser = (id: DemoUserId) => {
    setUserId(id);
    remember('demo-user', id);
    setOpen(false);
  };
  const switchMode = (m: EmbedMode) => {
    setMode(m);
    remember('demo-mode', m);
  };

  return (
    <div className="demo">
      <header className="demo-bar">
        <div className="demo-brand">
          FamilyShield <span>demo</span>
        </div>
        <div className="seg" role="group" aria-label="Viewing as">
          <span className="seg-label">Viewing as</span>
          {DEMO_USERS.map((u) => (
            <button key={u.id} type="button" aria-pressed={userId === u.id} onClick={() => switchUser(u.id)}>
              {u.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Integration">
          <span className="seg-label">Embed as</span>
          <button type="button" aria-pressed={mode === 'inline'} onClick={() => switchMode('inline')}>Inline SDK</button>
          <button type="button" aria-pressed={mode === 'webview'} onClick={() => switchMode('webview')}>WebView</button>
        </div>
        <button
          type="button"
          className="reset"
          onClick={() => {
            be.reset();
            setOpen(false);
          }}
        >
          Reset demo
        </button>
      </header>

      <div className="stage">
        <div className="phone">
          <BankHome
            firstName={me.firstName}
            balance={account.balance}
            ledger={account.ledger}
            state={state}
            userId={userId}
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
            <li>Switch to <strong>Mom</strong> above. Her bank app shows Alex’s request; offer privately.</li>
            <li>Back as Alex, accept both offers and sign. Maya signs automatically; switch to Mom to sign hers.</li>
            <li>Watch both balances move. Make payments (or skip to the last one), then claim a partner reward.</li>
          </ol>
          <p>
            <strong>Inline SDK</strong> mounts the module straight into the bank’s page. <strong>WebView</strong> loads the standalone embed page
            in a frame and talks over postMessage, exactly like a native iOS/Android app would.
          </p>
          <p className="fine">All people, partners and money here are fictional. State is saved in this browser; “Reset demo” starts over.</p>
        </aside>
      </div>
    </div>
  );
}
