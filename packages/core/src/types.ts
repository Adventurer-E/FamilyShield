import type { Cents } from './money';
import type { IsoDate, IsoTimestamp } from './dates';
import type { TermMonths } from './config';

export type PersonId = string;

export interface Person {
  id: PersonId;
  firstName: string;
  lastName: string;
  /** How the signed-in user refers to this person, e.g. "Mom". Optional. */
  nickname?: string;
}

export type Reason = 'car' | 'medical' | 'job' | 'other';

export type OfferStatus = 'pending' | 'offered' | 'declined' | 'expired';

/** One per circle member asked. Only the borrower sees every offer. */
export interface Offer {
  memberId: PersonId;
  status: OfferStatus;
  amount: Cents;
  note?: string;
  accepted: boolean;
  respondedAt?: IsoTimestamp;
}

/** One plain-language agreement per lender, visible only to that pair. */
export interface Agreement {
  lenderId: PersonId;
  principal: Cents;
  /** Interest is 0% by default; kept explicit for future products. */
  interestRate: number;
  fee: Cents;
  /** principal + fee */
  total: Cents;
  borrowerSignedAt?: IsoTimestamp;
  lenderSignedAt?: IsoTimestamp;
}

export interface InstallmentPart {
  /** A lender's id, or 'fee' for the FamilyShield service fee. */
  to: PersonId | 'fee';
  amount: Cents;
}

export interface Installment {
  index: number;
  dueDate: IsoDate;
  amount: Cents;
  parts: InstallmentPart[];
  paidAt?: IsoTimestamp;
  onTime?: boolean;
}

export type PauseStatus = 'pending' | 'approved' | 'declined';

export interface PauseRequest {
  status: PauseStatus;
  requestedAt: IsoTimestamp;
  /** lenderId → true (approved), false (declined), null (not answered yet) */
  approvals: Record<PersonId, boolean | null>;
}

export interface PointsEntry {
  at: IsoTimestamp;
  points: number;
  reason: 'help' | 'on-time' | 'complete';
  label: string;
}

/**
 * collecting → (borrower signs) → signing → (all lenders sign) → active
 *            → (last installment) → repaid
 * A request may also be cancelled while collecting.
 */
export type LoanStatus = 'collecting' | 'signing' | 'active' | 'repaid' | 'cancelled';

export interface LoanCase {
  id: string;
  borrowerId: PersonId;
  reason: Reason;
  purpose: string;
  amount: Cents;
  months: TermMonths;
  status: LoanStatus;
  createdAt: IsoTimestamp;
  offers: Offer[];
  agreements: Agreement[];
  schedule: Installment[];
  fundedAt?: IsoTimestamp;
  repaidAt?: IsoTimestamp;
  points: number;
  pointsLog: PointsEntry[];
  pause: PauseRequest | null;
  pausesUsed: number;
  /** rewardId → claim code */
  claimedRewards: Record<string, string>;
}
