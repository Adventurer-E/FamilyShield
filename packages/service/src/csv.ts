/**
 * A small RFC 4180 CSV reader/writer: quoted fields, "" escapes, commas and
 * newlines inside quotes, CRLF or LF line endings, and an optional UTF-8 BOM
 * (Excel adds one). No dependencies, so it runs in Node and in the browser.
 */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
      fieldStarted = false;
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStarted = false;
    } else if (c !== '\r') {
      field += c;
      fieldStarted = true;
    }
  }
  if (fieldStarted || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines (e.g. a trailing newline or spacing someone added by hand).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function quote(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(quote).join(',')).join('\n') + '\n';
}

/** Thrown when a hand-edited CSV can't be read. The message names the file, row and column. */
export class CsvDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvDataError';
  }
}

export interface CsvRecord {
  /** 1-based line number in the file (header is line 1), for error messages. */
  line: number;
  file: string;
  get(column: string): string;
}

/** Read a CSV with a header row into records addressed by column name (case-insensitive). */
export function readTable(file: string, text: string | undefined, requiredColumns: string[] = []): CsvRecord[] {
  if (text === undefined) return [];
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  for (const col of requiredColumns) {
    if (!header.includes(col)) throw new CsvDataError(`${file}: missing column "${col}" in the header row.`);
  }
  return rows.slice(1).map((cells, i) => ({
    line: i + 2,
    file,
    get(column: string) {
      const idx = header.indexOf(column);
      return idx === -1 ? '' : (cells[idx] ?? '').trim();
    },
  }));
}

export function writeTable(columns: string[], records: Array<Record<string, string>>): string {
  return toCsv([columns, ...records.map((r) => columns.map((c) => r[c] ?? ''))]);
}
