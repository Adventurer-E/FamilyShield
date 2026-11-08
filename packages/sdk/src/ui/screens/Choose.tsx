import { useState } from 'react';
import { feeLabel } from '@familyshield/core';
import { useFs } from '../context';
import { Button, Notice, Screen } from '../kit';
import { Request } from './Request';

/**
 * Experiment arm B (M5, hypothesis #8): will borrowers pay the service fee for
 * what FamilyShield adds when a free, informal loan is right there?
 *
 * When settings.csv has show_free_option = yes (or the link has
 * ?free_option=yes), starting a request first shows a choice between
 * FamilyShield and arranging it yourselves. Choosing FamilyShield continues to
 * the normal request screen; choosing the free option ends on a short screen.
 * With the setting off (arm A), the request screen opens directly, as before.
 */
export function RequestEntry() {
  const { rules } = useFs().data.config;
  const [choice, setChoice] = useState<'undecided' | 'familyshield' | 'informal'>('undecided');

  if (!rules.showFreeOption || choice === 'familyshield') return <Request />;
  if (choice === 'informal') return <ArrangedInformally />;
  return <Choose onFamilyShield={() => setChoice('familyshield')} onInformal={() => setChoice('informal')} />;
}

function Choose(props: { onFamilyShield: () => void; onInformal: () => void }) {
  const { rules } = useFs().data.config;
  // Which option sits first is random for each participant, so position doesn't sway the choice.
  const [familyShieldFirst] = useState(() => Math.random() < 0.5);
  const fee = feeLabel(rules);

  const familyShield = (
    <section key="familyshield" className="fs-card fs-stack" style={{ gap: 10 }} aria-labelledby="fs-choice-fs">
      <h2 id="fs-choice-fs" className="fs-h3">FamilyShield · {fee} service fee</h2>
      <ul className="fs-small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
        <li>A signed agreement with each relative: 0% interest and a fixed schedule</li>
        <li>Automatic repayments from your account, split between lenders</li>
        <li>Automatic reminders, so nobody has to chase anyone</li>
        <li>One private request to pause a month if life gets hard again</li>
        <li>A one-time {fee} fee, added to what you repay</li>
      </ul>
      <Button onClick={props.onFamilyShield}>Use FamilyShield</Button>
    </section>
  );

  const informal = (
    <section key="informal" className="fs-card fs-stack" style={{ gap: 10 }} aria-labelledby="fs-choice-free">
      <h2 id="fs-choice-free" className="fs-h3">Arrange it yourselves · free</h2>
      <ul className="fs-small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
        <li>No fee and no paperwork</li>
        <li>You ask your relatives directly</li>
        <li>You agree on repayment between yourselves</li>
      </ul>
      <Button variant="secondary" onClick={props.onInformal}>Arrange it myself</Button>
    </section>
  );

  return (
    <Screen title="How do you want to borrow from family?">
      <p className="fs-small fs-muted" style={{ margin: 0 }}>Both are fine. Pick the one that fits you.</p>
      {familyShieldFirst ? [familyShield, informal] : [informal, familyShield]}
    </Screen>
  );
}

function ArrangedInformally() {
  const { back } = useFs();
  return (
    <Screen title="You chose to arrange it yourselves">
      <Notice kind="info">No request was sent and nothing was shared with your circle. You can reach out to your relatives directly.</Notice>
      <Button variant="secondary" onClick={back}>Done</Button>
    </Screen>
  );
}
