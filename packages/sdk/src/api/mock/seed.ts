import type { LenderResponse, LoanCase, Person, PersonId } from '@familyshield/core';

/** The demo family from the deck. All names are fictional. */
export const DEMO_PEOPLE: Person[] = [
  { id: 'alex', firstName: 'Alex', lastName: 'Chen' },
  { id: 'mom', firstName: 'Grace', lastName: 'Chen' },
  { id: 'maya', firstName: 'Maya', lastName: 'Lin' },
  { id: 'lisa', firstName: 'Lisa', lastName: 'Park' },
];

/** Who is in whose trusted circle. */
export const DEMO_CIRCLES: Record<PersonId, PersonId[]> = {
  alex: ['mom', 'maya', 'lisa'],
  mom: ['alex', 'lisa'],
};

/** How each viewer refers to the people they know. */
export const DEMO_NICKNAMES: Record<PersonId, Record<PersonId, string>> = {
  alex: { mom: 'Mom', maya: 'Cousin Maya', lisa: 'Aunt Lisa' },
  mom: { alex: 'Alex', lisa: 'Lisa' },
};

/**
 * Family members the mock plays automatically, so one person can demo the
 * whole flow. Anyone NOT listed here (Mom, in the demo) waits for a real
 * person to answer, by switching users in the demo bank.
 */
export interface ScriptedPersona {
  /** Delay after a request is created before this person answers. */
  respondAfterMs: number;
  respond: (loan: LoanCase) => LenderResponse;
  /** Sign the agreement automatically once the borrower has signed. */
  autoSign: boolean;
  /** Approve pause requests automatically. */
  autoApprovePause: boolean;
}

export const DEMO_SCRIPTED: Record<PersonId, ScriptedPersona> = {
  maya: {
    respondAfterMs: 2_500,
    respond: (loan) => ({ kind: 'offer', amount: Math.min(50_000, loan.amount), note: 'You’ve got this. Shout if you need more.' }),
    autoSign: true,
    autoApprovePause: true,
  },
  lisa: {
    respondAfterMs: 4_500,
    respond: () => ({ kind: 'decline', note: 'Wish I could right now. Thinking of you.' }),
    autoSign: true,
    autoApprovePause: true,
  },
};

/** Opening balances for the demo bank accounts, in cents. */
export const DEMO_BALANCES: Record<PersonId, number> = {
  alex: 432_850,
  mom: 1_864_210,
};
