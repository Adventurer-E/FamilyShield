import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { PersonId } from '@familyshield/core';
import { useFs } from './context';
import { AlertIcon, BackIcon, CloseIcon, InfoIcon, LockIcon } from './icons';

/** Small building blocks shared by every screen. */

export function Screen(props: { eyebrow?: string; title: string; step?: number; root?: boolean; children: ReactNode }) {
  const { back, error, clearError } = useFs();
  // Errors show at the top of the screen; bring them into view when one appears
  // (the action may have been far down, e.g. the add form on the circle screen).
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [error]);
  return (
    <main className="fs-screen">
      <header className="fs-header">
        <button type="button" className="fs-icon-btn" onClick={back} aria-label={props.root ? 'Close FamilyShield' : 'Back'}>
          {props.root ? <CloseIcon /> : <BackIcon />}
        </button>
        <div className="fs-header-text">
          <div className="fs-eyebrow">{props.eyebrow ?? 'FamilyShield'}</div>
          <h1 className="fs-title">{props.title}</h1>
        </div>
      </header>
      {props.step ? <Steps step={props.step} /> : null}
      {error ? (
        <div className="fs-error" role="alert" ref={errorRef}>
          <AlertIcon />
          <span>{error}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss">✕</button>
        </div>
      ) : null}
      {props.children}
    </main>
  );
}

const STEP_LABELS = ['Request', 'Offers', 'Agreement', 'Repay'];

export function Steps({ step }: { step: number }) {
  return (
    <>
      <div className="fs-steps" aria-hidden="true">
        {STEP_LABELS.map((label, i) => (
          <span key={label} className={i < step ? 'on' : ''} />
        ))}
      </div>
      <div className="fs-steps-label">
        Step {step} of {STEP_LABELS.length} · {STEP_LABELS[step - 1]}
      </div>
    </>
  );
}

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'dark' | 'ghost';
  small?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}) {
  const { busy } = useFs();
  const variant = props.variant ?? 'primary';
  return (
    <button
      type="button"
      className={`fs-btn ${variant}${props.small ? ' small' : ''}${busy && variant !== 'ghost' ? ' busy' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-busy={busy || undefined}
      aria-pressed={props.pressed}
    >
      {props.children}
    </button>
  );
}

export function Notice({ children, kind = 'privacy' }: { children: ReactNode; kind?: 'privacy' | 'info' | 'demo' }) {
  return (
    <div className={`fs-notice${kind === 'demo' ? ' demo' : ''}`}>
      {kind === 'privacy' ? <LockIcon size={18} stroke="#163A70" /> : <InfoIcon size={18} stroke={kind === 'demo' ? '#7A4B00' : '#163A70'} />}
      <div>{children}</div>
    </div>
  );
}

/**
 * Why the user can't start a request right now (C1), one notice per reason,
 * with a shortcut to the circle when it's too small. Renders nothing when eligible.
 */
export function NotEligible({ hideOpenLoan }: { hideOpenLoan?: boolean }) {
  const { data, go } = useFs();
  const blocks = data.eligibility.blocks.filter((b) => !(hideOpenLoan && b.code === 'open-loan'));
  if (blocks.length === 0) return null;
  return (
    <div className="fs-stack" style={{ gap: 8 }} role="status">
      {blocks.map((b) => (
        <Notice key={b.code} kind="info">
          {b.message}
          {b.code === 'small-circle' ? (
            <>
              {' '}
              <button type="button" className="fs-btn ghost small" style={{ padding: 0, display: 'inline', minHeight: 0, width: 'auto', textDecoration: 'underline' }} onClick={() => go({ name: 'circle' })}>
                Add people to your circle
              </button>
            </>
          ) : null}
        </Notice>
      ))}
    </div>
  );
}

/** Shown only when the module runs in demo mode. */
export function DemoHint({ children }: { children: ReactNode }) {
  const { demo } = useFs();
  if (!demo) return null;
  return (
    <Notice kind="demo">
      <strong>Functional mockup: </strong>
      {children}
    </Notice>
  );
}

const TONES = [
  ['#F6E3D3', '#7A3E12'],
  ['#DCEBF7', '#1D4E7A'],
  ['#E7E2F3', '#4B3B7A'],
  ['#DDEFE3', '#1F5B34'],
  ['#F7E1E6', '#7A1F3A'],
] as const;

function tone(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}

export function Avatar({ id }: { id: PersonId }) {
  const { nameOf, fullNameOf, data } = useFs();
  const label = id === data.profile.me.id ? fullNameOf(id) : nameOf(id);
  const initials = label
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const [bg, fg] = tone(id);
  return (
    <span className="fs-avatar" style={{ background: bg, color: fg }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="fs-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Terms({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="fs-terms" style={{ margin: 0 }}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
