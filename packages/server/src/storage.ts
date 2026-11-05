import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CsvFiles, CsvStorage } from '@familyshield/service';

/**
 * The CSV files in a folder on disk (data/ by default).
 *
 * Reads happen on every request, so a file you edit and save in a
 * spreadsheet or text editor is picked up immediately. Writes go to a
 * temporary file first and are then renamed into place, so a crash can't
 * leave a half-written CSV behind.
 */
export class FolderCsvStorage implements CsvStorage {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  read(): CsvFiles {
    const files: CsvFiles = {};
    for (const name of readdirSync(this.dir)) {
      if (name.toLowerCase().endsWith('.csv')) files[name] = readFileSync(join(this.dir, name), 'utf8');
    }
    return files;
  }

  write(activity: CsvFiles): void {
    for (const [name, text] of Object.entries(activity)) {
      const target = join(this.dir, name);
      // Skip unchanged files so editors with the file open aren't disturbed.
      if (existsSync(target) && readFileSync(target, 'utf8') === text) continue;
      const tmp = `${target}.${process.pid}.tmp`;
      writeFileSync(tmp, text, 'utf8');
      renameSync(tmp, target);
    }
  }
}
