import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FamilyShieldService } from '@familyshield/service';
import { createApp } from './app';
import { FolderCsvStorage } from './storage';

/**
 * FamilyShield functional-mockup backend.
 *
 *   PORT       default 8787
 *   DATA_DIR   default <repo>/data   (the CSV fake database)
 *   ALLOW_ORIGIN  CORS origin, default *
 */
const port = Number(process.env.PORT ?? 8787);
const dataDir = resolve(process.env.DATA_DIR ?? fileURLToPath(new URL('../../../data', import.meta.url)));

const storage = new FolderCsvStorage(dataDir);
const service = new FamilyShieldService(storage);

// Fail fast with a readable message if a CSV was edited into a broken state.
try {
  const people = service.people();
  console.log(`FamilyShield backend · data: ${dataDir} · ${people.length} people`);
} catch (e) {
  console.error(`Could not read the data files in ${dataDir}:\n  ${(e as Error).message}`);
  process.exit(1);
}

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
