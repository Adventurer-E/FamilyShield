import { REWARDS, addMonths, formatDate, rewardStatus } from '@familyshield/core';
import type { LoanCase } from '@familyshield/core';
import { useFs } from '../context';
import { Button, Notice, Screen, Terms } from '../kit';

export function Reward({ loan, rewardId }: { loan: LoanCase; rewardId: string }) {
  const { api, run, emit, nameOf } = useFs();
  const reward = REWARDS.find((r) => r.id === rewardId);
  if (!reward) return null;
  const status = rewardStatus(loan, reward);
  const code = loan.claimedRewards[reward.id];
  const unlockedOn = (loan.repaidAt ?? new Date().toISOString()).slice(0, 10);
  const helpers = loan.agreements.map((a) => nameOf(a.lenderId));

  const claim = async () => {
    const after = await run(() => api.claimReward(loan.id, reward.id));
    if (after) emit({ type: 'reward.claimed', loanId: loan.id, rewardId: reward.id, partner: reward.partner });
  };

  return (
    <Screen title={reward.name} eyebrow="FamilyShield rewards">
      <section className="fs-card soft">
        <div className="fs-tiny" style={{ fontWeight: 800, letterSpacing: '.06em', color: '#3B4659' }}>
          PARTNER OFFER · {reward.partner.toUpperCase()}
        </div>
        <h2 className="fs-h2" style={{ fontSize: 28 }}>{reward.headline}</h2>
        <p className="fs-small" style={{ margin: 0, color: '#3B4659' }}>{reward.detail}</p>
        <div className="fs-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="fs-pill" style={{ background: '#fff' }}>{reward.threshold.toLocaleString('en-US')} pts reward</span>
          <span className="fs-pill" style={{ background: '#fff' }}>Unlocked {formatDate(unlockedOn)}</span>
        </div>
      </section>

      <section className="fs-card flush">
        <Terms
          rows={[
            ['Who can use it', `You, ${helpers.join(' and ')}: one shared booking`],
            ['Valid until', formatDate(addMonths(unlockedOn, reward.validForMonths))],
            ['Terms', reward.terms],
          ]}
        />
      </section>

      {code ? (
        <>
          <div className="fs-code">
            <div className="fs-tiny fs-muted" style={{ fontWeight: 800, letterSpacing: '.06em' }}>YOUR FAMILY CODE</div>
            <strong>{code}</strong>
            <div className="fs-small" style={{ color: '#3B4659' }}>Shared with {helpers.join(' and ')} in FamilyShield</div>
          </div>
          <Button variant="dark">Book with {reward.partner}</Button>
        </>
      ) : (
        <Button disabled={status !== 'available'} onClick={claim}>
          Claim offer for my family
        </Button>
      )}

      <Notice kind="info">
        The discount is funded by {reward.partner}, not by your bank or family. When you book through this offer, {reward.partner} pays
        FamilyShield a referral fee. It never adds to your price.
      </Notice>
    </Screen>
  );
}
