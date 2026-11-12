import { useEffect, useMemo, useRef } from 'react';
import { ACTIVITY_FILES, SETUP_FILES } from '@familyshield/service';
import { host } from './host';

/** Explains where the data lives and, in browser mode, lets you download the CSVs. */
export function CsvPanel({ onClose }: { onClose: () => void }) {
  const files = useMemo(() => host.exportCsv?.() ?? null, []);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const href = (name: string) => (files ? URL.createObjectURL(new Blob([files[name] ?? ''], { type: 'text/csv' })) : '#');
  const rows = (name: string) => Math.max(0, (files?.[name] ?? '').trim().split('\n').length - 1);

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-labelledby="csv-title" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2 id="csv-title">Where the data lives</h2>
          <button ref={closeRef} type="button" className="panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {host.mode === 'server' ? (
          <>
            <p>The backend server works with two folders of CSV files. Open any of them in a spreadsheet or text editor; edits show up on the next refresh.</p>
            <ul className="csv-list">
              <li>
                <span>
                  <code>data/</code>: shared and committed. People, rules, rewards, and the starting state.
                </span>
              </li>
              <li>
                <span>
                  <code>data/local/</code>: your working copy, ignored by git. Everything you do here is written there.
                </span>
              </li>
            </ul>
            <p>
              “Reset” (or <code>npm run data:reset</code>) goes back to the shared starting state. <code>npm run data:save</code>{' '}
              copies your state into <code>data/</code> so you can commit and share it. See <code>data/README.md</code>.
            </p>
          </>
        ) : (
          <>
            <p>
              No server is running here, so FamilyShield runs in your browser. It starts from the CSV files in the repo’s <code>data/</code>{' '}
              folder, and new activity is saved in this browser only. Download the current files below.
            </p>
            <h3>Setup (from the repo, read-only here)</h3>
            <ul className="csv-list">
              {SETUP_FILES.map((f) => (
                <li key={f}>
                  <a href={href(f)} download={f}>{f}</a> <span>{rows(f)} rows</span>
                </li>
              ))}
            </ul>
            <h3>Activity (saved in this browser)</h3>
            <ul className="csv-list">
              {ACTIVITY_FILES.map((f) => (
                <li key={f}>
                  <a href={href(f)} download={f}>{f}</a> <span>{rows(f)} rows</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
