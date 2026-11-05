import type { AppConfig, CreateRequestInput, LenderResponse, LoanCase, Profile } from '@familyshield/core';

export type { AppConfig, CreateRequestInput, Profile };

/**
 * The contract between the FamilyShield UI and a backend. Every call is made
 * on behalf of ONE signed-in user (the bank customer), so the backend can
 * enforce privacy: a borrower sees all offers on their request, while a
 * lender only sees the request and their own answer and agreement.
 *
 * Two implementations ship with the SDK:
 *  - `HttpApi`: talks to a FamilyShield backend over HTTP (docs/API.md), e.g.
 *    the functional-mockup server in packages/server
 *  - `createBrowserMockup().apiFor(userId)`: the same backend logic running
 *    in the browser, over CSV files kept in localStorage
 */
export interface FamilyShieldApi {
  /** Rules (fee, limits, terms, points) and the reward catalog the backend runs with. */
  getConfig(): Promise<AppConfig>;
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
