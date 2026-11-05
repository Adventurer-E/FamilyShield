/**
 * All money is held as integer cents to avoid floating-point drift.
 * Only format at the edges (UI), never store dollars.
 */
export type Cents = number;

export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}

/** "$1,500" for whole dollars, "$157.50" otherwise. */
export function formatMoney(cents: Cents): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Split `total` into `parts` integer amounts that add up exactly to `total`.
 * Leftover cents go to the earliest parts, so the first installments may be
 * one cent higher than the later ones.
 */
export function splitEvenly(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(total) || total < 0) throw new RangeError('total must be a non-negative integer of cents');
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError('parts must be a positive integer');
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function sum(values: readonly Cents[]): Cents {
  return values.reduce((t, v) => t + v, 0);
}
