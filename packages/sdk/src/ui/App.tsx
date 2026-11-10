import { defaultRole, useFs } from './context';
import { BorrowerHome, LenderHome } from './screens/Home';
import { Request } from './screens/Request';
import { Offers } from './screens/Offers';
import { Agreement } from './screens/Agreement';
import { Repay } from './screens/Repay';
import { Reward } from './screens/Reward';
import { LenderLoan, Respond } from './screens/Lender';
import { Circle } from './screens/Circle';

/**
 * Picks the screen for the current route. The bottom of the stack is always
 * one of the two homes (borrower or lender); Back from there closes the module. Borrower screens follow the loan's
 * real state, so if the loan moved on (a lender signed, the last payment
 * landed) the user sees the right step instead of a stale one.
 */
export function Screens() {
  const { route, data, role } = useFs();
  const loan = data.myLoan;
  const open = loan && loan.status !== 'repaid' && loan.status !== 'cancelled';

  // Where a stale route falls back to: the home of the role the user is in.
  const Home = role === 'lender' ? LenderHome : BorrowerHome;

  switch (route.name) {
    case 'borrowerHome':
      return <BorrowerHome />;
    case 'lenderHome':
      return <LenderHome />;
    case 'hub':
      // Replaced by a real home right after loading; this covers the first render.
      return defaultRole(data) === 'lender' ? <LenderHome /> : <BorrowerHome />;
    case 'request':
      return open ? <BorrowerStep /> : <Request />;
    case 'offers':
    case 'agreement':
    case 'repay':
      return loan ? <BorrowerStep requested={route.name} /> : <Home />;
    case 'circle':
      return <Circle />;
    case 'reward':
      return loan ? <Reward loan={loan} rewardId={route.rewardId} /> : <Home />;
    case 'respond':
    case 'lender': {
      const incoming = data.incoming.find((l) => l.id === route.loanId);
      if (!incoming) return <Home />;
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
