import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVITY_FILES, SETUP_FILES, emptyActivity } from '@familyshield/service';
import type { CsvFiles, CsvStorage } from '@familyshield/service';

/**
 * Two layers of CSV files, so developers on different branches don't
 * conflict over test data:
 *
 *   data/           SHARED, committed. Setup tables (settings, people, reasons,
 *                   rewards, auto replies) plus the starting state of the
 *                   activity tables (loans, circles, …). Changed on purpose, reviewed like code.
 *   data/local/     PERSONAL, git-ignored. The working copy of the activity
 *                   tables that the server writes as you use the app. Created
 *                   from data/ on first run; "reset" copies data/ over it again.
 *
 * Setup tables are always read from data/, so an edit there applies at once.
 * Every read hits the disk, so hand edits in either folder show up on the next
 * request. Writes go to a temp file that is renamed into place, so a crash
 * can't leave a half-written CSV.
 */
export class LayeredCsvStorage implements CsvStorage {
  readonly seedDir: string;
  readonly workDir: string;

  constructor(seedDir: string, workDir: string) {
    this.seedDir = seedDir;
    this.workDir = workDir;
    if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
    for (const f of ACTIVITY_FILES) if (!existsSync(join(workDir, f))) this.copyFromSeed(f);
    if (!existsSync(this.markerPath)) this.writeMarker();
  }

  private readIfExists(dir: string, name: string): string | undefined {
    const path = join(dir, name);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  }

  private copyFromSeed(name: string): void {
    const seed = join(this.seedDir, name);
    if (existsSync(seed)) copyFileSync(seed, join(this.workDir, name));
    else writeFileSync(join(this.workDir, name), emptyActivity()[name] ?? '', 'utf8');
  }

  read(): CsvFiles {
    const files: CsvFiles = {};
    for (const f of SETUP_FILES) {
      const text = this.readIfExists(this.seedDir, f);
      if (text !== undefined) files[f] = text;
    }
    for (const f of ACTIVITY_FILES) {
      const text = this.readIfExists(this.workDir, f) ?? this.readIfExists(this.seedDir, f);
      if (text !== undefined) files[f] = text;
    }
    return files;
  }

  write(activity: CsvFiles): void {
    for (const [name, text] of Object.entries(activity)) {
      const target = join(this.workDir, name);
      // Skip unchanged files so editors with the file open aren't disturbed.
      if (existsSync(target) && readFileSync(target, 'utf8') === text) continue;
      const tmp = `${target}.${process.pid}.tmp`;
      writeFileSync(tmp, text, 'utf8');
      renameSync(tmp, target);
    }
  }

  /** Copy the shared starting state from data/ over the working copy. */
  reset(): void {
    for (const f of ACTIVITY_FILES) this.copyFromSeed(f);
    this.writeMarker();
  }

  // ---- noticing when someone changes the shared starting state

  private get markerPath(): string {
    return join(this.workDir, '.seed-version');
  }

  /** A fingerprint of the shared activity files in data/. */
  seedVersion(): string {
    const hash = createHash('sha256');
    for (const f of [...ACTIVITY_FILES].sort()) hash.update(f).update(this.readIfExists(this.seedDir, f) ?? '');
    return hash.digest('hex').slice(0, 16);
  }

  private writeMarker(): void {
    writeFileSync(this.markerPath, `${this.seedVersion()}\n`, 'utf8');
  }

  /** True when data/ changed (e.g. after a pull) since the working copy was made. */
  isSeedNewer(): boolean {
    return (this.readIfExists(this.workDir, '.seed-version') ?? '').trim() !== this.seedVersion();
  }

  /** Files in the working copy that the app doesn't know (typos, leftovers). */
  unknownFiles(): string[] {
    const known = new Set<string>([...ACTIVITY_FILES]);
    return readdirSync(this.workDir).filter((n) => n.endsWith('.csv') && !known.has(n));
  }
}
