import type { AccountSummary, MockupPerson } from '@familyshield/core';
import type { CsvFiles } from '@familyshield/service';
import type { FamilyShieldApi } from '../api/types';

/**
 * What a functional-mockup host app (the BlueRiver demo bank) needs beyond the
 * FamilyShield API: who can be "signed in", their bank balance, and a reset.
 * In a real bank these come from the bank's own systems.
 */
export interface MockupHost {
  /** 'server': CSV files on disk via the backend server. 'browser': CSV files in this browser. */
  readonly mode: 'server' | 'browser';
  /** The FamilyShield API as one person. */
  apiFor(userId: string): FamilyShieldApi;
  people(): Promise<MockupPerson[]>;
  account(userId: string): Promise<AccountSummary>;
  /** Clear all activity (requests, loans, payments). Setup data stays. */
  reset(): Promise<void>;
  /** Called whenever data may have changed. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Browser mode only: the current CSV files, to download. */
  exportCsv?(): CsvFiles;
  dispose(): void;
}
