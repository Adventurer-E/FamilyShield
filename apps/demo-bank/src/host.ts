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

export const host: MockupHost = apiUrl
  ? createServerMockup({ baseUrl: apiUrl })
  : createBrowserMockup({ files: SEED_CSV, storageKey: 'familyshield-csv-v1' });
