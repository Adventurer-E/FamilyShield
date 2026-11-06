import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FamilyShieldError } from '@familyshield/core';
import type { LoanCase, PersonId } from '@familyshield/core';
import type { AppConfig, FamilyShieldApi, Profile } from '../api/types';
import type { HostEvent } from '../bridge';

export type Route =
  | { name: 'hub' }
  | { name: 'request' }
  | { name: 'offers' }
  | { name: 'agreement' }
  | { name: 'repay' }
  | { name: 'reward'; rewardId: string }
  | { name: 'respond'; loanId: string }
  | { name: 'lender'; loanId: string };

export interface FsData {
  /** Rules, request reasons and rewards as the backend has them (data/settings.csv, data/reasons.csv, data/rewards.csv). */
  config: AppConfig;
  profile: Profile;
  myLoan: LoanCase | null;
  incoming: LoanCase[];
}

interface FsContext {
  api: FamilyShieldApi;
  data: FsData;
  route: Route;
  /** Open a screen. `replace` swaps the current one instead of stacking. */
  go(route: Route, options?: { replace?: boolean }): void;
  /** Back one screen; at the root this closes the module. */
  back(): void;
  emit(event: HostEvent): void;
  /** Show demo-only hints and shortcuts. */
  demo: boolean;
  /** Run an API action with a busy state and a friendly error message. */
  run<T>(action: () => Promise<T>): Promise<T | undefined>;
  busy: boolean;
  error: string | null;
  clearError(): void;
  nameOf(id: PersonId): string;
  fullNameOf(id: PersonId): string;
}

const Ctx = createContext<FsContext | null>(null);

export function useFs(): FsContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFs must be used inside <FamilyShieldProvider>');
  return ctx;
}

async function fetchAll(api: FamilyShieldApi): Promise<FsData> {
  const [config, profile, myLoan, incoming] = await Promise.all([api.getConfig(), api.getProfile(), api.getMyLoan(), api.getIncoming()]);
  return { config, profile, myLoan, incoming };
}

export function FamilyShieldProvider(props: {
  api: FamilyShieldApi;
  emit: (event: HostEvent) => void;
  demo: boolean;
  initialRoute?: Route;
  children: (state: { ready: boolean; loadError: string | null }) => ReactNode;
}) {
  const { api, emit, demo } = props;
  const [data, setData] = useState<FsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stack, setStack] = useState<Route[]>([props.initialRoute ?? { name: 'hub' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevStatus = useRef<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setData(await fetchAll(api));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'FamilyShield couldn’t load.');
    }
  }, [api]);

  useEffect(() => {
    void load();
    return api.subscribe(() => void load());
  }, [api, load]);

  useEffect(() => {
    if (data) emit({ type: 'ready' });
    // Only once, on first successful load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null]);

  // Tell the host when the loan goes live or is fully repaid, so it can refresh balances.
  useEffect(() => {
    const loan = data?.myLoan;
    const before = prevStatus.current;
    prevStatus.current = loan?.status;
    if (!loan || !before || before === loan.status) return;
    const funded = loan.agreements.reduce((t, a) => t + a.principal, 0);
    if (loan.status === 'active' && before === 'signing') emit({ type: 'loan.funded', loanId: loan.id, amount: funded });
    if (loan.status === 'repaid') emit({ type: 'loan.repaid', loanId: loan.id });
  }, [data?.myLoan, emit]);

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        await load();
        return result;
      } catch (e) {
        const message = e instanceof FamilyShieldError ? e.message : 'Something went wrong. Please try again.';
        setError(message);
        if (!(e instanceof FamilyShieldError)) emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [load, emit],
  );

  const go = useCallback((route: Route, options?: { replace?: boolean }) => {
    setError(null);
    setStack((s) => (options?.replace ? [...s.slice(0, -1), route] : [...s, route]));
  }, []);

  const back = useCallback(() => {
    setError(null);
    setStack((s) => {
      if (s.length <= 1) {
        emit({ type: 'close' });
        return s;
      }
      return s.slice(0, -1);
    });
  }, [emit]);

  if (!data) return <>{props.children({ ready: false, loadError })}</>;

  const person = (id: PersonId) => data.profile.people.find((p) => p.id === id) ?? (data.profile.me.id === id ? data.profile.me : undefined);
  const value: FsContext = {
    api,
    data,
    route: stack[stack.length - 1]!,
    go,
    back,
    emit,
    demo,
    run,
    busy,
    error,
    clearError: () => setError(null),
    nameOf: (id) => {
      if (id === data.profile.me.id) return 'You';
      const p = person(id);
      return p ? p.nickname ?? p.firstName : 'Family member';
    },
    fullNameOf: (id) => {
      const p = person(id);
      return p ? `${p.firstName} ${p.lastName}` : 'Family member';
    },
  };

  return <Ctx.Provider value={value}>{props.children({ ready: true, loadError })}</Ctx.Provider>;
}
