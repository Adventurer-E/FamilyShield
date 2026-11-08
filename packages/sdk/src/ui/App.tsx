import { useFs } from './context';
import { Hub } from './screens/Hub';
import { RequestEntry } from './screens/Choose';
import { Offers } from './screens/Offers';
import { Agreement } from './screens/Agreement';
import { Repay } from './screens/Repay';
import { Reward } from './screens/Reward';
import { LenderLoan, Respond } from './screens/Lender';

/**
 * Picks the screen for the current route. Borrower screens follow the loan's
 * real state, so if the loan moved on (a lender signed, the last payment
 * landed) the user sees the right step instead of a stale one.
 */
export function Screens() {
  const { route, data } = useFs();
  const loan = data.myLoan;
  const open = loan && loan.status !== 'repaid' && loan.status !== 'cancelled';

  switch (route.name) {
    case 'hub':
      return <Hub />;
    case 'request':
      return open ? <BorrowerStep /> : <RequestEntry />;
    case 'offers':
    case 'agreement':
    case 'repay':
      return loan ? <BorrowerStep requested={route.name} /> : <Hub />;
    case 'reward':
      return loan ? <Reward loan={loan} rewardId={route.rewardId} /> : <Hub />;
    case 'respond':
    case 'lender': {
      const incoming = data.incoming.find((l) => l.id === route.loanId);
      if (!incoming) return <Hub />;
      return route.name === 'respond' && incoming.status === 'collecting' ? <Respond loan={incoming} /> : <LenderLoan loan={incoming} />;
    }
  }
}

function BorrowerStep({ requested }: { requested?: 'offers' | 'agreement' | 'repay' }) {
  const loan = useFs().data.myLoan!;
  switch (loan.status) {
    case 'collecting':
      // The agreement preview is allowed before signing; everything else shows offers.
      return requested === 'agreement' && loan.offers.some((o) => o.accepted) ? <Agreement loan={loan} /> : <Offers loan={loan} />;
    case 'signing':
      return <Agreement loan={loan} />;
    default:
      return <Repay loan={loan} />;
  }
}
