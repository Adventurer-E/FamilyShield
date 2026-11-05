/**
 * Dates are ISO calendar dates ("2026-11-15") in UTC. Timestamps are full ISO
 * strings. Keeping them as strings makes loan records trivially serializable.
 */
export type IsoDate = string;
export type IsoTimestamp = string;

export function toIsoDate(value: Date | IsoTimestamp): IsoDate {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Add calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const day = Math.min(d, daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  target.setUTCDate(day);
  return toIsoDate(target);
}

export function formatDate(date: IsoDate, withYear = true): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}
