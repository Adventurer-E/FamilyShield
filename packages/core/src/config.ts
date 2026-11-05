import type { Cents } from './money';

/**
 * The business rules. In the functional mockup they come from
 * data/settings.csv, so they can be tuned without touching code; these
 * defaults match the FamilyShield deck and are used when nothing else is given.
 */
export interface Rules {
  /** One-time service fee charged to the borrower, added to what they repay. */
  feeRate: number;
  /** Request limits, in cents. */
  amountMin: Cents;
  amountMax: Cents;
  amountStep: Cents;
  /** Repayment terms a borrower can choose, in months. */
  terms: number[];
  /** Where the request screen starts: amount in cents, term in months. */
  defaultAmount: Cents;
  defaultTerm: number;
  /** Quick-pick amounts a lender sees when making an offer, in cents. */
  offerAmounts: Cents[];
  /** How many one-month pauses a borrower may ask for over a loan's life. */
  maxPauses: number;
  /** Family points. Points belong to the whole circle on a loan, not one person. */
  points: {
    /** Per family member who funds the loan, awarded when the loan goes live. */
    help: number;
    /** Per installment paid on or before its due date. */
    onTime: number;
    /** Bonus when the loan is fully repaid. */
    complete: number;
  };
}

export const DEFAULT_RULES: Rules = {
  feeRate: 0.05,
  amountMin: 50_000, // $500
  amountMax: 500_000, // $5,000
  amountStep: 25_000, // $250
  terms: [6, 10, 12],
  defaultAmount: 150_000, // $1,500
  defaultTerm: 10,
  offerAmounts: [25_000, 50_000, 100_000], // $250, $500, $1,000
  maxPauses: 1,
  points: { help: 100, onTime: 80, complete: 200 },
};

export function feeFor(principal: Cents, rules: Rules = DEFAULT_RULES): Cents {
  return Math.round(principal * rules.feeRate);
}

/** "5%" style label for UI copy. */
export function feeLabel(rules: Rules = DEFAULT_RULES): string {
  return `${+(rules.feeRate * 100).toFixed(2)}%`;
}
