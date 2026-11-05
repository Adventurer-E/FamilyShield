import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CsvDataError, FamilyShieldService, parseCsv, readDatabase, toCsv, writeActivity } from '../src';
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

  it('reset clears activity but keeps setup', () => {
    const { svc, storage } = setup();
    svc.createRequest('alex', { reason: 'car', purpose: 'x', amount: 100_000, months: 6 });
    svc.reset();
    expect(storage.files['loans.csv']!.trim().split('\n')).toHaveLength(1);
    expect(svc.people()).toHaveLength(4);
  });
});
