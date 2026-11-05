import type { Cents, LenderResponse, LoanCase, Person, Reason } from '@familyshield/core';

/**
 * The contract between the FamilyShield UI and a backend. Every call is made
 * on behalf of ONE signed-in user (the bank customer), so the backend can
 * enforce privacy: a borrower sees all offers on their request, while a
 * lender only sees the request and their own answer and agreement.
 *
 * Two implementations ship with the SDK:
 *  - `createMockBackend().apiFor(userId)`: in-browser, for demos and tests
 *  - `HttpApi`: talks to the FamilyShield service (see docs/API.md)
 */
export interface FamilyShieldApi {
  getProfile(): Promise<Profile>;
  /** The signed-in user's most recent loan as borrower, or null. */
  getMyLoan(): Promise<LoanCase | null>;
  /**
   * Requests from people in my circle that I was asked about. The backend
   * returns them redacted: other members' offers are removed.
   */
  getIncoming(): Promise<LoanCase[]>;

  // Borrower
  createRequest(input: CreateRequestInput): Promise<LoanCase>;
  cancelRequest(loanId: string): Promise<LoanCase>;
  setOfferAccepted(loanId: string, memberId: string, accepted: boolean): Promise<LoanCase>;
  signAsBorrower(loanId: string): Promise<LoanCase>;
  makePayment(loanId: string): Promise<LoanCase>;
  requestPause(loanId: string): Promise<LoanCase>;
  cancelPause(loanId: string): Promise<LoanCase>;
  claimReward(loanId: string, rewardId: string): Promise<LoanCase>;

  // Lender
  respond(loanId: string, response: LenderResponse): Promise<LoanCase>;
  signAsLender(loanId: string): Promise<LoanCase>;
  respondToPause(loanId: string, approve: boolean): Promise<LoanCase>;

  /** Called whenever anything this user can see may have changed. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export interface Profile {
  me: Person;
  /** The people in my trusted circle. */
  circle: Person[];
  /** Everyone I may see a name for: my circle plus borrowers who asked me. */
  people: Person[];
  /** The bank account FamilyShield pays into and collects from. */
  account: { id: string; label: string };
}

export interface CreateRequestInput {
  reason: Reason;
  purpose: string;
  amount: Cents;
  months: number;
}
