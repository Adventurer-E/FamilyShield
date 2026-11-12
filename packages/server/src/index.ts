import { createServer } from 'node:http';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FamilyShieldService } from '@familyshield/service';
import { createApp } from './app';
import { LayeredCsvStorage } from './storage';

/**
 * FamilyShield mockup backend.
 *
 *   PORT          default 8787
 *   DATA_DIR      shared, committed CSVs (default <repo>/data)
 *   WORK_DIR      your git-ignored working copy (default <DATA_DIR>/local)
 *   ALLOW_ORIGIN  CORS origin, default *
 */
const port = Number(process.env.PORT ?? 8787);
const dataDir = resolve(process.env.DATA_DIR ?? fileURLToPath(new URL('../../../data', import.meta.url)));
const workDir = resolve(process.env.WORK_DIR ?? resolve(dataDir, 'local'));
const show = (p: string) => relative(process.cwd(), p) || '.';

const storage = new LayeredCsvStorage(dataDir, workDir);
const service = new FamilyShieldService(storage);

// Fail fast with a readable message if a CSV was edited into a broken state.
try {
  const people = service.people();
  console.log(`FamilyShield backend · ${people.length} people`);
  console.log(`  shared data (committed):    ${show(dataDir)}`);
  console.log(`  your working copy (ignored): ${show(workDir)}`);
} catch (e) {
  console.error(`Could not read the data files:\n  ${(e as Error).message}`);
  process.exit(1);
}
if (storage.isSeedNewer()) {
  console.warn(
    '  ⚠ The shared starting state in data/ changed since your working copy was made.\n' +
      '    Run `npm run data:reset` (or press "Reset") to start from it.',
  );
}
for (const f of storage.unknownFiles()) console.warn(`  ⚠ Ignoring unknown file in working copy: ${f}`);

// Scripted relatives (auto_replies.csv) act on their own schedule.
setInterval(() => {
  try {
    service.tick();
  } catch (e) {
    console.error(`[tick] ${(e as Error).message}`);
  }
}, 500);

createServer(createApp(service, { allowOrigin: process.env.ALLOW_ORIGIN })).listen(port, () => {
  console.log(`Listening on http://localhost:${port}/v1`);
});
