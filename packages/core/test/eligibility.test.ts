import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, FamilyShieldError, addDays, assertEligible, checkEligibility, daysBetween } from '../src';
import type { LoanCase, Rules } from '../src';

const rules: Rules = { ...DEFAULT_RULES, eligibility: { minCircleSize: 2, waitDaysAfterRepaid: 30 } };

/** Just the fields eligibility looks at. */
const loan = (status: LoanCase['status'], repaidAt?: string) => ({ id: `l-${status}`, status, repaidAt }) as LoanCase;

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-11-15', 30)).toBe('2026-12-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-15', '2026-12-15')).toBe(30);
    expect(daysBetween('2026-12-15', '2026-11-15')).toBe(-30);
  });
});

describe('who may start a request', () => {
  it('lets someone with a big enough circle and no loans ask', () => {
    expect(checkEligibility({ today: '2026-11-12', circleSize: 2, loans: [] }, rules)).toEqual({ eligible: true, blocks: [] });
  });

  it('needs the minimum circle size', () => {
    const none = checkEligibility({ today: '2026-11-12', circleSize: 0, loans: [] }, rules);
    expect(none.eligible).toBe(false);
    expect(none.blocks).toEqual([{ code: 'small-circle', message: 'Add at least 2 people to your trusted circle before asking for support.' }]);
    const one = checkEligibility({ today: '2026-11-12', circleSize: 1, loans: [] }, rules);
    expect(one.blocks[0]!.message).toMatch(/You have 1 so far/);
  });

  it('allows one open request or loan at a time', () => {
    for (const status of ['collecting', 'signing', 'active'] as const) {
      expect(checkEligibility({ today: '2026-11-12', circleSize: 3, loans: [loan(status)] }, rules).blocks.map((b) => b.code)).toEqual(['open-loan']);
    }
    expect(checkEligibility({ today: '2026-11-12', circleSize: 3, loans: [loan('cancelled')] }, rules).eligible).toBe(true);
  });

  it('waits after the last repaid loan, and says until when', () => {
    const repaid = [loan('repaid', '2026-10-01T12:00:00.000Z'), loan('repaid', '2026-11-01T09:00:00.000Z')];
    const during = checkEligibility({ today: '2026-11-30', circleSize: 3, loans: repaid }, rules);
    expect(during.blocks).toEqual([
      { code: 'waiting-period', until: '2026-12-01', message: 'You can ask your circle again from Dec 1, 2026, 30 days after your last loan was repaid.' },
    ]);
    expect(checkEligibility({ today: '2026-12-01', circleSize: 3, loans: repaid }, rules).eligible).toBe(true);
    expect(checkEligibility({ today: '2026-11-02', circleSize: 3, loans: repaid }, { ...rules, eligibility: { minCircleSize: 1, waitDaysAfterRepaid: 0 } }).eligible).toBe(true);
  });

  it('lists every reason, most important first', () => {
    const result = checkEligibility({ today: '2026-11-12', circleSize: 1, loans: [loan('active'), loan('repaid', '2026-11-01T00:00:00Z')] }, rules);
    expect(result.blocks.map((b) => b.code)).toEqual(['open-loan', 'small-circle', 'waiting-period']);
  });

  it('defaults keep the old behavior: one person in the circle, no wait', () => {
    expect(checkEligibility({ today: '2026-11-02', circleSize: 1, loans: [loan('repaid', '2026-11-01T00:00:00Z')] }).eligible).toBe(true);
  });

  it('refuses with the first reason', () => {
    const result = checkEligibility({ today: '2026-11-12', circleSize: 0, loans: [] }, rules);
    expect(() => assertEligible(result)).toThrow(FamilyShieldError);
    expect(() => assertEligible(result)).toThrow(/Add at least 2 people/);
  });
});
