import { describe, expect, it } from 'vitest';
import { addMonths, feeFor, formatMoney, splitEvenly, sum } from '../src';

describe('splitEvenly', () => {
  it('always adds back up to the total', () => {
    for (const [total, parts] of [[150_000, 10], [7_500, 12], [100, 3], [1, 6], [0, 6]] as const) {
      const split = splitEvenly(total, parts);
      expect(split).toHaveLength(parts);
      expect(sum(split)).toBe(total);
      expect(Math.max(...split) - Math.min(...split)).toBeLessThanOrEqual(1);
    }
  });

  it('puts leftover cents on the earliest parts', () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
  });

  it('rejects bad input', () => {
    expect(() => splitEvenly(10.5, 2)).toThrow();
    expect(() => splitEvenly(100, 0)).toThrow();
  });
});

describe('formatMoney', () => {
  it('drops cents for whole dollars', () => {
    expect(formatMoney(157_500)).toBe('$1,575');
    expect(formatMoney(15_750)).toBe('$157.50');
  });
});

describe('fees', () => {
  it('charges 5%', () => {
    expect(feeFor(150_000)).toBe(7_500);
    expect(feeFor(100_000)).toBe(5_000);
  });
});

describe('addMonths', () => {
  it('clamps to the end of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
  });
});
