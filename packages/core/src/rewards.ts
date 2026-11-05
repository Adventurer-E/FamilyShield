import type { IsoTimestamp } from './dates';
import { invariant } from './errors';
import type { LoanCase } from './types';

/**
 * Third-party partner offers. Partners fund the discount and pay FamilyShield
 * a referral commission on bookings. Offers unlock only when the loan is fully
 * repaid AND the circle's points have reached the threshold.
 *
 * The partners below are placeholders for the demo.
 */
export interface Reward {
  id: string;
  name: string;
  shortLabel: string;
  threshold: number;
  category: string;
  partner: string;
  headline: string;
  detail: string;
  terms: string;
  /** How long the offer stays valid after the loan is repaid. */
  validForMonths: number;
}

export const REWARDS: readonly Reward[] = [
  {
    id: 'dinner',
    name: 'Family dinner',
    shortLabel: 'DIN',
    threshold: 500,
    category: 'Partner restaurants',
    partner: 'Juniper Table',
    headline: '25% off a family dinner',
    detail: 'A family-style dinner for up to 6 at any Juniper Table location. Celebrate together.',
    terms: 'Sunday to Thursday only. One use per family. Alcohol excluded.',
    validForMonths: 3,
  },
  {
    id: 'trip',
    name: 'Weekend trip',
    shortLabel: 'TRIP',
    threshold: 1000,
    category: 'Partner hotels',
    partner: 'Harborline Inn',
    headline: '20% off a weekend stay',
    detail: 'Two nights for the whole circle at any Harborline Inn, breakfast included.',
    terms: 'Up to 3 rooms on one booking. Blackout dates apply.',
    validForMonths: 3,
  },
  {
    id: 'activity',
    name: 'Group activity',
    shortLabel: 'FUN',
    threshold: 1500,
    category: 'Local experiences',
    partner: 'Summit Climb Co.',
    headline: 'Free group session for 4',
    detail: 'An instructor-led climbing session for four, plus 15% off for anyone else who joins.',
    terms: 'Ages 8+. Reserve 48 hours ahead.',
    validForMonths: 3,
  },
];

export type RewardStatus =
  /** Not enough points yet. */
  | 'locked'
  /** Enough points, but the loan isn't fully repaid yet. */
  | 'awaiting-repayment'
  | 'available'
  | 'claimed';

export function getReward(id: string): Reward {
  const reward = REWARDS.find((r) => r.id === id);
  invariant(reward, 'NOT_FOUND', 'That reward doesn’t exist.');
  return reward;
}

export function rewardStatus(loan: LoanCase, reward: Reward): RewardStatus {
  if (loan.claimedRewards[reward.id]) return 'claimed';
  if (loan.points < reward.threshold) return 'locked';
  if (loan.status !== 'repaid') return 'awaiting-repayment';
  return 'available';
}

export function pointsToGo(loan: LoanCase, reward: Reward): number {
  return Math.max(0, reward.threshold - loan.points);
}

export function claimReward(loan: LoanCase, rewardId: string, code: string, _now: IsoTimestamp): LoanCase {
  const reward = getReward(rewardId);
  const status = rewardStatus(loan, reward);
  invariant(status !== 'claimed', 'INVALID_STATE', 'Your family already claimed this offer.');
  invariant(status === 'available', 'INVALID_STATE', 'This offer unlocks when the loan is fully repaid.');
  const next = structuredClone(loan);
  next.claimedRewards[rewardId] = code;
  return next;
}
