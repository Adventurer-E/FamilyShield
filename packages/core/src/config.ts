import type { Cents } from './money';

/**
 * Business rules from the FamilyShield deck. Kept in one place so a partner
 * bank (or a pilot) can tune them without touching the lifecycle code.
 */

/** One-time service fee charged to the borrower, added to what they repay. */
export const FEE_RATE = 0.05;

/** Request limits, in cents. */
export const AMOUNT_MIN: Cents = 50_000; // $500
export const AMOUNT_MAX: Cents = 500_000; // $5,000
export const AMOUNT_STEP: Cents = 25_000; // $250

/** Repayment terms a borrower can choose, in months. */
export const TERM_OPTIONS = [6, 10, 12] as const;
export type TermMonths = (typeof TERM_OPTIONS)[number];

/** How many one-month pauses a borrower may ask for over a loan's life. */
export const MAX_PAUSES = 1;

/** Family points. Points belong to the whole circle on a loan, not one person. */
export const POINTS = {
  /** Per family member who funds the loan, awarded when the loan goes live. */
  HELP: 100,
  /** Per installment paid on or before its due date. */
  ON_TIME: 80,
  /** Bonus when the loan is fully repaid. */
  COMPLETE: 200,
} as const;

export function feeFor(principal: Cents): Cents {
  return Math.round(principal * FEE_RATE);
}
