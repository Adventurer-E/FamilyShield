import { ACTIVITY_FILES, FamilyShieldService, SETUP_FILES, emptyActivity } from '@familyshield/service';
import type { CsvFiles, CsvStorage } from '@familyshield/service';
import type { FamilyShieldApi } from '../api/types';
import type { MockupHost } from './types';

/**
 * Functional mockup with no server, e.g. on GitHub Pages. It runs the same
 * backend logic (FamilyShieldService) in the browser:
 *
 *  - setup tables (people, settings, reasons, rewards, auto replies) come
 *    from the CSV files bundled at build time, i.e. data/ in the repo;
 *  - activity tables start from those files and are then kept in this
 *    browser's localStorage, still as CSV text, so they can be downloaded;
 *    "reset" forgets them, which brings back the starting state from data/.
 *
 * Tabs and the WebView iframe on the same origin share the data and stay in
 * sync through storage events.
 */
export function createBrowserMockup(options: { files: CsvFiles; storageKey?: string; latencyMs?: number }): MockupHost {
  const prefix = `${options.storageKey ?? 'familyshield-csv'}:`;
  const latency = options.latencyMs ?? 150;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const memory: CsvFiles = {}; // fallback when localStorage is unavailable

  const ls = (): Storage | null => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  };
  const getItem = (file: string): string | null => {
    try {
      return ls()?.getItem(prefix + file) ?? memory[file] ?? null;
    } catch {
      return memory[file] ?? null;
    }
  };

  const storage: CsvStorage = {
    read() {
      const files: CsvFiles = {};
      for (const f of SETUP_FILES) if (options.files[f] !== undefined) files[f] = options.files[f]!;
      const empty = emptyActivity();
      for (const f of ACTIVITY_FILES) files[f] = getItem(f) ?? options.files[f] ?? empty[f]!;
      return files;
    },
    write(activity) {
      for (const [f, text] of Object.entries(activity)) {
        memory[f] = text;
        try {
          ls()?.setItem(prefix + f, text);
        } catch {
          /* private mode or full: memory copy still works for this tab */
        }
      }
      notify();
    },
    /** Forget this browser's activity, so the bundled data/ starting state shows again. */
    reset() {
      for (const f of ACTIVITY_FILES) {
        delete memory[f];
        try {
          ls()?.removeItem(prefix + f);
        } catch {
          /* nothing stored */
        }
      }
      notify();
    },
  };

  const service = new FamilyShieldService(storage);
  const tick = setInterval(() => {
    try {
      service.tick();
    } catch {
      /* bad data surfaces through the next API call instead */
    }
  }, 500);

  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(prefix)) notify();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  /** Run a service call asynchronously, like a network call would be. */
  const async = <T,>(fn: () => T): Promise<T> =>
    new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(fn());
        } catch (e) {
          reject(e);
        }
      }, latency),
    );

  return {
    mode: 'browser',
    apiFor(userId): FamilyShieldApi {
      return {
        getConfig: () => async(() => service.config()),
        getProfile: () => async(() => service.profile(userId)),
        getMyLoan: () => async(() => service.myLoan(userId)),
        getIncoming: () => async(() => service.incoming(userId)),
        getEligibility: () => async(() => service.eligibility(userId)),
        createRequest: (input) => async(() => service.createRequest(userId, input)),
        cancelRequest: (id) => async(() => service.cancelRequest(userId, id)),
        setOfferAccepted: (id, memberId, accepted) => async(() => service.setOfferAccepted(userId, id, memberId, accepted)),
        signAsBorrower: (id) => async(() => service.signAsBorrower(userId, id)),
        makePayment: (id) => async(() => service.makePayment(userId, id)),
        requestPause: (id) => async(() => service.requestPause(userId, id)),
        cancelPause: (id) => async(() => service.cancelPause(userId, id)),
        claimReward: (id, rewardId) => async(() => service.claimReward(userId, id, rewardId)),
        respond: (id, response) => async(() => service.respond(userId, id, response)),
        signAsLender: (id) => async(() => service.signAsLender(userId, id)),
        respondToPause: (id, approve) => async(() => service.respondToPause(userId, id, approve)),
        getCircle: () => async(() => service.circle(userId)),
        addCircleMember: (contact, opts) => async(() => service.addCircleMemberByContact(userId, contact, opts)),
        renameCircleMember: (memberId, nickname) => async(() => service.renameCircleMember(userId, memberId, nickname)),
        removeCircleMember: (memberId) => async(() => service.removeCircleMember(userId, memberId)),
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    },
    people: () => async(() => service.people()),
    account: (userId) => async(() => service.account(userId)),
    clock: () => async(() => service.mockupClock()),
    skipAhead: (days) => async(() => service.skipAhead(days)),
    reset: () => async(() => service.reset()),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    exportCsv: () => storage.read(),
    dispose() {
      clearInterval(tick);
      listeners.clear();
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    },
  };
}
