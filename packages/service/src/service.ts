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
  withdrawMember,
} from '@familyshield/core';
import type {
  AccountSummary,
  AppConfig,
  CreateRequestInput,
  LenderResponse,
  LoanCase,
  MockupPerson,
  Person,
  Profile,
} from '@familyshield/core';
import { emptyActivity, readDatabase, writeActivity } from './database';
import type { CsvFiles, Database } from './database';
import { formatPhone, parseContact } from './contact';
import type { Contact } from './contact';

/**
 * Where the CSV files live. Setup tables always come from the shared, committed
 * data/ folder. Activity tables come from a working copy: data/local/ on disk
 * for the Node server (git-ignored), localStorage in the browser build.
 */
export interface CsvStorage {
  /** Every table, setup and activity, as CSV text keyed by file name. */
  read(): CsvFiles;
  /** Called with the activity tables only; setup tables are never rewritten. */
  write(activity: CsvFiles): void;
  /**
   * Put the working copy back to the shared starting state in data/.
   * Without it, reset empties the activity tables.
   */
  reset?(): void;
}

export interface ServiceOptions {
  now?: () => Date;
  random?: () => number;
  /** How long an auto-signing relative waits after the borrower signs. */
  autoSignDelayMs?: number;
  /** How long an auto-approving relative waits before answering a pause. */
  autoPauseDelayMs?: number;
}

/** What a lender may see: their own offer, agreement, payouts and pause answer only. */
export function redactForLender(loan: LoanCase, viewerId: string): LoanCase {
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

/**
 * The FamilyShield backend, minus HTTP: every operation the API offers,
 * applied to the CSV database with the shared @familyshield/core rules.
 *
 * Each call reads the CSVs fresh, so edits made by hand show up immediately.
 * Scripted relatives (auto_replies.csv) are evaluated lazily from timestamps:
 * there are no timers to lose, and `tick()` simply applies whatever is due.
 */
export class FamilyShieldService {
  private readonly storage: CsvStorage;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly autoSignDelayMs: number;
  private readonly autoPauseDelayMs: number;
  private seq = 0;

  constructor(storage: CsvStorage, options: ServiceOptions = {}) {
    this.storage = storage;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.autoSignDelayMs = options.autoSignDelayMs ?? 1_500;
    this.autoPauseDelayMs = options.autoPauseDelayMs ?? 1_500;
  }

  // ------------------------------------------------------------ plumbing

  private iso(): string {
    return this.now().toISOString();
  }

  private id(prefix: string): string {
    this.seq += 1;
    const rand = Math.floor(this.random() * 36 ** 3).toString(36).padStart(3, '0');
    return `${prefix}_${this.now().getTime().toString(36)}${rand}${this.seq}`;
  }

  /** Load the database and apply any scripted actions that are due. */
  private open(): Database {
    const db = readDatabase(this.storage.read());
    if (this.automate(db)) this.storage.write(writeActivity(db));
    return db;
  }

  private user(db: Database, userId: string) {
    const person = db.people.find((p) => p.id === userId);
    if (!person) throw new FamilyShieldError('NOT_FOUND', `Unknown user "${userId}". Add them to people.csv.`);
    return person;
  }

  private loan(db: Database, loanId: string): LoanCase {
    const loan = db.loans.find((l) => l.id === loanId);
    if (!loan) throw new FamilyShieldError('NOT_FOUND', 'That request no longer exists.');
    return loan;
  }

  private nickname(db: Database, viewerId: string, personId: string): string {
    const c = db.circles.find((x) => x.ownerId === viewerId && x.memberId === personId);
    if (c?.nickname) return c.nickname;
    return db.people.find((p) => p.id === personId)?.firstName ?? 'Family member';
  }

  private post(db: Database, userId: string, amount: number, memo: string): void {
    db.transactions.push({ id: this.id('txn'), userId, at: this.iso(), amount, memo });
  }

  /** Bank ledger postings when a loan is funded or an installment is paid. */
  private settle(db: Database, before: LoanCase, after: LoanCase): void {
    if (before.status === 'signing' && after.status === 'active') {
      for (const a of after.agreements) {
        this.post(db, after.borrowerId, a.principal, `FamilyShield loan from ${this.nickname(db, after.borrowerId, a.lenderId)}`);
        this.post(db, a.lenderId, -a.principal, `FamilyShield loan to ${this.nickname(db, a.lenderId, after.borrowerId)}`);
      }
    }
    for (const inst of after.schedule) {
      if (inst.paidAt && !before.schedule[inst.index]?.paidAt) {
        this.post(db, after.borrowerId, -inst.amount, `FamilyShield payment ${inst.index + 1} of ${after.schedule.length}`);
        for (const part of inst.parts) {
          if (part.to !== 'fee') this.post(db, part.to, part.amount, `FamilyShield repayment from ${this.nickname(db, part.to, after.borrowerId)}`);
        }
      }
    }
  }

  /** Apply one transition to one loan, settle money, and persist. */
  private apply(db: Database, loanId: string, fn: (loan: LoanCase) => LoanCase): LoanCase {
    const before = this.loan(db, loanId);
    const after = fn(before);
    db.loans = db.loans.map((l) => (l.id === loanId ? after : l));
    this.settle(db, before, after);
    return after;
  }

  private mutate(loanId: string, fn: (loan: LoanCase, db: Database) => LoanCase, check?: (loan: LoanCase) => void): LoanCase {
    const db = this.open();
    if (check) check(this.loan(db, loanId));
    const after = this.apply(db, loanId, (l) => fn(l, db));
    this.automate(db);
    this.storage.write(writeActivity(db));
    return db.loans.find((l) => l.id === after.id)!;
  }

  /** Scripted relatives from auto_replies.csv. Returns true if anything changed. */
  private automate(db: Database): boolean {
    const now = this.now().getTime();
    const at = this.iso();
    let changed = false;
    for (const loan of [...db.loans]) {
      const current = () => this.loan(db, loan.id);
      for (const auto of db.autoReplies) {
        let l = current();
        const offer = l.offers.find((o) => o.memberId === auto.memberId);
        if (l.status === 'collecting' && offer?.status === 'pending' && Date.parse(l.createdAt) + auto.replyAfterSeconds * 1000 <= now) {
          const amount = Math.floor(Math.min(auto.offerAmount || l.amount, l.amount) / 100) * 100;
          this.apply(db, l.id, (x) =>
            respondToRequest(x, auto.memberId, auto.reply === 'offer' && amount >= 100 ? { kind: 'offer', amount, note: auto.note } : { kind: 'decline', note: auto.note }, at),
          );
          changed = true;
          l = current();
        }
        const agreement = l.agreements.find((a) => a.lenderId === auto.memberId);
        if (
          auto.autoSign &&
          l.status === 'signing' &&
          agreement &&
          !agreement.lenderSignedAt &&
          agreement.borrowerSignedAt &&
          Date.parse(agreement.borrowerSignedAt) + this.autoSignDelayMs <= now
        ) {
          this.apply(db, l.id, (x) => signAsLender(x, auto.memberId, at, db.rules));
          changed = true;
          l = current();
        }
        if (
          auto.autoApprovePause &&
          l.pause?.status === 'pending' &&
          l.pause.approvals[auto.memberId] === null &&
          Date.parse(l.pause.requestedAt) + this.autoPauseDelayMs <= now
        ) {
          this.apply(db, l.id, (x) => respondToPause(x, auto.memberId, true));
          changed = true;
        }
      }
    }
    return changed;
  }

  // ------------------------------------------------------------ host / mockup

  /** Apply due scripted actions. Hosts call this on a short interval. */
  tick(): boolean {
    const db = readDatabase(this.storage.read());
    const changed = this.automate(db);
    if (changed) this.storage.write(writeActivity(db));
    return changed;
  }

  /** Back to the shared starting state (setup tables are untouched). */
  reset(): void {
    if (this.storage.reset) this.storage.reset();
    else this.storage.write(emptyActivity());
  }

  people(): MockupPerson[] {
    return this.open().people.map(({ id, firstName, lastName, accountLabel }) => ({ id, firstName, lastName, accountLabel }));
  }

  account(userId: string): AccountSummary {
    const db = this.open();
    const person = this.user(db, userId);
    const mine = db.transactions.filter((t) => t.userId === userId);
    return {
      balance: person.openingBalance + mine.reduce((s, t) => s + t.amount, 0),
      transactions: mine.map(({ id, at, amount, memo }) => ({ id, at, amount, memo })).reverse(),
      exampleTransactions: db.exampleTransactions.map((t) => ({ ...t })),
    };
  }

  // ------------------------------------------------------------ reads

  config(): AppConfig {
    const db = this.open();
    return { rules: db.rules, reasons: db.reasons, rewards: db.rewards };
  }

  profile(userId: string): Profile {
    const db = this.open();
    const me = this.user(db, userId);
    const toPerson = (id: string): Person => {
      const p = db.people.find((x) => x.id === id)!;
      const nickname = db.circles.find((c) => c.ownerId === userId && c.memberId === id)?.nickname;
      return { id: p.id, firstName: p.firstName, lastName: p.lastName, ...(nickname ? { nickname } : {}) };
    };
    const circleIds = db.circles.filter((c) => c.ownerId === userId).map((c) => c.memberId);
    const askedBy = db.loans.filter((l) => l.offers.some((o) => o.memberId === userId)).map((l) => l.borrowerId);
    // Everyone asked on my own requests, so a lender I later remove from my circle
    // still shows by name on my offers, agreements and repayments.
    const myLenders = db.loans.filter((l) => l.borrowerId === userId).flatMap((l) => l.offers.map((o) => o.memberId));
    const visible = [...new Set([...circleIds, ...askedBy, ...myLenders])].filter((id) => id !== userId && db.people.some((p) => p.id === id));
    return {
      me: { id: me.id, firstName: me.firstName, lastName: me.lastName },
      circle: circleIds.filter((id) => db.people.some((p) => p.id === id)).map(toPerson),
      people: visible.map(toPerson),
      account: { id: `acct-${me.id}`, label: me.accountLabel },
    };
  }

  myLoan(userId: string): LoanCase | null {
    const db = this.open();
    this.user(db, userId);
    const mine = db.loans.filter((l) => l.borrowerId === userId && l.status !== 'cancelled');
    return mine.at(-1) ?? null;
  }

  incoming(userId: string): LoanCase[] {
    const db = this.open();
    this.user(db, userId);
    return db.loans
      .filter((l) => l.status !== 'cancelled' && l.borrowerId !== userId && l.offers.some((o) => o.memberId === userId))
      .map((l) => redactForLender(l, userId))
      .reverse();
  }

  // ------------------------------------------------------------ borrower

  createRequest(userId: string, input: CreateRequestInput): LoanCase {
    const db = this.open();
    this.user(db, userId);
    if (db.loans.some((l) => l.borrowerId === userId && isOpen(l))) {
      throw new FamilyShieldError('INVALID_STATE', 'You already have an open request or loan.');
    }
    const loan = createLoanCase(
      {
        id: this.id('loan'),
        borrowerId: userId,
        circle: db.circles.filter((c) => c.ownerId === userId).map((c) => c.memberId),
        reason: input.reason,
        purpose: input.purpose,
        amount: input.amount,
        months: input.months,
        now: this.iso(),
      },
      db.rules,
    );
    db.loans.push(loan);
    this.storage.write(writeActivity(db));
    return loan;
  }

  private asBorrower(userId: string) {
    return (loan: LoanCase) => {
      if (loan.borrowerId !== userId) throw new FamilyShieldError('FORBIDDEN', 'This isn’t your request.');
    };
  }

  private asLender(userId: string) {
    return (loan: LoanCase) => {
      if (!loan.offers.some((o) => o.memberId === userId)) throw new FamilyShieldError('FORBIDDEN', 'You weren’t asked on this request.');
    };
  }

  cancelRequest(userId: string, loanId: string) {
    return this.mutate(loanId, cancelRequest, this.asBorrower(userId));
  }
  setOfferAccepted(userId: string, loanId: string, memberId: string, accepted: boolean) {
    return this.mutate(loanId, (l) => setOfferAccepted(l, memberId, accepted), this.asBorrower(userId));
  }
  signAsBorrower(userId: string, loanId: string) {
    return this.mutate(loanId, (l, db) => signAsBorrower(l, this.iso(), db.rules), this.asBorrower(userId));
  }
  makePayment(userId: string, loanId: string) {
    return this.mutate(loanId, (l, db) => recordPayment(l, this.iso(), db.rules), this.asBorrower(userId));
  }
  requestPause(userId: string, loanId: string) {
    return this.mutate(loanId, (l, db) => requestPause(l, this.iso(), db.rules), this.asBorrower(userId));
  }
  cancelPause(userId: string, loanId: string) {
    return this.mutate(loanId, cancelPause, this.asBorrower(userId));
  }
  claimReward(userId: string, loanId: string, rewardId: string) {
    return this.mutate(
      loanId,
      (l, db) => {
        const reward = getReward(rewardId, db.rewards);
        const code = `FS-${reward.partner.split(/\s/)[0]!.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Math.floor(1000 + this.random() * 9000)}`;
        return claimReward(l, rewardId, code, this.iso(), db.rewards);
      },
      this.asBorrower(userId),
    );
  }

  // ------------------------------------------------------------ lender

  respond(userId: string, loanId: string, response: LenderResponse) {
    return redactForLender(this.mutate(loanId, (l) => respondToRequest(l, userId, response, this.iso()), this.asLender(userId)), userId);
  }
  signAsLender(userId: string, loanId: string) {
    return redactForLender(this.mutate(loanId, (l, db) => signAsLender(l, userId, this.iso(), db.rules), this.asLender(userId)), userId);
  }
  respondToPause(userId: string, loanId: string, approve: boolean) {
    return redactForLender(this.mutate(loanId, (l) => respondToPause(l, userId, approve), this.asLender(userId)), userId);
  }

  // ------------------------------------------------------------ trusted circle
  //
  // Each person manages their own circle (circles.csv). Every call returns the
  // caller's circle as it now stands, in the same shape as Profile.circle.
  // A new request goes to whoever is in the circle when it is created, so
  // adding someone doesn't add them to a request that is already open.

  private circleOf(db: Database, userId: string): Person[] {
    return db.circles
      .filter((c) => c.ownerId === userId)
      .flatMap((c) => {
        const p = db.people.find((x) => x.id === c.memberId);
        return p ? [{ id: p.id, firstName: p.firstName, lastName: p.lastName, ...(c.nickname ? { nickname: c.nickname } : {}) }] : [];
      });
  }

  private cleanNickname(nickname: unknown): string | undefined {
    if (nickname === undefined || nickname === null) return undefined;
    if (typeof nickname !== 'string') throw new FamilyShieldError('INVALID_INPUT', 'A nickname must be text.');
    const clean = nickname.replace(/\s+/g, ' ').trim();
    if (clean.length > MAX_NICKNAME) throw new FamilyShieldError('INVALID_INPUT', `Keep nicknames to ${MAX_NICKNAME} characters or fewer.`);
    return clean || undefined;
  }

  private inCircle(db: Database, userId: string, memberId: string) {
    const row = db.circles.find((c) => c.ownerId === userId && c.memberId === memberId);
    if (!row) throw new FamilyShieldError('NOT_FOUND', 'That person isn’t in your circle.');
    return row;
  }

  circle(userId: string): Person[] {
    const db = this.open();
    this.user(db, userId);
    return this.circleOf(db, userId);
  }

  /**
   * Add someone to the caller's circle by person id. Used by tests and back-office
   * tooling; the app adds by email or phone (addCircleMemberByContact).
   */
  addCircleMember(userId: string, memberId: string, nickname?: string): Person[] {
    const db = this.open();
    this.user(db, userId);
    if (!db.people.some((p) => p.id === memberId)) throw new FamilyShieldError('NOT_FOUND', 'We couldn’t find that person.');
    this.pushCircleMember(db, userId, memberId, nickname);
    this.storage.write(writeActivity(db));
    return this.circleOf(db, userId);
  }

  /**
   * Add someone to the caller's circle by the email or phone they bank with.
   * If nobody has that email or phone yet, a FamilyShield account is created
   * for it (saved in new_people.csv), named `name` if given.
   *
   * Short-term behavior. Later: send them an invitation link to register, and
   * eventually only add them once they verify the bank account behind it.
   */
  addCircleMemberByContact(userId: string, contactText: string, opts: { nickname?: string; name?: string } = {}): Person[] {
    const db = this.open();
    this.user(db, userId);
    if (typeof contactText !== 'string' || !contactText.trim()) {
      throw new FamilyShieldError('INVALID_INPUT', 'Enter their email or phone number.');
    }
    const contact = parseContact(contactText);
    if (!contact) {
      throw new FamilyShieldError('INVALID_INPUT', 'That doesn’t look like an email or a US phone number. Try grace.chen@example.com or (607) 555-0102.');
    }
    const nickname = this.cleanNickname(opts.nickname);
    let person = db.people.find((p) => (contact.kind === 'email' ? p.email : p.phone) === contact.value);
    if (!person) {
      const { firstName, lastName } = this.cleanName(opts.name, contact);
      person = {
        id: this.id('person'),
        firstName,
        lastName,
        accountLabel: 'New FamilyShield account',
        openingBalance: 0,
        ...(contact.kind === 'email' ? { email: contact.value } : { phone: contact.value }),
        createdBy: userId,
        createdAt: this.iso(),
      };
      db.people.push(person);
    }
    this.pushCircleMember(db, userId, person.id, nickname);
    this.storage.write(writeActivity(db));
    return this.circleOf(db, userId);
  }

  private pushCircleMember(db: Database, userId: string, memberId: string, nickname: unknown) {
    if (memberId === userId) throw new FamilyShieldError('INVALID_INPUT', 'You can’t add yourself to your own circle.');
    if (db.circles.some((c) => c.ownerId === userId && c.memberId === memberId)) {
      throw new FamilyShieldError('INVALID_INPUT', 'They’re already in your circle.');
    }
    db.circles.push({ ownerId: userId, memberId, nickname: this.cleanNickname(nickname) });
  }

  /** "Lisa Park" → first and last name; with no name, the email's local part or the phone number. */
  private cleanName(name: unknown, contact: Contact): { firstName: string; lastName: string } {
    if (name !== undefined && name !== null && typeof name !== 'string') throw new FamilyShieldError('INVALID_INPUT', 'A name must be text.');
    const clean = (name ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length > MAX_NAME) throw new FamilyShieldError('INVALID_INPUT', `Keep names to ${MAX_NAME} characters or fewer.`);
    if (clean) {
      const [first, ...rest] = clean.split(' ');
      return { firstName: first!, lastName: rest.join(' ') };
    }
    return { firstName: contact.kind === 'email' ? contact.value.split('@')[0]! : formatPhone(contact.value), lastName: '' };
  }

  /** Change how the caller refers to a circle member. A blank nickname clears it. */
  renameCircleMember(userId: string, memberId: string, nickname: string): Person[] {
    const db = this.open();
    this.user(db, userId);
    const row = this.inCircle(db, userId, memberId);
    row.nickname = this.cleanNickname(nickname);
    this.storage.write(writeActivity(db));
    return this.circleOf(db, userId);
  }

  /**
   * Take someone out of the caller's circle. Future requests won't go to them.
   * On the caller's request that is still collecting offers, their offer is
   * withdrawn (see withdrawMember); signed and active loans are not affected.
   */
  removeCircleMember(userId: string, memberId: string): Person[] {
    const db = this.open();
    this.user(db, userId);
    this.inCircle(db, userId, memberId);
    db.circles = db.circles.filter((c) => !(c.ownerId === userId && c.memberId === memberId));
    db.loans = db.loans.map((l) => (l.borrowerId === userId ? withdrawMember(l, memberId) : l));
    this.storage.write(writeActivity(db));
    return this.circleOf(db, userId);
  }
}

/** Longest nickname a person can give a circle member. */
export const MAX_NICKNAME = 40;
/** Longest name for an account created when adding by email or phone. */
export const MAX_NAME = 60;
