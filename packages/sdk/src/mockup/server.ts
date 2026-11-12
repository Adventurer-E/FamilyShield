import { FamilyShieldError } from '@familyshield/core';
import type { AccountSummary, MockupClock, MockupPerson } from '@familyshield/core';
import { HttpApi } from '../api/http';
import type { MockupHost } from './types';

/**
 * Functional mockup backed by the Node server (packages/server), which reads
 * and writes the CSV files in data/. The "token" is simply the person's id
 * from data/people.csv.
 */
export function createServerMockup(options: { baseUrl: string; pollIntervalMs?: number }): MockupHost {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const poll = options.pollIntervalMs ?? 1_500;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const apis = new Map<string, HttpApi>();

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new FamilyShieldError('INVALID_STATE', data.error?.message ?? `Server error ${res.status}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    mode: 'server',
    apiFor(userId) {
      let api = apis.get(userId);
      if (!api) {
        api = new HttpApi({ baseUrl, getToken: () => userId, pollIntervalMs: poll });
        apis.set(userId, api);
      }
      return api;
    },
    people: () => call<MockupPerson[]>('GET', '/mockup/people'),
    account: (userId) => call<AccountSummary>('GET', `/mockup/accounts/${encodeURIComponent(userId)}`),
    clock: () => call<MockupClock>('GET', '/mockup/clock'),
    async skipAhead(days) {
      const clock = await call<MockupClock>('POST', '/mockup/clock/skip', { days });
      notify();
      return clock;
    },
    async reset() {
      await call('POST', '/mockup/reset');
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      timer ??= setInterval(notify, poll);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
    dispose() {
      listeners.clear();
      if (timer) clearInterval(timer);
    },
  };
}
