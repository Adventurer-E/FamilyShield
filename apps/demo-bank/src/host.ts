import { createBrowserMockup, createServerMockup } from '@familyshield/sdk/mockup';
import type { MockupHost } from '@familyshield/sdk/mockup';
import { SEED_CSV } from './seedCsv';

/**
 * Where the functional mockup's data lives.
 *
 *  - `npm run dev` sets VITE_API_URL=/v1: the backend server reads and
 *    writes the CSV files in data/ (Vite proxies /v1 to it).
 *  - Without VITE_API_URL (GitHub Pages, `npm run dev:browser`): the same
 *    backend logic runs in the browser, starting from data/*.csv bundled at
 *    build time, with changes kept in this browser.
 */
const apiUrl = import.meta.env.VITE_API_URL;

/**
 * The main site and every pull-request preview share one origin
 * (adventurer-e.github.io), so browser-mode data is keyed by the page's folder:
 * a preview never sees, or overwrites, the main site's data. The WebView
 * iframe lives in the same folder, so it shares the key with its bank page.
 */
const folder = typeof window !== 'undefined' ? new URL('.', window.location.href).pathname : '/';

/**
 * Experiment arms for the M5 fee test (hypothesis #8): `?free_option=yes` on
 * the link shows the free-option choice (arm B), `?free_option=no` hides it
 * (arm A), whatever settings.csv says. Browser mode only; with the backend
 * server, set show_free_option in data/settings.csv instead.
 */
function withArm(files: Record<string, string>): Record<string, string> {
  const arm = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('free_option')?.toLowerCase() : undefined;
  if (arm !== 'yes' && arm !== 'no') return files;
  const settings = files['settings.csv'] ?? 'key,value,description\n';
  const rows = settings.split('\n').filter((line) => line && !/^show_free_option,/i.test(line));
  return { ...files, 'settings.csv': `${[...rows, `show_free_option,${arm},`].join('\n')}\n` };
}

export const host: MockupHost = apiUrl
  ? createServerMockup({ baseUrl: apiUrl })
  : createBrowserMockup({ files: withArm(SEED_CSV), storageKey: `familyshield-csv-v1:${folder}` });
