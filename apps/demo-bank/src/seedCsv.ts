/**
 * The CSV fake database from data/ at the repo root, bundled at build time.
 * Used only in browser mode (no backend server), e.g. on GitHub Pages.
 * Change a CSV, rebuild, and the bundled data follows.
 */
const modules = import.meta.glob('../../../data/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const SEED_CSV: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, text]) => [path.split('/').pop()!, text]),
);
