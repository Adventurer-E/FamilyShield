import { DEFAULT_REASONS, DEFAULT_RULES } from '@familyshield/core';
import { normalizeEmail, normalizePhone } from './contact';
import type {
  Agreement,
  Cents,
  Installment,
  LoanCase,
  LoanStatus,
  Offer,
  OfferStatus,
  PauseStatus,
  PointsEntry,
  Reason,
  ReasonOption,
  Reward,
  Rules,
} from '@familyshield/core';
import { CsvDataError, readTable, writeTable } from './csv';
import type { CsvRecord } from './csv';

/**
 * The "fake database": one CSV file per table, in data/.
 *
 * SETUP tables are written by people (edit them in a spreadsheet or text
 * editor). The app only reads them.
 * ACTIVITY tables are written by the app as people use it, and can also be
 * edited by hand. Trusted circles are activity: data/circles.csv is the
 * starting state, and people add, rename and remove members from the app.
 * Money is in dollars ("157.50"); yes/no columns accept yes/no, true/false
 * or 1/0; times are ISO 8601.
 */

export type CsvFiles = Record<string, string>;

export interface PersonRow {
  id: string;
  firstName: string;
  lastName: string;
  accountLabel: string;
  openingBalance: Cents;
  /** Lowercased email the person banks with, if known. Used to add them to a circle. */
  email?: string;
  /** Phone number as digits only, if known. Used to add them to a circle. */
  phone?: string;
  /**
   * Set for accounts the app created when someone added an email or phone
   * nobody had yet (stored in new_people.csv). Absent for people.csv rows.
   */
  createdBy?: string;
  createdAt?: string;
}

export interface CircleRow {
  ownerId: string;
  memberId: string;
  nickname?: string;
}

export interface AutoReplyRow {
  memberId: string;
  replyAfterSeconds: number;
  reply: 'offer' | 'decline';
  /** Capped at the requested amount. */
  offerAmount: Cents;
  note?: string;
  autoSign: boolean;
  autoApprovePause: boolean;
}

export interface Transaction {
  id: string;
  userId: string;
  at: string;
  /** Positive = money in, negative = money out. */
  amount: Cents;
  memo: string;
}

/** Everyday bank activity shown on the bank home, for realism only. */
export interface ExampleTransaction {
  id: string;
  date: string;
  name: string;
  category: string;
  /** Positive = money in, negative = money out. Not counted in any balance. */
  amount: Cents;
}

export interface Database {
  rules: Rules;
  people: PersonRow[];
  circles: CircleRow[];
  reasons: ReasonOption[];
  rewards: Reward[];
  exampleTransactions: ExampleTransaction[];
  autoReplies: AutoReplyRow[];
  loans: LoanCase[];
  transactions: Transaction[];
  /**
   * Functional mockup only: how many days the mockup's calendar runs ahead of
   * the real date ("Skip ahead" in the toolbar), so late payments can be shown.
   */
  clockDaysAhead: number;
}

// ---------------------------------------------------------------- schema

export const SETUP_TABLES = {
  'settings.csv': ['key', 'value', 'description'],
  'people.csv': ['id', 'first_name', 'last_name', 'account_label', 'opening_balance', 'email', 'phone'],
  'reasons.csv': ['id', 'label', 'template'],
  'rewards.csv': ['id', 'name', 'short_label', 'points_needed', 'category', 'partner', 'headline', 'detail', 'terms', 'valid_for_months'],
  'auto_replies.csv': ['member_id', 'reply_after_seconds', 'reply', 'offer_amount', 'note', 'auto_sign', 'auto_approve_pause'],
  'example_transactions.csv': ['id', 'date', 'name', 'category', 'amount'],
} as const;

export const ACTIVITY_TABLES = {
  // Trusted circles start from data/circles.csv; people manage their own from the app.
  'circles.csv': ['owner_id', 'member_id', 'nickname'],
  // Accounts created when someone adds an email or phone that nobody in people.csv has.
  'new_people.csv': ['id', 'first_name', 'last_name', 'email', 'phone', 'created_by', 'created_at'],
  'loans.csv': ['id', 'borrower_id', 'reason', 'purpose', 'amount', 'months', 'status', 'created_at', 'funded_at', 'repaid_at', 'points', 'pauses_used'],
  'offers.csv': ['loan_id', 'member_id', 'status', 'amount', 'accepted', 'note', 'responded_at'],
  'agreements.csv': ['loan_id', 'lender_id', 'principal', 'interest_rate_percent', 'fee', 'total', 'borrower_signed_at', 'lender_signed_at'],
  'installments.csv': ['loan_id', 'number', 'due_date', 'amount', 'paid_at', 'on_time'],
  'installment_splits.csv': ['loan_id', 'number', 'pays_to', 'amount'],
  'points_log.csv': ['loan_id', 'at', 'points', 'reason', 'label'],
  'pauses.csv': ['loan_id', 'status', 'requested_at'],
  'pause_answers.csv': ['loan_id', 'lender_id', 'answer'],
  'claimed_rewards.csv': ['loan_id', 'reward_id', 'code'],
  'transactions.csv': ['id', 'user_id', 'at', 'amount', 'memo'],
  // Functional mockup only: days the mockup's calendar runs ahead of today. Blank or no row = 0.
  'mockup_clock.csv': ['days_ahead'],
} as const;

export type ActivityFile = keyof typeof ACTIVITY_TABLES;
export const ACTIVITY_FILES = Object.keys(ACTIVITY_TABLES) as ActivityFile[];
export const SETUP_FILES = Object.keys(SETUP_TABLES) as Array<keyof typeof SETUP_TABLES>;

/** Header-only activity files: an empty database, used by "reset". */
export function emptyActivity(): CsvFiles {
  return Object.fromEntries(ACTIVITY_FILES.map((f) => [f, writeTable([...ACTIVITY_TABLES[f]], [])]));
}

// ---------------------------------------------------------------- cell parsing

function fail(r: CsvRecord, column: string, problem: string): never {
  throw new CsvDataError(`${r.file}, line ${r.line}, column "${column}": ${problem}`);
}

function req(r: CsvRecord, column: string): string {
  const v = r.get(column);
  if (!v) fail(r, column, 'is empty');
  return v;
}

function opt(r: CsvRecord, column: string): string | undefined {
  return r.get(column) || undefined;
}

function num(r: CsvRecord, column: string, fallback?: number): number {
  const raw = r.get(column);
  if (!raw && fallback !== undefined) return fallback;
  const n = Number(raw.replace(/[,\s]/g, ''));
  if (!raw || !Number.isFinite(n)) fail(r, column, `"${raw}" is not a number`);
  return n;
}

function int(r: CsvRecord, column: string, fallback?: number): number {
  const n = num(r, column, fallback);
  if (!Number.isInteger(n)) fail(r, column, `"${r.get(column)}" must be a whole number`);
  return n;
}

/** "$4,328.50", "4328.5" or "-157.50" → cents. */
function money(r: CsvRecord, column: string, fallback?: Cents): Cents {
  const raw = r.get(column);
  if (!raw && fallback !== undefined) return fallback;
  const n = Number(raw.replace(/[$,\s]/g, ''));
  if (!raw || !Number.isFinite(n)) fail(r, column, `"${raw}" is not an amount in dollars`);
  return Math.round(n * 100);
}

function bool(r: CsvRecord, column: string, fallback: boolean): boolean {
  const raw = r.get(column).toLowerCase();
  if (!raw) return fallback;
  if (['yes', 'y', 'true', '1'].includes(raw)) return true;
  if (['no', 'n', 'false', '0'].includes(raw)) return false;
  fail(r, column, `"${r.get(column)}" should be yes or no`);
}

/** yes / no / blank (= not answered) */
function answer(r: CsvRecord, column: string): boolean | null {
  return r.get(column) === '' ? null : bool(r, column, false);
}

function oneOf<T extends string>(r: CsvRecord, column: string, allowed: readonly T[]): T {
  const v = req(r, column).toLowerCase() as T;
  if (!allowed.includes(v)) fail(r, column, `"${r.get(column)}" should be one of: ${allowed.join(', ')}`);
  return v;
}

const fmtMoney = (c: Cents) => (c / 100).toFixed(2);
const fmtBool = (b: boolean) => (b ? 'yes' : 'no');

// ---------------------------------------------------------------- setup tables

function readRules(files: CsvFiles): Rules {
  const rules: Rules = structuredClone(DEFAULT_RULES);
  for (const r of readTable('settings.csv', files['settings.csv'], ['key', 'value'])) {
    const key = r.get('key').toLowerCase();
    switch (key) {
      case 'fee_rate_percent':
        rules.feeRate = num(r, 'value') / 100;
        break;
      case 'min_request':
        rules.amountMin = money(r, 'value');
        break;
      case 'max_request':
        rules.amountMax = money(r, 'value');
        break;
      case 'request_step':
        rules.amountStep = money(r, 'value');
        break;
      case 'terms_months':
        rules.terms = r
          .get('value')
          .split(/[|;/\s]+/)
          .filter(Boolean)
          .map((t) => {
            const n = Number(t);
            if (!Number.isInteger(n) || n <= 0) fail(r, 'value', `"${t}" is not a number of months`);
            return n;
          });
        if (rules.terms.length === 0) fail(r, 'value', 'list at least one term, e.g. 6|10|12');
        break;
      case 'default_request':
        rules.defaultAmount = money(r, 'value');
        break;
      case 'default_term_months':
        rules.defaultTerm = int(r, 'value');
        break;
      case 'lender_offer_amounts':
        rules.offerAmounts = r
          .get('value')
          .split(/[|;/\s]+/)
          .filter(Boolean)
          .map((t) => {
            const n = Number(t.replace(/[$,]/g, ''));
            if (!Number.isFinite(n) || n <= 0) fail(r, 'value', `"${t}" is not an amount in dollars`);
            return Math.round(n * 100);
          });
        if (rules.offerAmounts.length === 0) fail(r, 'value', 'list at least one amount, e.g. 250|500|1000');
        break;
      case 'max_pauses':
        rules.maxPauses = int(r, 'value');
        break;
      case 'overdue_grace_days':
        rules.overdueGraceDays = int(r, 'value');
        break;
      case 'points_per_helper':
        rules.points.help = int(r, 'value');
        break;
      case 'points_per_on_time_payment':
        rules.points.onTime = int(r, 'value');
        break;
      case 'points_on_full_repayment':
        rules.points.complete = int(r, 'value');
        break;
      case '':
        break;
      default:
        fail(r, 'key', `unknown setting "${r.get('key')}"`);
    }
  }
  if (rules.amountMin > rules.amountMax) throw new CsvDataError('settings.csv: min_request is larger than max_request.');
  if (rules.amountStep <= 0) throw new CsvDataError('settings.csv: request_step must be more than 0.');
  if (rules.feeRate < 0) throw new CsvDataError('settings.csv: fee_rate_percent can’t be negative.');
  if (rules.defaultAmount < rules.amountMin || rules.defaultAmount > rules.amountMax)
    throw new CsvDataError('settings.csv: default_request must be between min_request and max_request.');
  if (!rules.terms.includes(rules.defaultTerm))
    throw new CsvDataError('settings.csv: default_term_months must be one of terms_months.');
  if (rules.overdueGraceDays < 0) throw new CsvDataError('settings.csv: overdue_grace_days can’t be negative.');
  return rules;
}

function contactCells(r: CsvRecord): { email?: string; phone?: string } {
  const rawEmail = r.get('email');
  const rawPhone = r.get('phone');
  const email = rawEmail ? normalizeEmail(rawEmail) : undefined;
  const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
  if (rawEmail && !email) fail(r, 'email', `"${rawEmail}" isn’t an email address`);
  if (rawPhone && !phone) fail(r, 'phone', `"${rawPhone}" isn’t a phone number`);
  return { ...(email ? { email } : {}), ...(phone ? { phone } : {}) };
}

function readPeople(files: CsvFiles): PersonRow[] {
  const setup = readTable('people.csv', files['people.csv'], ['id', 'first_name']).map(
    (r): PersonRow => ({
      id: req(r, 'id'),
      firstName: req(r, 'first_name'),
      lastName: r.get('last_name'),
      accountLabel: r.get('account_label') || 'Checking',
      openingBalance: money(r, 'opening_balance', 0),
      ...contactCells(r),
    }),
  );
  const created = readTable('new_people.csv', files['new_people.csv'], ['id', 'first_name']).map(
    (r): PersonRow => ({
      id: req(r, 'id'),
      firstName: req(r, 'first_name'),
      lastName: r.get('last_name'),
      accountLabel: 'New FamilyShield account',
      openingBalance: 0,
      ...contactCells(r),
      createdBy: req(r, 'created_by'),
      createdAt: req(r, 'created_at'),
    }),
  );
  const people = [...setup, ...created];
  const ids = new Set<string>();
  const emails = new Map<string, string>();
  const phones = new Map<string, string>();
  for (const p of people) {
    if (ids.has(p.id)) throw new CsvDataError(`people.csv / new_people.csv: the id "${p.id}" appears twice.`);
    ids.add(p.id);
    if (p.email) {
      if (emails.has(p.email)) throw new CsvDataError(`people.csv / new_people.csv: "${p.id}" and "${emails.get(p.email)}" have the same email.`);
      emails.set(p.email, p.id);
    }
    if (p.phone) {
      if (phones.has(p.phone)) throw new CsvDataError(`people.csv / new_people.csv: "${p.id}" and "${phones.get(p.phone)}" have the same phone.`);
      phones.set(p.phone, p.id);
    }
  }
  for (const p of created) {
    if (!ids.has(p.createdBy!)) throw new CsvDataError(`new_people.csv: created_by "${p.createdBy}" for "${p.id}" isn’t a known person.`);
    if (!p.email && !p.phone) throw new CsvDataError(`new_people.csv: "${p.id}" needs an email or a phone.`);
  }
  return people;
}

function readCircles(files: CsvFiles, people: PersonRow[]): CircleRow[] {
  const known = new Set(people.map((p) => p.id));
  const seen = new Set<string>();
  return readTable('circles.csv', files['circles.csv'], ['owner_id', 'member_id']).map((r) => {
    const ownerId = req(r, 'owner_id');
    const memberId = req(r, 'member_id');
    if (!known.has(ownerId)) fail(r, 'owner_id', `"${ownerId}" isn’t in people.csv`);
    if (!known.has(memberId)) fail(r, 'member_id', `"${memberId}" isn’t in people.csv`);
    if (memberId === ownerId) fail(r, 'member_id', `"${memberId}" can’t be in their own circle`);
    const pair = `${ownerId}\u0000${memberId}`;
    if (seen.has(pair)) fail(r, 'member_id', `"${memberId}" is already in ${ownerId}’s circle on an earlier line`);
    seen.add(pair);
    return { ownerId, memberId, nickname: opt(r, 'nickname') };
  });
}

const REASONS = ['car', 'medical', 'job', 'other'] as const satisfies readonly Reason[];

function readReasons(files: CsvFiles): ReasonOption[] {
  if (files['reasons.csv'] === undefined) return DEFAULT_REASONS.map((r) => ({ ...r }));
  const reasons = readTable('reasons.csv', files['reasons.csv'], ['id', 'label', 'template']).map((r) => ({
    id: oneOf(r, 'id', REASONS),
    label: req(r, 'label'),
    template: r.get('template'),
  }));
  if (reasons.length === 0) throw new CsvDataError('reasons.csv: list at least one reason.');
  const ids = new Set<string>();
  for (const r of reasons) {
    if (ids.has(r.id)) throw new CsvDataError(`reasons.csv: the id "${r.id}" appears twice.`);
    ids.add(r.id);
  }
  return reasons;
}

function readExampleTransactions(files: CsvFiles): ExampleTransaction[] {
  return readTable('example_transactions.csv', files['example_transactions.csv'], ['id', 'date', 'name', 'amount']).map((r) => {
    const date = req(r, 'date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(r, 'date', `"${date}" should be a date like 2026-10-30`);
    return {
      id: req(r, 'id'),
      date,
      name: req(r, 'name'),
      category: r.get('category'),
      amount: money(r, 'amount'),
    };
  });
}

function readRewards(files: CsvFiles): Reward[] {
  return readTable('rewards.csv', files['rewards.csv'], ['id', 'name', 'points_needed']).map((r) => ({
    id: req(r, 'id'),
    name: req(r, 'name'),
    shortLabel: r.get('short_label') || req(r, 'name').slice(0, 4).toUpperCase(),
    threshold: int(r, 'points_needed'),
    category: r.get('category'),
    partner: r.get('partner') || 'Partner',
    headline: r.get('headline') || req(r, 'name'),
    detail: r.get('detail'),
    terms: r.get('terms'),
    validForMonths: int(r, 'valid_for_months', 3),
  }));
}

function readAutoReplies(files: CsvFiles): AutoReplyRow[] {
  return readTable('auto_replies.csv', files['auto_replies.csv'], ['member_id', 'reply']).map((r) => ({
    memberId: req(r, 'member_id'),
    replyAfterSeconds: num(r, 'reply_after_seconds', 3),
    reply: oneOf(r, 'reply', ['offer', 'decline'] as const),
    offerAmount: money(r, 'offer_amount', 0),
    note: opt(r, 'note'),
    autoSign: bool(r, 'auto_sign', true),
    autoApprovePause: bool(r, 'auto_approve_pause', true),
  }));
}

// ---------------------------------------------------------------- activity tables

const LOAN_STATUSES = ['collecting', 'signing', 'active', 'repaid', 'cancelled'] as const satisfies readonly LoanStatus[];
const OFFER_STATUSES = ['pending', 'offered', 'declined', 'expired'] as const satisfies readonly OfferStatus[];
const PAUSE_STATUSES = ['pending', 'approved', 'declined'] as const satisfies readonly PauseStatus[];
const POINT_REASONS = ['help', 'on-time', 'complete'] as const satisfies readonly PointsEntry['reason'][];

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

function readLoans(files: CsvFiles): LoanCase[] {
  const t = (f: ActivityFile) => readTable(f, files[f]);
  const offers = groupBy(t('offers.csv'), (r) => r.get('loan_id'));
  const agreements = groupBy(t('agreements.csv'), (r) => r.get('loan_id'));
  const installments = groupBy(t('installments.csv'), (r) => r.get('loan_id'));
  const splits = groupBy(t('installment_splits.csv'), (r) => `${r.get('loan_id')}#${r.get('number')}`);
  const points = groupBy(t('points_log.csv'), (r) => r.get('loan_id'));
  const pauses = groupBy(t('pauses.csv'), (r) => r.get('loan_id'));
  const answers = groupBy(t('pause_answers.csv'), (r) => r.get('loan_id'));
  const claims = groupBy(t('claimed_rewards.csv'), (r) => r.get('loan_id'));

  return t('loans.csv').map((r): LoanCase => {
    const id = req(r, 'id');
    const pauseRow = pauses.get(id)?.at(-1);
    return {
      id,
      borrowerId: req(r, 'borrower_id'),
      reason: oneOf(r, 'reason', REASONS),
      purpose: r.get('purpose'),
      amount: money(r, 'amount'),
      months: int(r, 'months'),
      status: oneOf(r, 'status', LOAN_STATUSES),
      createdAt: req(r, 'created_at'),
      fundedAt: opt(r, 'funded_at'),
      repaidAt: opt(r, 'repaid_at'),
      points: int(r, 'points', 0),
      pausesUsed: int(r, 'pauses_used', 0),
      offers: (offers.get(id) ?? []).map(
        (o): Offer => ({
          memberId: req(o, 'member_id'),
          status: oneOf(o, 'status', OFFER_STATUSES),
          amount: money(o, 'amount', 0),
          accepted: bool(o, 'accepted', false),
          note: opt(o, 'note'),
          respondedAt: opt(o, 'responded_at'),
        }),
      ),
      agreements: (agreements.get(id) ?? []).map((a): Agreement => {
        const principal = money(a, 'principal');
        const fee = money(a, 'fee', 0);
        return {
          lenderId: req(a, 'lender_id'),
          principal,
          interestRate: num(a, 'interest_rate_percent', 0),
          fee,
          total: principal + fee, // always derived, so a hand edit can't make it disagree
          borrowerSignedAt: opt(a, 'borrower_signed_at'),
          lenderSignedAt: opt(a, 'lender_signed_at'),
        };
      }),
      schedule: (installments.get(id) ?? [])
        .map((i): Installment => {
          const number = int(i, 'number');
          const parts = (splits.get(`${id}#${number}`) ?? []).map((s) => ({
            to: req(s, 'pays_to'),
            amount: money(s, 'amount'),
          }));
          return {
            index: number - 1,
            dueDate: req(i, 'due_date'),
            // The splits are the source of truth; the amount column is a convenience.
            amount: parts.length ? parts.reduce((sum, p) => sum + p.amount, 0) : money(i, 'amount'),
            parts,
            paidAt: opt(i, 'paid_at'),
            onTime: i.get('on_time') ? bool(i, 'on_time', false) : undefined,
          };
        })
        .sort((a, b) => a.index - b.index),
      pointsLog: (points.get(id) ?? []).map((p) => ({
        at: req(p, 'at'),
        points: int(p, 'points'),
        reason: oneOf(p, 'reason', POINT_REASONS),
        label: p.get('label'),
      })),
      pause: pauseRow
        ? {
            status: oneOf(pauseRow, 'status', PAUSE_STATUSES),
            requestedAt: req(pauseRow, 'requested_at'),
            approvals: Object.fromEntries((answers.get(id) ?? []).map((a) => [req(a, 'lender_id'), answer(a, 'answer')])),
          }
        : null,
      claimedRewards: Object.fromEntries((claims.get(id) ?? []).map((c) => [req(c, 'reward_id'), req(c, 'code')])),
    };
  });
}

function readClock(files: CsvFiles): number {
  const row = readTable('mockup_clock.csv', files['mockup_clock.csv']).at(-1);
  if (!row || !row.get('days_ahead')) return 0;
  const days = int(row, 'days_ahead');
  if (days < 0) fail(row, 'days_ahead', 'can’t be negative');
  return days;
}

function readTransactions(files: CsvFiles): Transaction[] {
  return readTable('transactions.csv', files['transactions.csv']).map((r) => ({
    id: req(r, 'id'),
    userId: req(r, 'user_id'),
    at: req(r, 'at'),
    amount: money(r, 'amount'),
    memo: r.get('memo'),
  }));
}

// ---------------------------------------------------------------- public

export function readDatabase(files: CsvFiles): Database {
  const people = readPeople(files);
  return {
    rules: readRules(files),
    people,
    circles: readCircles(files, people),
    reasons: readReasons(files),
    rewards: readRewards(files),
    exampleTransactions: readExampleTransactions(files),
    autoReplies: readAutoReplies(files),
    loans: readLoans(files),
    transactions: readTransactions(files),
    clockDaysAhead: readClock(files),
  };
}

/** Serialize the activity tables. Setup tables are never rewritten by the app. */
export function writeActivity(db: Database): Record<ActivityFile, string> {
  const rows = Object.fromEntries(ACTIVITY_FILES.map((f) => [f, []])) as unknown as Record<ActivityFile, Array<Record<string, string>>>;
  const o = (v: string | undefined) => v ?? '';

  for (const p of db.people) {
    if (!p.createdBy) continue;
    rows['new_people.csv'].push({
      id: p.id,
      first_name: p.firstName,
      last_name: p.lastName,
      email: o(p.email),
      phone: o(p.phone),
      created_by: p.createdBy,
      created_at: o(p.createdAt),
    });
  }
  for (const c of db.circles) {
    rows['circles.csv'].push({ owner_id: c.ownerId, member_id: c.memberId, nickname: o(c.nickname) });
  }
  for (const l of db.loans) {
    rows['loans.csv'].push({
      id: l.id,
      borrower_id: l.borrowerId,
      reason: l.reason,
      purpose: l.purpose,
      amount: fmtMoney(l.amount),
      months: String(l.months),
      status: l.status,
      created_at: l.createdAt,
      funded_at: o(l.fundedAt),
      repaid_at: o(l.repaidAt),
      points: String(l.points),
      pauses_used: String(l.pausesUsed),
    });
    for (const offer of l.offers) {
      rows['offers.csv'].push({
        loan_id: l.id,
        member_id: offer.memberId,
        status: offer.status,
        amount: fmtMoney(offer.amount),
        accepted: fmtBool(offer.accepted),
        note: o(offer.note),
        responded_at: o(offer.respondedAt),
      });
    }
    for (const a of l.agreements) {
      rows['agreements.csv'].push({
        loan_id: l.id,
        lender_id: a.lenderId,
        principal: fmtMoney(a.principal),
        interest_rate_percent: String(a.interestRate),
        fee: fmtMoney(a.fee),
        total: fmtMoney(a.total),
        borrower_signed_at: o(a.borrowerSignedAt),
        lender_signed_at: o(a.lenderSignedAt),
      });
    }
    for (const i of l.schedule) {
      rows['installments.csv'].push({
        loan_id: l.id,
        number: String(i.index + 1),
        due_date: i.dueDate,
        amount: fmtMoney(i.amount),
        paid_at: o(i.paidAt),
        on_time: i.onTime === undefined ? '' : fmtBool(i.onTime),
      });
      for (const p of i.parts) {
        rows['installment_splits.csv'].push({ loan_id: l.id, number: String(i.index + 1), pays_to: p.to, amount: fmtMoney(p.amount) });
      }
    }
    for (const p of l.pointsLog) {
      rows['points_log.csv'].push({ loan_id: l.id, at: p.at, points: String(p.points), reason: p.reason, label: p.label });
    }
    if (l.pause) {
      rows['pauses.csv'].push({ loan_id: l.id, status: l.pause.status, requested_at: l.pause.requestedAt });
      for (const [lenderId, ans] of Object.entries(l.pause.approvals)) {
        rows['pause_answers.csv'].push({ loan_id: l.id, lender_id: lenderId, answer: ans === null ? '' : fmtBool(ans) });
      }
    }
    for (const [rewardId, code] of Object.entries(l.claimedRewards)) {
      rows['claimed_rewards.csv'].push({ loan_id: l.id, reward_id: rewardId, code });
    }
  }
  for (const t of db.transactions) {
    rows['transactions.csv'].push({ id: t.id, user_id: t.userId, at: t.at, amount: fmtMoney(t.amount), memo: t.memo });
  }
  if (db.clockDaysAhead) rows['mockup_clock.csv'].push({ days_ahead: String(db.clockDaysAhead) });

  return Object.fromEntries(ACTIVITY_FILES.map((f) => [f, writeTable([...ACTIVITY_TABLES[f]], rows[f])])) as Record<ActivityFile, string>;
}
