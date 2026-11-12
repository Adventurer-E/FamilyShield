# Architecture

FamilyShield has three parts: the **customer-facing module** (this repo’s
SDK), the **FamilyShield service** (the backend described in [API.md](API.md)),
and the **partner bank**, which owns identity, accounts and money movement.

```
 ┌───────────────── Partner bank app (iOS / Android / web) ──────────────────┐
 │                                                                           │
 │  Bank UI ── "FamilyShield" entry card                                     │
 │      │                                                                    │
 │      ▼                                                                    │
 │  ┌──────────── FamilyShield module (@familyshield/sdk) ────────────┐      │
 │  │  React UI in a shadow root, or the embed page in a WebView      │      │
 │  │  Screens ─► FamilyShieldApi ─► HttpApi                          │      │
 │  │      ▲             │                                            │      │
 │  │      └── HostEvents (close, payment.made, …) to the bank UI     │      │
 │  └────────────────────│────────────────────────────────────────────┘      │
 └───────────────────────│───────────────────────────────────────────────────┘
                         │ HTTPS + short-lived customer token
                         ▼
 ┌──────────────── FamilyShield service ────────────────┐      ┌──────────────┐
 │  REST API (docs/API.md)                              │      │ Partner bank │
 │  @familyshield/core rules (same code as the SDK)     │ ───► │ core ledger  │
 │  Loans DB · audit log · notifications · rewards      │ ◄─── │ / payments   │
 └──────────────────────────────────────────────────────┘      └──────────────┘
```

## Packages

| Package | Role | Depends on |
| --- | --- | --- |
| `@familyshield/core` | Business rules as pure functions over a `LoanCase`; rules are a `Rules` object | nothing |
| `@familyshield/service` | The backend: every API operation over the CSV database | core |
| `@familyshield/server` | Node `http` server exposing the service as the REST API | service, core |
| `@familyshield/sdk` | UI module, API adapters, host bridge, mockup hosts | core, service, React |
| `@familyshield/demo-bank` | Fictional host app (“BlueRiver Bank”) | sdk, core |

The UI, the server and the in-browser backend all import `@familyshield/core`,
so the client preview and the backend’s source of truth can never disagree
about a fee or a due date.

## The mockup backend

```
            ┌────────────── npm run dev ──────────────┐     ┌──────── GitHub Pages ────────┐
 Bank app ─►│ HttpApi ──HTTP──► packages/server       │     │ createBrowserMockup()        │
 (SDK)      │                    │                    │     │   │                          │
            │                    ▼                    │     │   ▼                          │
            │            FamilyShieldService ◄────────┼─────┼─► FamilyShieldService        │
            │                    │ CsvStorage         │     │   │ CsvStorage               │
            │                    ▼                    │     │   ▼                          │
            │  setup: data/*.csv (read)               │     │ data/*.csv bundled at build  │
            │  activity: data/local/*.csv (read+write)│     │                              │
            └─────────────────────────────────────────┘     │ + activity in localStorage   │
                                                            └──────────────────────────────┘
```

- **Every call re-reads the CSVs**, so hand edits take effect immediately.
  At mockup scale (a few hundred rows) this costs well under a millisecond.
- **Two layers.** `data/` is committed: setup tables plus the shared starting
  state of the activity tables. The server writes activity only to
  `data/local/`, a git-ignored working copy seeded from `data/`. Testing
  therefore never produces diffs or merge conflicts. Sharing a state is a
  deliberate `npm run data:save` and commit. In browser mode, localStorage plays
  the working-copy role.
- **Setup tables are never written** by the app; only activity tables are.
  Writes go to a temp file that is then renamed into place, so a crash can’t
  leave a half-written CSV.
- **Scripted relatives** (`auto_replies.csv`) are evaluated from timestamps
  (“reply 2.5 s after the request was created”), not stored timers, so
  restarting the server or reloading the page loses nothing. Hosts call
  `service.tick()` every 500 ms.
- **The seam for production** is the `CsvStorage` interface (`read()` /
  `write()`). A real deployment replaces it, and the CSV mapping, with a
  database repository; the service’s operations and the core rules stay.
- Mockup authentication is `Authorization: Bearer <person id>`. It stands in
  for the bank-minted tokens described in INTEGRATION.md.

## The loan lifecycle

```
            respondToRequest (each member, privately)
            setOfferAccepted (borrower)
                    │
 createLoanCase ─► collecting ──signAsBorrower──► signing ──signAsLender (all)──► active ──recordPayment (last)──► repaid
                    │                                                              │  ▲
                    └─cancelRequest─► cancelled                     requestPause ──┘  └── respondToPause (all approve → shift 1 month)
```

Rules worth knowing:

- Signing closes the request: members who haven’t answered become `expired`.
- The borrower can’t accept more than they asked for.
- Each agreement carries its own fee: `fee = round(principal × 5%)`, and the
  borrower repays `principal + fee`.
- The schedule splits each lender’s principal and the total fee evenly across
  the term, cent-exact. The first payment is due one month after funding.
- Points: +100 per lender at funding, +80 per on-time payment, +200 at repayment.
- Rewards: `available` only when **status is `repaid` and points ≥ threshold**.
- One pause per loan. Every lender must approve; any decline ends the request.

## Where money moves (and where it doesn’t)

The UI module **never** moves money. Signing and paying are API calls; the
FamilyShield service validates them with core rules and then instructs the
bank, which debits and credits accounts through its own rails.

- At **funding** (the last lender signs), the bank debits each lender’s principal
  and credits the borrower.
- At **each payment**, the bank debits the borrower’s installment, credits each
  lender their part, and credits FamilyShield the fee portion.

In the mockup, the service simulates exactly these ledger
postings (`settle()` in `packages/service/src/service.ts`) as rows in
`data/transactions.csv`, which is why BlueRiver’s balances move.

`HostEvent`s such as `loan.funded` and `payment.made` are **UI hints**, so the
host can refresh balances or show a toast. They must never trigger money
movement on their own.

## Privacy model

The service, not the UI, enforces what each customer can see. For a lender,
`getIncoming()` returns the loan **redacted** (see `redactForLender`):

- `offers`: only their own
- `agreements`: only their own
- `schedule[].parts` and `amount`: only their own share
- `pause.approvals`: only their own answer

The borrower sees every offer on their own request. Nobody sees another
member’s decline.

## Front-end design decisions

- **Shadow DOM isolation.** Bank CSS can’t break the module, and the module
  can’t leak styles into the bank. Theming goes through `--fs-*` CSS custom
  properties generated from `Theme`.
- **State-following routes.** Borrower screens render from the loan’s real
  status (`BorrowerStep` in `ui/App.tsx`), so a stale screen fixes itself
  when a lender signs elsewhere.
- **One data hook.** `FamilyShieldProvider` loads profile, own loan and incoming
  requests, re-fetches on `api.subscribe()`, and wraps every action in
  `run()`, which handles the busy state and turns errors into friendly text.
- **Accessibility.** Real buttons and labels, `aria-pressed` and `radio`
  semantics, progress bars with values, 44px+ touch targets, and reduced-motion support.
