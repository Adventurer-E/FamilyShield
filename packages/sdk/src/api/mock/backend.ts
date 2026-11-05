import {
  FamilyShieldError,
  cancelPause,
  cancelRequest,
  claimReward,
  createLoanCase,
  getReward,
  isOpen,
  recordPayment,
  requestPause,
  respondToPause,
  respondToRequest,
  setOfferAccepted,
  signAsBorrower,
  signAsLender,
} from '@familyshield/core';
import type { Cents, LoanCase, Person, PersonId } from '@familyshield/core';
import type { CreateRequestInput, FamilyShieldApi, Profile } from '../types';
import { DEMO_BALANCES, DEMO_CIRCLES, DEMO_NICKNAMES, DEMO_PEOPLE, DEMO_SCRIPTED } from './seed';
import type { ScriptedPersona } from './seed';

/**
 * An in-browser stand-in for the FamilyShield service AND the bank's ledger.
 *
 * - Applies the same @familyshield/core rules a real backend would.
 * - Redacts what each user can see, like the real API must.
 * - Plays scripted family members (see seed.ts) so one person can demo it.
 * - Optionally persists to localStorage and syncs across tabs/iframes of the
 *   same origin, which is how the demo bank's "WebView" mode shares state.
 */

export interface LedgerEntry {
  id: string;
  userId: PersonId;
  /** Positive = money in, negative = money out. */
  amount: Cents;
  memo: string;
  at: string;
}

export interface MockState {
  version: 1;
  seq: number;
  people: Person[];
  circles: Record<PersonId, PersonId[]>;
  nicknames: Record<PersonId, Record<PersonId, string>>;
  balances: Record<PersonId, Cents>;
  loans: LoanCase[];
  ledger: LedgerEntry[];
}

export interface MockBackendOptions {
  /** localStorage key to persist under; null keeps state in memory only. */
  storageKey?: string | null;
  /** Simulated network latency per call. */
  latencyMs?: number;
  scripted?: Record<PersonId, ScriptedPersona>;
  now?: () => Date;
}

export interface MockBackend {
  apiFor(userId: PersonId): FamilyShieldApi;
  getState(): MockState;
  /** The bank-side view: balance and FamilyShield transfers for one customer. */
  getAccount(userId: PersonId): { balance: Cents; ledger: LedgerEntry[] };
  subscribe(listener: () => void): () => void;
  reset(): void;
  dispose(): void;
}

function seedState(): MockState {
  return {
    version: 1,
    seq: 0,
    people: structuredClone(DEMO_PEOPLE),
    circles: structuredClone(DEMO_CIRCLES),
    nicknames: structuredClone(DEMO_NICKNAMES),
    balances: { ...DEMO_BALANCES },
    loans: [],
    ledger: [],
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Strip everything a lender must not see: other members' offers, agreements and payouts. */
export function redactForLender(loan: LoanCase, viewerId: PersonId): LoanCase {
  const copy = structuredClone(loan);
  copy.offers = copy.offers.filter((o) => o.memberId === viewerId);
  copy.agreements = copy.agreements.filter((a) => a.lenderId === viewerId);
  copy.schedule = copy.schedule.map((i) => {
    const parts = i.parts.filter((p) => p.to === viewerId);
    return { ...i, parts, amount: parts.reduce((t, p) => t + p.amount, 0) };
  });
  if (copy.pause) {
    copy.pause.approvals = viewerId in copy.pause.approvals ? { [viewerId]: copy.pause.approvals[viewerId] ?? null } : {};
  }
  return copy;
}

export function createMockBackend(options: MockBackendOptions = {}): MockBackend {
  const storageKey = options.storageKey === undefined ? 'familyshield-demo' : options.storageKey;
  const latency = options.latencyMs ?? 200;
  const scripted = options.scripted ?? DEMO_SCRIPTED;
  const now = options.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  let state = readStorage() ?? seedState();

  function readStorage(): MockState | null {
    const raw = storageKey ? storage()?.getItem(storageKey) : null;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as MockState;
      return parsed.version === 1 ? parsed : null;
    } catch {
      return null; // corrupt demo state: ignore it
    }
  }

  /** Pick up writes made by another tab or the WebView iframe. */
  function refresh(): void {
    const stored = readStorage();
    if (stored) state = stored;
  }

  function save(): void {
    if (storageKey) {
      try {
        storage()?.setItem(storageKey, JSON.stringify(state));
      } catch {
        /* storage full or blocked: keep working in memory */
      }
    }
  }

  function notify(): void {
    for (const l of listeners) l();
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    state = readStorage() ?? seedState();
    notify();
    kick();
  };
  if (storageKey && typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  function nextId(prefix: string): string {
    state.seq += 1;
    return `${prefix}_${now().getTime().toString(36)}${state.seq}`;
  }

  function findLoan(loanId: string): LoanCase {
    const loan = state.loans.find((l) => l.id === loanId);
    if (!loan) throw new FamilyShieldError('NOT_FOUND', 'That request no longer exists.');
    return loan;
  }

  function post(userId: PersonId, amount: Cents, memo: string): void {
    state.ledger.push({ id: nextId('txn'), userId, amount, memo, at: now().toISOString() });
    state.balances[userId] = (state.balances[userId] ?? 0) + amount;
  }

  function name(viewerId: PersonId, personId: PersonId): string {
    const nick = state.nicknames[viewerId]?.[personId];
    if (nick) return nick;
    const p = state.people.find((x) => x.id === personId);
    return p ? p.firstName : 'Family member';
  }

  /** Move money in the bank ledger when a loan is funded or a payment is made. */
  function settle(before: LoanCase, after: LoanCase): void {
    if (before.status === 'signing' && after.status === 'active') {
      for (const a of after.agreements) {
        post(after.borrowerId, a.principal, `FamilyShield loan from ${name(after.borrowerId, a.lenderId)}`);
        post(a.lenderId, -a.principal, `FamilyShield loan to ${name(a.lenderId, after.borrowerId)}`);
      }
    }
    for (const inst of after.schedule) {
      const wasPaid = before.schedule[inst.index]?.paidAt;
      if (inst.paidAt && !wasPaid) {
        post(after.borrowerId, -inst.amount, `FamilyShield payment ${inst.index + 1} of ${after.schedule.length}`);
        for (const part of inst.parts) {
          if (part.to !== 'fee') post(part.to, part.amount, `FamilyShield repayment from ${name(part.to, after.borrowerId)}`);
        }
      }
    }
  }

  /** Apply a core transition to one loan, then settle, persist and notify. */
  function mutate(loanId: string, fn: (loan: LoanCase) => LoanCase): LoanCase {
    refresh(); // another tab or the WebView may have written since
    const before = findLoan(loanId);
    const after = fn(before);
    state.loans = state.loans.map((l) => (l.id === loanId ? after : l));
    settle(before, after);
    save();
    notify();
    kick();
    return after;
  }

  /** Schedule whatever the scripted family members would do next. */
  function kick(): void {
    for (const loan of state.loans) {
      for (const offer of loan.offers) {
        const persona = scripted[offer.memberId];
        if (!persona || loan.status !== 'collecting' || offer.status !== 'pending') continue;
        const due = new Date(loan.createdAt).getTime() + persona.respondAfterMs;
        schedule(`respond:${loan.id}:${offer.memberId}`, due - now().getTime(), () =>
          mutate(loan.id, (l) => respondToRequest(l, offer.memberId, persona.respond(l), now().toISOString())),
        );
      }
      if (loan.status === 'signing') {
        for (const a of loan.agreements) {
          if (!scripted[a.lenderId]?.autoSign || a.lenderSignedAt) continue;
          schedule(`sign:${loan.id}:${a.lenderId}`, 1_500, () =>
            mutate(loan.id, (l) => signAsLender(l, a.lenderId, now().toISOString())),
          );
        }
      }
      if (loan.pause?.status === 'pending') {
        for (const [lenderId, answer] of Object.entries(loan.pause.approvals)) {
          if (!scripted[lenderId]?.autoApprovePause || answer !== null) continue;
          schedule(`pause:${loan.id}:${loan.pause.requestedAt}:${lenderId}`, 1_500, () =>
            mutate(loan.id, (l) => respondToPause(l, lenderId, true)),
          );
        }
      }
    }
  }

  function schedule(key: string, delayMs: number, run: () => void): void {
    if (timers.has(key)) return;
    timers.set(
      key,
      setTimeout(() => {
        try {
          run();
        } catch (e) {
          // The state moved on (e.g. the borrower signed first): nothing to do.
          if (!(e instanceof FamilyShieldError)) throw e;
        }
      }, Math.max(0, delayMs)),
    );
  }

  function profileFor(userId: PersonId): Profile {
    const withNick = (p: Person): Person => {
      const nickname = state.nicknames[userId]?.[p.id];
      return nickname ? { ...p, nickname } : { ...p };
    };
    const me = state.people.find((p) => p.id === userId);
    if (!me) throw new FamilyShieldError('NOT_FOUND', `Unknown demo user "${userId}".`);
    const circleIds = state.circles[userId] ?? [];
    const askedBy = state.loans.filter((l) => l.offers.some((o) => o.memberId === userId)).map((l) => l.borrowerId);
    const visible = new Set([...circleIds, ...askedBy]);
    return {
      me: withNick(me),
      circle: state.people.filter((p) => circleIds.includes(p.id)).map(withNick),
      people: state.people.filter((p) => visible.has(p.id)).map(withNick),
      account: { id: `chk-${userId}`, label: 'Everyday Checking ••4821' },
    };
  }

  function apiFor(userId: PersonId): FamilyShieldApi {
    const at = () => now().toISOString();
    const asBorrower = (loanId: string) => {
      const loan = findLoan(loanId);
      if (loan.borrowerId !== userId) throw new FamilyShieldError('FORBIDDEN', 'This isn’t your request.');
      return loan;
    };
    const asLender = (loanId: string) => {
      const loan = findLoan(loanId);
      if (!loan.offers.some((o) => o.memberId === userId)) throw new FamilyShieldError('FORBIDDEN', 'You weren’t asked on this request.');
      return loan;
    };
    // Every call: fresh state, simulated latency, then the action.
    const call = async <T>(fn: () => T): Promise<T> => {
      await sleep(latency);
      refresh();
      return fn();
    };
    const borrowerOp = (loanId: string, fn: (l: LoanCase) => LoanCase) =>
      call(() => {
        asBorrower(loanId);
        return mutate(loanId, fn);
      });
    const lenderOp = (loanId: string, fn: (l: LoanCase) => LoanCase) =>
      call(() => {
        asLender(loanId);
        return redactForLender(mutate(loanId, fn), userId);
      });

    return {
      getProfile: () => call(() => profileFor(userId)),
      getMyLoan: () =>
        call(() => {
          const mine = state.loans.filter((l) => l.borrowerId === userId && l.status !== 'cancelled');
          return mine.length ? structuredClone(mine[mine.length - 1]!) : null;
        }),
      getIncoming: () =>
        call(() =>
          state.loans
            .filter((l) => l.status !== 'cancelled' && l.offers.some((o) => o.memberId === userId))
            .map((l) => redactForLender(l, userId))
            .reverse(),
        ),

      createRequest: (input: CreateRequestInput) =>
        call(() => {
          if (state.loans.some((l) => l.borrowerId === userId && isOpen(l))) {
            throw new FamilyShieldError('INVALID_STATE', 'You already have an open request or loan.');
          }
          const loan = createLoanCase({
            id: nextId('loan'),
            borrowerId: userId,
            circle: state.circles[userId] ?? [],
            ...input,
            now: at(),
          });
          state.loans.push(loan);
          save();
          notify();
          kick();
          return structuredClone(loan);
        }),
      cancelRequest: (loanId) => borrowerOp(loanId, cancelRequest),
      setOfferAccepted: (loanId, memberId, accepted) => borrowerOp(loanId, (l) => setOfferAccepted(l, memberId, accepted)),
      signAsBorrower: (loanId) => borrowerOp(loanId, (l) => signAsBorrower(l, at())),
      makePayment: (loanId) => borrowerOp(loanId, (l) => recordPayment(l, at())),
      requestPause: (loanId) => borrowerOp(loanId, (l) => requestPause(l, at())),
      cancelPause: (loanId) => borrowerOp(loanId, cancelPause),
      claimReward: (loanId, rewardId) =>
        borrowerOp(loanId, (l) => {
          const reward = getReward(rewardId);
          const code = `FS-${reward.partner.split(/\s/)[0]!.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
          return claimReward(l, rewardId, code, at());
        }),

      respond: (loanId, response) => lenderOp(loanId, (l) => respondToRequest(l, userId, response, at())),
      signAsLender: (loanId) => lenderOp(loanId, (l) => signAsLender(l, userId, at())),
      respondToPause: (loanId, approve) => lenderOp(loanId, (l) => respondToPause(l, userId, approve)),

      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  kick();

  return {
    apiFor,
    getState: () => structuredClone(state),
    getAccount: (userId) => ({
      balance: state.balances[userId] ?? 0,
      ledger: state.ledger.filter((e) => e.userId === userId).slice().reverse(),
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset: () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      state = seedState();
      save();
      notify();
    },
    dispose: () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      listeners.clear();
      if (storageKey && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    },
  };
}
