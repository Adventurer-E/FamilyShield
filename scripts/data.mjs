// Manage the CSV fake database's two layers.
//
//   npm run data:reset   Start over: copy the shared state (data/) into your working copy (data/local/)
//   npm run data:save    Share your current state: copy data/local/ into data/, then review and commit it
//   npm run data:status  Show which activity files differ between the two
//
// Setup tables (settings, people, reasons, rewards, auto_replies,
// example_transactions) live only in data/; edit them there directly.
// These commands move the ACTIVITY tables, including circles.csv.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep in step with ACTIVITY_TABLES in packages/service/src/database.ts
// (a service test checks this).
const ACTIVITY = [
  'circles.csv',
  'new_people.csv',
  'loans.csv',
  'offers.csv',
  'agreements.csv',
  'installments.csv',
  'installment_splits.csv',
  'points_log.csv',
  'pauses.csv',
  'pause_answers.csv',
  'claimed_rewards.csv',
  'transactions.csv',
];

const dataDir = resolve(process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url)));
const workDir = resolve(process.env.WORK_DIR ?? join(dataDir, 'local'));
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const rows = (text) => (text ? Math.max(0, text.trim().split('\n').length - 1) : 0);

// Same fingerprint as packages/server/src/storage.ts, so the server knows the copy is current.
function seedVersion() {
  const hash = createHash('sha256');
  for (const f of [...ACTIVITY].sort()) hash.update(f).update(read(join(dataDir, f)) ?? '');
  return hash.digest('hex').slice(0, 16);
}

const command = process.argv[2];
if (command === 'reset') {
  mkdirSync(workDir, { recursive: true });
  for (const f of ACTIVITY) if (existsSync(join(dataDir, f))) copyFileSync(join(dataDir, f), join(workDir, f));
  writeFileSync(join(workDir, '.seed-version'), `${seedVersion()}\n`);
  console.log(`Working copy reset from ${dataDir}. (If the server is running, it picks this up on the next request.)`);
} else if (command === 'save') {
  if (!existsSync(workDir)) {
    console.error(`No working copy at ${workDir} yet. Run the app first (npm run dev).`);
    process.exit(1);
  }
  let changed = 0;
  for (const f of ACTIVITY) {
    const local = read(join(workDir, f));
    if (local !== null && local !== read(join(dataDir, f))) {
      writeFileSync(join(dataDir, f), local);
      console.log(`  updated data/${f} (${rows(local)} rows)`);
      changed++;
    }
  }
  writeFileSync(join(workDir, '.seed-version'), `${seedVersion()}\n`);
  console.log(changed ? `\nSaved. Review with \`git diff data/\`, then commit to share this state.` : 'Nothing to save: your working copy matches data/.');
} else if (command === 'status') {
  let differs = 0;
  for (const f of ACTIVITY) {
    const [shared, local] = [read(join(dataDir, f)), read(join(workDir, f))];
    if (shared !== local) {
      differs++;
      console.log(`  ${f.padEnd(24)} shared: ${String(rows(shared)).padStart(3)} rows   yours: ${local === null ? '  —' : String(rows(local)).padStart(3)} rows`);
    }
  }
  console.log(differs ? `\n${differs} file(s) differ. data:save shares yours; data:reset discards yours.` : 'Your working copy matches the shared state.');
} else {
  console.log('Usage: npm run data:reset | data:save | data:status');
  process.exit(command ? 1 : 0);
}
