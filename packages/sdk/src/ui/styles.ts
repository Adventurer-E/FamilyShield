/**
 * The module's stylesheet. It is injected into the module's own shadow root
 * (or the embed page), so it can't leak into, or be broken by, the bank app's CSS.
 * Every color comes from a --fs-* theme token (see theme.ts).
 */
export const styles = `
:host { display: block; height: 100%; }
.fs-root, .fs-root * { box-sizing: border-box; }
.fs-root {
  font-family: var(--fs-font); color: var(--fs-ink); background: var(--fs-ground);
  font-size: 15px; line-height: 1.45; -webkit-font-smoothing: antialiased;
  height: 100%; overflow-y: auto; position: relative;
}
/* :where() keeps the reset at zero specificity so component classes win. */
:where(.fs-root) :where(button, input, textarea) { font: inherit; color: inherit; }
.fs-root :focus-visible { outline: 3px solid var(--fs-brand); outline-offset: 2px; }

.fs-screen { display: flex; flex-direction: column; gap: 14px; padding: 0 16px 32px; max-width: 560px; margin: 0 auto; }
.fs-header { display: flex; align-items: center; gap: 10px; padding: 20px 0 4px; }
.fs-header-text { flex: 1; min-width: 0; }
.fs-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .06em; color: var(--fs-brand); text-transform: uppercase; }
.fs-title { font-size: 20px; font-weight: 800; margin: 0; line-height: 1.2; }
.fs-icon-btn { width: 44px; height: 44px; border-radius: 22px; border: none; background: var(--fs-surface); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }

.fs-steps { display: flex; gap: 6px; }
.fs-steps span { flex: 1; height: 4px; border-radius: 2px; background: var(--fs-line); }
.fs-steps span.on { background: var(--fs-brand); }
.fs-steps-label { font-size: 12px; font-weight: 700; color: var(--fs-muted); margin-top: -8px; }

.fs-card { background: var(--fs-surface); border-radius: calc(var(--fs-radius) + 4px); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.fs-card.outline { border: 1px solid var(--fs-line); }
.fs-card.brand { background: var(--fs-brand); color: var(--fs-on-brand); }
.fs-card.soft { background: var(--fs-brand-soft); }
.fs-card.night { background: var(--fs-night); color: #fff; }
.fs-card.late { background: #FFF6E5; border: 1px solid #F0C36B; color: #5C3B00; }
.fs-card.late .fs-h3 { color: #5C3B00; }
.fs-card.flush { padding: 0; gap: 0; overflow: hidden; }
.fs-card h2, .fs-card h3 { margin: 0; }
.fs-h2 { font-size: 24px; font-weight: 800; line-height: 1.2; }
.fs-h3 { font-size: 16px; font-weight: 800; }
.fs-roles { display: flex; gap: 4px; padding: 4px; border-radius: 999px; background: var(--fs-surface); border: 1px solid var(--fs-line); }
.fs-role { flex: 1; min-height: 40px; border: none; border-radius: 999px; background: transparent; color: var(--fs-muted); font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.fs-role[aria-selected="true"] { background: var(--fs-brand); color: var(--fs-on-brand); }
.fs-role-dot { width: 8px; height: 8px; border-radius: 4px; background: var(--fs-accent); }
.fs-section-title { font-size: 15px; font-weight: 800; margin: 6px 0 -4px; }
.fs-muted { color: var(--fs-muted); }
.fs-small { font-size: 13px; }
.fs-tiny { font-size: 12px; }
.fs-big { font-size: 30px; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
.fs-row { display: flex; align-items: center; gap: 12px; }
.fs-between { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.fs-grow { flex: 1; min-width: 0; }
.fs-stack { display: flex; flex-direction: column; gap: 10px; }
.fs-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.fs-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }

.fs-btn { min-height: 52px; border-radius: 14px; border: none; padding: 0 18px; font-size: 16px; font-weight: 800; cursor: pointer; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; }
.fs-btn.primary { background: var(--fs-brand); color: var(--fs-on-brand); }
.fs-btn.secondary { background: var(--fs-surface); color: var(--fs-ink); border: 1px solid #CBD2DE; min-height: 48px; font-size: 15px; font-weight: 700; }
.fs-btn.dark { background: var(--fs-night); color: #fff; }
.fs-btn.ghost { background: transparent; color: var(--fs-brand-strong); min-height: 44px; font-size: 14px; }
.fs-btn.small { min-height: 36px; width: auto; font-size: 13px; padding: 0 14px; border-radius: 999px; }
.fs-btn[disabled] { background: var(--fs-line); color: #4A5466; cursor: not-allowed; border: none; }
.fs-btn.busy { opacity: .7; cursor: progress; }

.fs-chip { min-height: 48px; border-radius: 12px; border: 1px solid #CBD2DE; background: var(--fs-surface); font-weight: 700; font-size: 14px; cursor: pointer; padding: 0 10px; }
.fs-chip[aria-pressed="true"] { background: var(--fs-brand); border-color: var(--fs-brand); color: var(--fs-on-brand); }

.fs-option { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px; border: 2px solid var(--fs-line); background: var(--fs-surface); cursor: pointer; text-align: left; width: 100%; }
.fs-option[aria-checked="true"] { border-color: var(--fs-brand); background: var(--fs-brand-soft); }
.fs-radio { width: 22px; height: 22px; border-radius: 11px; border: 2px solid #9AA4B5; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fs-option[aria-checked="true"] .fs-radio { border-color: var(--fs-brand); }
.fs-option[aria-checked="true"] .fs-radio::after { content: ""; width: 10px; height: 10px; border-radius: 5px; background: var(--fs-brand); }

.fs-stepper { display: flex; align-items: center; justify-content: space-between; }
.fs-round { width: 48px; height: 48px; border-radius: 24px; border: 1px solid #CBD2DE; background: var(--fs-surface); font-size: 22px; font-weight: 700; cursor: pointer; }
.fs-round[disabled] { opacity: .4; cursor: not-allowed; }

.fs-field { display: flex; flex-direction: column; gap: 6px; }
.fs-field label { font-size: 15px; font-weight: 800; }
.fs-input { width: 100%; border: 1px solid #CBD2DE; border-radius: 14px; padding: 12px 14px; background: var(--fs-surface); font-size: 15px; line-height: 1.5; resize: vertical; }

.fs-notice { display: flex; gap: 10px; background: #EEF1F6; border-radius: 14px; padding: 12px 14px; font-size: 13px; color: #3B4659; line-height: 1.5; }
.fs-notice svg { flex-shrink: 0; margin-top: 1px; }
.fs-notice.demo { background: #FFF6DB; color: #5C4300; }
.fs-error { background: #FDECEC; color: #8A1C1C; border-radius: 14px; padding: 12px 14px; font-size: 14px; font-weight: 600; display: flex; gap: 10px; align-items: flex-start; }
.fs-error button { margin-left: auto; border: none; background: transparent; font-weight: 800; color: inherit; cursor: pointer; }

.fs-avatar { width: 44px; height: 44px; border-radius: 22px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; border: 2px solid var(--fs-surface); }
.fs-avatars { display: flex; }
.fs-avatars .fs-avatar { width: 36px; height: 36px; font-size: 12px; }
.fs-avatars .fs-avatar + .fs-avatar { margin-left: -10px; }

.fs-pill { display: inline-flex; align-items: center; font-size: 12px; font-weight: 800; border-radius: 999px; padding: 4px 10px; background: #EEF1F6; color: #3B4659; white-space: nowrap; }
.fs-pill.brand { background: var(--fs-brand-soft); color: var(--fs-brand-strong); }
.fs-pill.solid { background: var(--fs-brand); color: var(--fs-on-brand); }
.fs-pill.warn { background: #FFF1D6; color: #7A4B00; }

.fs-bar { height: 8px; border-radius: 4px; background: var(--fs-line); overflow: hidden; }
.fs-bar > span { display: block; height: 100%; border-radius: 4px; background: var(--fs-brand); transition: width .4s ease; }
.fs-card.brand .fs-bar { background: rgba(255,255,255,.25); }
.fs-card.brand .fs-bar > span { background: #fff; }

.fs-list-btn { width: 100%; border: none; background: transparent; padding: 16px; display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer; }
.fs-list-btn + .fs-list-btn { border-top: 1px solid var(--fs-line); }
.fs-tile { width: 40px; height: 40px; border-radius: 12px; background: #EEF1F6; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: #163A70; font-size: 12px; font-weight: 800; }

.fs-terms { display: flex; flex-direction: column; padding: 4px 16px; }
.fs-terms > div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 14px; border-bottom: 1px solid #EEF1F6; }
.fs-terms > div:last-child { border-bottom: none; }
.fs-terms dt { color: var(--fs-muted); }
.fs-terms dd { margin: 0; font-weight: 700; text-align: right; }
.fs-doc-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #F6F7FA; border-bottom: 1px solid var(--fs-line); font-weight: 800; }
.fs-sigs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 0 16px 16px; }
.fs-sig { border: 1px solid var(--fs-line); border-radius: 12px; padding: 10px; min-height: 76px; }
.fs-sig .who { font-size: 11px; font-weight: 800; color: var(--fs-muted); }
.fs-sig .ink { font-family: "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive; font-size: 22px; color: #163A70; line-height: 1.4; }

.fs-quote { background: #F6F7FA; border-radius: 12px; padding: 10px 12px; font-size: 14px; color: #3B4659; }
.fs-code { border: 2px dashed var(--fs-brand); border-radius: 16px; padding: 16px; text-align: center; background: var(--fs-surface); }
.fs-code strong { display: block; font-size: 24px; letter-spacing: .08em; color: var(--fs-brand-strong); }
.fs-dot { width: 10px; height: 10px; border-radius: 5px; background: var(--fs-brand); flex-shrink: 0; animation: fs-pulse 1.4s ease-in-out infinite; }
@keyframes fs-pulse { 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) { .fs-dot { animation: none; } .fs-bar > span { transition: none; } }

.fs-loading { display: flex; align-items: center; justify-content: center; height: 100%; min-height: 240px; color: var(--fs-muted); gap: 10px; }
.fs-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
