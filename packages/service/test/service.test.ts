import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_FILES, CsvDataError, FamilyShieldService, parseContact, parseCsv, readDatabase, toCsv, writeActivity } from '../src';
import type { CsvFiles, CsvStorage } from '../src';

// Tests run from packages/service; the real fake database lives in data/ at the repo root.
const DATA_DIR = resolve(process.cwd(), '../../data');

function loadDataDir(): CsvFiles {
  return Object.fromEntries(
    readdirSync(DATA_DIR)
      .filter((f) => f.endsWith('.csv'))
      .map((f) => [f, readFileSync(resolve(DATA_DIR, f), 'utf8')]),
  );
}

function memoryStorage(initial: CsvFiles): CsvStorage & { files: CsvFiles } {
  const store = { files: { ...initial } };
  return {
    get files() {
      return store.files;
    },
    read: () => ({ ...store.files }),
    write: (activity) => {
      store.files = { ...store.files, ...activity };
    },
  };
}

/** A service on a copy of data/ with a clock we control. */
function setup(overrides: CsvFiles = {}) {
  let t = Date.parse('2026-11-05T15:00:00.000Z');
  const storage = memoryStorage({ ...loadDataDir(), ...overrides });
  const svc = new FamilyShieldService(storage, { now: () => new Date(t), random: () => 0.5 });
  const advance = (ms: number) => {
    t += ms;
    svc.tick();
  };
  return { svc, storage, advance };
}

describe('csv', () => {
  it('round-trips quotes, commas and newlines', () => {
    const rows = [
      ['a', 'b,c', 'say "hi"'],
      ['multi\nline', ' padded ', ''],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('handles CRLF line endings, a BOM and blank lines', () => {
    expect(parseCsv('﻿id,name\r\n1,Ann\r\n\r\n2,Bo\r\n')).toEqual([
      ['id', 'name'],
      ['1', 'Ann'],
      ['2', 'Bo'],
    ]);
  });
});

describe('reading data/', () => {
  it('npm run data:reset knows every activity table', () => {
    const script = readFileSync(resolve(DATA_DIR, '../scripts/data.mjs'), 'utf8');
    const listed = [...script.match(/const ACTIVITY = \[([\s\S]*?)\]/)![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...ACTIVITY_FILES].sort());
  });

  it('reads every table in the repo', () => {
    const db = readDatabase(loadDataDir());
    expect(db.rules.feeRate).toBe(0.05);
    expect(db.rules.terms).toEqual([6, 10, 12]);
    expect(db.people.find((p) => p.id === 'alex')!.openingBalance).toBe(432_850);
    expect(db.rewards.map((r) => r.id)).toEqual(['dinner', 'trip', 'activity']);
    expect(db.autoReplies.map((a) => a.memberId)).toEqual(['maya', 'lisa']);
  });

  it('points at the exact cell when a hand edit is wrong', () => {
    const files = { ...loadDataDir(), 'people.csv': 'id,first_name,opening_balance\nalex,Alex,lots\n' };
    expect(() => readDatabase(files)).toThrow(CsvDataError);
    expect(() => readDatabase(files)).toThrow(/people\.csv, line 2, column "opening_balance"/);
  });

  it('reads the request defaults, offer amounts, reasons and example transactions', () => {
    const db = readDatabase(loadDataDir());
    expect(db.rules.defaultAmount).toBe(150_000);
    expect(db.rules.defaultTerm).toBe(10);
    expect(db.rules.offerAmounts).toEqual([25_000, 50_000, 100_000]);
    expect(db.reasons.map((r) => r.id)).toEqual(['car', 'medical', 'job', 'other']);
    expect(db.reasons[1]!.template).toContain('didn’t fully cover, and');
    expect(db.exampleTransactions.map((t) => [t.name, t.amount])).toEqual([
      ['Corner Grocery', -8_624],
      ['Westside Auto Shop', -32_000],
      ['Payroll deposit', 250_000],
    ]);
  });

  it('rejects request defaults the rules don’t allow', () => {
    const base = loadDataDir();
    const term = { ...base, 'settings.csv': base['settings.csv']!.replace('default_term_months,10,', 'default_term_months,9,') };
    expect(() => readDatabase(term)).toThrow(/default_term_months/);
    const amount = { ...base, 'settings.csv': base['settings.csv']!.replace('default_request,1500,', 'default_request,9000,') };
    expect(() => readDatabase(amount)).toThrow(/default_request/);
    const reason = { ...base, 'reasons.csv': 'id,label,template\nrent,Rent,Behind on rent\n' };
    expect(() => readDatabase(reason)).toThrow(/reasons\.csv, line 2, column "id"/);
  });

  it('falls back to the built-in reasons when reasons.csv is missing', () => {
    const { 'reasons.csv': _omit, ...files } = loadDataDir();
    expect(readDatabase(files).reasons.map((r) => r.label)).toContain('Car repair');
  });

  it('accepts friendly money formats', () => {
    const base = loadDataDir();
    const files = { ...base, 'people.csv': base['people.csv']!.replace('4328.50', '"$4,328.5"') };
    expect(readDatabase(files).people[0]!.openingBalance).toBe(432_850);
  });
});

describe('the service over CSVs', () => {
  it('runs the whole family story and writes it to the activity tables', () => {
    const { svc, storage, advance } = setup();

    const loan = svc.createRequest('alex', { reason: 'car', purpose: 'Car broke down', amount: 150_000, months: 10 });
    advance(5_000); // Maya (2.5s) and Lisa (4.5s) answer from auto_replies.csv
    const offers = svc.myLoan('alex')!.offers.map((o) => `${o.memberId}:${o.status}`);
    expect(offers).toEqual(['mom:pending', 'maya:offered', 'lisa:declined']);

    // Mom only sees her own row
    expect(svc.incoming('mom')[0]!.offers.map((o) => o.memberId)).toEqual(['mom']);
    svc.respond('mom', loan.id, { kind: 'offer', amount: 100_000 });
    svc.setOfferAccepted('alex', loan.id, 'mom', true);
    svc.setOfferAccepted('alex', loan.id, 'maya', true);
    svc.signAsBorrower('alex', loan.id);
    advance(2_000); // Maya auto-signs
    expect(svc.myLoan('alex')!.status).toBe('signing');
    svc.signAsLender('mom', loan.id);
    expect(svc.myLoan('alex')!.status).toBe('active');

    expect(svc.account('alex').balance).toBe(432_850 + 150_000);
    expect(svc.account('mom').balance).toBe(1_864_210 - 100_000);
    expect(svc.account('maya').balance).toBe(620_000 - 50_000);

    for (let i = 0; i < 10; i++) svc.makePayment('alex', loan.id);
    const done = svc.myLoan('alex')!;
    expect(done.status).toBe('repaid');
    expect(done.points).toBe(1_200);
    expect(svc.account('alex').balance).toBe(432_850 + 150_000 - 157_500);
    expect(svc.account('mom').balance).toBe(1_864_210);

    svc.claimReward('alex', loan.id, 'trip');
    expect(svc.myLoan('alex')!.claimedRewards.trip).toMatch(/^FS-HARBORLINE-\d{4}$/);

    // It's all in the CSVs, in dollars
    expect(storage.files['loans.csv']).toContain(',1500.00,10,repaid,');
    expect(storage.files['agreements.csv']).toContain(',mom,1000.00,0,50.00,1050.00,');
    expect(storage.files['installments.csv']!.split('\n').filter(Boolean)).toHaveLength(11);
    expect(storage.files['claimed_rewards.csv']).toContain(',trip,FS-HARBORLINE-');
  });

  it('picks up hand edits to the CSVs on the next call', () => {
    const { svc, storage } = setup();
    storage.files['settings.csv'] = storage.files['settings.csv']!.replace('fee_rate_percent,5,', 'fee_rate_percent,3,');
    storage.files['people.csv'] = storage.files['people.csv']!.replace('4328.50', '9999.99');
    expect(svc.config().rules.feeRate).toBe(0.03);
    expect(svc.account('alex').balance).toBe(999_999);
  });

  it('serves reasons and example transactions without counting them in the balance', () => {
    const { svc } = setup();
    expect(svc.config().reasons).toHaveLength(4);
    const account = svc.account('alex');
    expect(account.balance).toBe(432_850);
    expect(account.exampleTransactions).toHaveLength(3);
  });

  it('reads back exactly what it wrote', () => {
    const { svc, storage, advance } = setup();
    const loan = svc.createRequest('alex', { reason: 'medical', purpose: 'Bill, "urgent"\nsecond line', amount: 100_000, months: 6 });
    advance(5_000);
    svc.setOfferAccepted('alex', loan.id, 'maya', true);
    svc.signAsBorrower('alex', loan.id);
    advance(2_000);
    svc.makePayment('alex', loan.id);
    svc.requestPause('alex', loan.id);
    const db = readDatabase(storage.files);
    expect(writeActivity(db)).toEqual(Object.fromEntries(Object.keys(writeActivity(db)).map((f) => [f, storage.files[f]])));
    expect(db.loans[0]!.purpose).toBe('Bill, "urgent"\nsecond line');
  });

  it('keeps borrowers and lenders in their lanes', () => {
    const { svc } = setup();
    const loan = svc.createRequest('alex', { reason: 'car', purpose: 'x', amount: 100_000, months: 6 });
    expect(() => svc.makePayment('mom', loan.id)).toThrow(/isn’t your request/);
    expect(() => svc.respond('maya', 'nope', { kind: 'decline' })).toThrow(/no longer exists/);
    expect(() => svc.profile('stranger')).toThrow(/people\.csv/);
  });

  it('reset restores the shared starting state when the storage keeps one', () => {
    const shared = loadDataDir();
    const storage = memoryStorage(shared);
    const withReset = { ...storage, reset: () => storage.write(Object.fromEntries(Object.entries(shared).filter(([f]) => f in writeActivity(readDatabase(shared))))) };
    const svc = new FamilyShieldService(withReset);
    svc.createRequest('alex', { reason: 'car', purpose: 'x', amount: 100_000, months: 6 });
    expect(storage.files['loans.csv']).not.toBe(shared['loans.csv']);
    svc.reset();
    expect(storage.files['loans.csv']).toBe(shared['loans.csv']);
  });

  it('reset clears activity but keeps setup', () => {
    const { svc, storage } = setup();
    svc.createRequest('alex', { reason: 'car', purpose: 'x', amount: 100_000, months: 6 });
    svc.reset();
    expect(storage.files['loans.csv']!.trim().split('\n')).toHaveLength(1);
    expect(svc.people()).toHaveLength(4);
  });
});

describe('the trusted circle', () => {
  const ids = (people: Array<{ id: string }>) => people.map((p) => p.id);

  it('lists the caller’s circle with their nicknames, same as the profile', () => {
    const { svc } = setup();
    expect(svc.circle('alex').map((p) => p.nickname)).toEqual(['Mom', 'Cousin Maya', 'Aunt Lisa']);
    expect(svc.circle('alex')).toEqual(svc.profile('alex').circle);
    expect(svc.circle('maya')).toEqual([]);
  });

  it('adds someone, writes it to circles.csv, and includes them in the next request', () => {
    const { svc, storage } = setup();
    const circle = svc.addCircleMember('mom', 'maya', '  Maya   Lin ');
    expect(circle.at(-1)).toEqual({ id: 'maya', firstName: 'Maya', lastName: 'Lin', nickname: 'Maya Lin' });
    expect(storage.files['circles.csv']).toContain('\nmom,maya,Maya Lin\n');
    const loan = svc.createRequest('mom', { reason: 'car', purpose: 'x', amount: 100_000, months: 6 });
    expect(loan.offers.map((o) => o.memberId)).toEqual(['alex', 'lisa', 'maya']);
  });

  it('adds without a nickname', () => {
    const { svc } = setup();
    expect(svc.addCircleMember('maya', 'lisa').at(-1)).toEqual({ id: 'lisa', firstName: 'Lisa', lastName: 'Park' });
  });

  it('won’t add yourself, someone twice, a stranger, or a very long nickname', () => {
    const { svc } = setup();
    expect(() => svc.addCircleMember('alex', 'alex')).toThrow(/yourself/);
    expect(() => svc.addCircleMember('alex', 'mom')).toThrow(/already in your circle/);
    expect(() => svc.addCircleMember('alex', 'bob')).toThrow(/couldn’t find/);
    expect(() => svc.addCircleMember('maya', 'mom', 'x'.repeat(41))).toThrow(/40 characters/);
    expect(() => svc.addCircleMember('stranger', 'mom')).toThrow(/people\.csv/);
    expect(ids(svc.circle('maya'))).toEqual([]);
  });

  it('renames a member, and a blank nickname clears it', () => {
    const { svc, storage } = setup();
    expect(svc.renameCircleMember('alex', 'lisa', 'Auntie').find((p) => p.id === 'lisa')!.nickname).toBe('Auntie');
    const cleared = svc.renameCircleMember('alex', 'lisa', '   ').find((p) => p.id === 'lisa')!;
    expect(cleared).toEqual({ id: 'lisa', firstName: 'Lisa', lastName: 'Park' });
    expect(storage.files['circles.csv']).toContain('\nalex,lisa,\n');
    expect(ids(svc.circle('alex'))).toEqual(['mom', 'maya', 'lisa']); // order kept
    expect(() => svc.renameCircleMember('alex', 'alex', 'Me')).toThrow(/isn’t in your circle/);
  });

  it('removes a member so future requests don’t go to them', () => {
    const { svc } = setup();
    expect(ids(svc.removeCircleMember('alex', 'lisa'))).toEqual(['mom', 'maya']);
    expect(() => svc.removeCircleMember('alex', 'lisa')).toThrow(/isn’t in your circle/);
    const loan = svc.createRequest('alex', { reason: 'car', purpose: 'x', amount: 100_000, months: 6 });
    expect(loan.offers.map((o) => o.memberId)).toEqual(['mom', 'maya']);
  });

  it('withdraws a removed member’s offer on the open request', () => {
    const { svc, advance } = setup();
    const loan = svc.createRequest('alex', { reason: 'car', purpose: 'x', amount: 150_000, months: 10 });
    advance(5_000); // Maya offers, Lisa declines, Mom hasn't answered
    svc.setOfferAccepted('alex', loan.id, 'maya', true);
    svc.removeCircleMember('alex', 'maya');
    svc.removeCircleMember('alex', 'mom');
    svc.removeCircleMember('alex', 'lisa');
    const offers = svc.myLoan('alex')!.offers.map((o) => `${o.memberId}:${o.status}:${o.accepted}`);
    expect(offers).toEqual(['mom:expired:false', 'maya:expired:false', 'lisa:declined:false']);
    expect(() => svc.respond('mom', loan.id, { kind: 'offer', amount: 100_000 })).toThrow(/already answered/);
    expect(() => svc.signAsBorrower('alex', loan.id)).toThrow(/Accept at least one/);
    expect(svc.incoming('mom')[0]!.offers).toEqual([expect.objectContaining({ memberId: 'mom', status: 'expired' })]);
  });

  it('stops a scripted relative from answering once removed', () => {
    const { svc, advance } = setup();
    svc.createRequest('alex', { reason: 'car', purpose: 'x', amount: 150_000, months: 10 });
    svc.removeCircleMember('alex', 'maya');
    advance(5_000);
    expect(svc.myLoan('alex')!.offers.find((o) => o.memberId === 'maya')!.status).toBe('expired');
  });

  it('doesn’t touch a loan the borrower already signed', () => {
    const { svc, advance } = setup();
    const loan = svc.createRequest('alex', { reason: 'car', purpose: 'x', amount: 150_000, months: 10 });
    svc.respond('mom', loan.id, { kind: 'offer', amount: 100_000 });
    svc.setOfferAccepted('alex', loan.id, 'mom', true);
    svc.signAsBorrower('alex', loan.id);
    svc.removeCircleMember('alex', 'mom');
    expect(svc.myLoan('alex')!.agreements.map((a) => a.lenderId)).toEqual(['mom']);
    svc.signAsLender('mom', loan.id);
    advance(1_000);
    expect(svc.myLoan('alex')!.status).toBe('active');
    // Out of the circle, but still a lender on this loan: the borrower still sees who she is.
    expect(ids(svc.profile('alex').circle)).not.toContain('mom');
    expect(svc.profile('alex').people.find((p) => p.id === 'mom')).toMatchObject({ firstName: 'Grace', lastName: 'Chen' });
  });

  it('only changes the caller’s own circle', () => {
    const { svc } = setup();
    svc.removeCircleMember('mom', 'alex');
    expect(ids(svc.circle('alex'))).toEqual(['mom', 'maya', 'lisa']);
    expect(ids(svc.circle('mom'))).toEqual(['lisa']);
  });

  it('rejects hand edits that repeat a member or add the owner', () => {
    const base = loadDataDir();
    expect(() => readDatabase({ ...base, 'circles.csv': base['circles.csv'] + 'alex,mom,Mama\n' })).toThrow(/circles\.csv, line 7, column "member_id".*already/);
    expect(() => readDatabase({ ...base, 'circles.csv': base['circles.csv'] + 'alex,alex,\n' })).toThrow(/own circle/);
  });

  it('reset brings the shared circles back', () => {
    const shared = loadDataDir();
    const storage = memoryStorage(shared);
    const withReset = { ...storage, reset: () => storage.write(Object.fromEntries(Object.entries(shared).filter(([f]) => f in writeActivity(readDatabase(shared))))) };
    const svc = new FamilyShieldService(withReset);
    svc.removeCircleMember('alex', 'mom');
    expect(storage.files['circles.csv']).not.toBe(shared['circles.csv']);
    svc.reset();
    expect(storage.files['circles.csv']).toBe(shared['circles.csv']);
  });
});

describe('adding to a circle by email or phone', () => {
  const ids = (people: Array<{ id: string }>) => people.map((p) => p.id);

  it('reads emails and phones the way people type them', () => {
    expect(parseContact(' Grace.Chen@Example.com ')).toEqual({ kind: 'email', value: 'grace.chen@example.com' });
    expect(parseContact('+1 (607) 555-0102')).toEqual({ kind: 'phone', value: '6075550102' });
    expect(parseContact('607.555.0102')).toEqual({ kind: 'phone', value: '6075550102' });
    expect(parseContact('16075550102')).toEqual({ kind: 'phone', value: '6075550102' });
    expect(parseContact('grace@')).toBeUndefined();
    expect(parseContact('mom')).toBeUndefined();
    // US numbers only: exactly 10 digits, and the area code and exchange can't start with 0 or 1.
    expect(parseContact('555-0102')).toBeUndefined(); // too short
    expect(parseContact('111111111111')).toBeUndefined(); // too long
    expect(parseContact('111 111 1111')).toBeUndefined(); // area code starts with 1
    expect(parseContact('(607) 155-0102')).toBeUndefined(); // exchange starts with 1
    expect(parseContact('+86 138 0013 8000')).toBeUndefined(); // not a US number
    expect(parseContact('607-555-01O2')).toBeUndefined(); // letter O
  });

  it('finds an existing person by email, in any case', () => {
    const { svc, storage } = setup();
    svc.removeCircleMember('alex', 'lisa');
    const circle = svc.addCircleMemberByContact('alex', 'Lisa.Park@EXAMPLE.com', { nickname: 'Aunt Lisa' });
    expect(circle.find((p) => p.id === 'lisa')).toMatchObject({ firstName: 'Lisa', nickname: 'Aunt Lisa' });
    expect(storage.files['new_people.csv']!.trim().split('\n')).toHaveLength(1); // header only: nobody created
  });

  it('finds an existing person by phone, however it is formatted', () => {
    const { svc } = setup();
    expect(ids(svc.addCircleMemberByContact('mom', '607-555-0103'))).toContain('maya');
  });

  it('creates an account for an email nobody has, and it survives a reload', () => {
    const { svc, storage } = setup();
    const circle = svc.addCircleMemberByContact('alex', 'sam.rivera@example.com', { name: 'Sam Rivera', nickname: 'Uncle Sam' });
    const sam = circle.find((p) => p.firstName === 'Sam')!;
    expect(sam).toMatchObject({ lastName: 'Rivera', nickname: 'Uncle Sam' });
    expect(storage.files['new_people.csv']).toContain('sam.rivera@example.com');
    expect(storage.files['new_people.csv']).toContain(',alex,');
    // Same email again: found, not created twice.
    expect(() => svc.addCircleMemberByContact('alex', 'SAM.RIVERA@example.com')).toThrow(/already in your circle/);
    expect(svc.addCircleMemberByContact('mom', 'sam.rivera@example.com').map((p) => p.id)).toContain(sam.id);
    expect(readDatabase(storage.files).people.filter((p) => p.email === 'sam.rivera@example.com')).toHaveLength(1);
    // New people are asked on the next request like anyone else.
    expect(svc.profile('alex').circle.map((p) => p.id)).toContain(sam.id);
  });

  it('names a new account after the email or phone when no name is given', () => {
    const { svc } = setup();
    expect(svc.addCircleMemberByContact('alex', 'jo@example.com').some((p) => p.firstName === 'jo')).toBe(true);
    expect(svc.addCircleMemberByContact('alex', '(212) 555-0199').some((p) => p.firstName === '(212) 555-0199')).toBe(true);
  });

  it('says what is wrong in plain words', () => {
    const { svc } = setup();
    expect(() => svc.addCircleMemberByContact('alex', '  ')).toThrow(/Enter their email or phone/);
    expect(() => svc.addCircleMemberByContact('alex', 'mom')).toThrow(/doesn’t look like an email or a US phone/);
    expect(() => svc.addCircleMemberByContact('alex', 'alex.chen@example.com')).toThrow(/can’t add yourself/);
    expect(() => svc.addCircleMemberByContact('alex', '(607) 555-0102')).toThrow(/already in your circle/);
    expect(() => svc.addCircleMemberByContact('alex', 'new@example.com', { name: 'x'.repeat(61) })).toThrow(/60 characters/);
  });

  it('a failed add creates nothing', () => {
    const { svc, storage } = setup();
    const before = storage.files['new_people.csv'];
    expect(() => svc.addCircleMemberByContact('alex', 'new@example.com', { nickname: 'x'.repeat(41) })).toThrow(/40 characters/);
    expect(storage.files['new_people.csv']).toBe(before);
  });

  it('rejects hand edits that give two people the same email or phone', () => {
    const base = loadDataDir();
    const dup = { ...base, 'people.csv': base['people.csv']!.replace('maya.lin@example.com', 'lisa.park@example.com') };
    expect(() => readDatabase(dup)).toThrow(/same email/);
    const bad = { ...base, 'people.csv': base['people.csv']!.replace('(607) 555-0103', 'call me') };
    expect(() => readDatabase(bad)).toThrow(/people\.csv, line 4, column "phone"/);
  });

  it('reset removes accounts created by adding', () => {
    const shared = loadDataDir();
    const storage = memoryStorage(shared);
    const withReset = { ...storage, reset: () => storage.write(Object.fromEntries(Object.entries(shared).filter(([f]) => f in writeActivity(readDatabase(shared))))) };
    const svc = new FamilyShieldService(withReset);
    svc.addCircleMemberByContact('alex', 'sam.rivera@example.com', { name: 'Sam Rivera' });
    svc.reset();
    expect(readDatabase(storage.files).people.map((p) => p.id)).toEqual(['alex', 'mom', 'maya', 'lisa']);
  });
});
