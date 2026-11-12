# FamilyShield service API (v1)

This is the contract `HttpApi` (`packages/sdk/src/api/http.ts`) expects.
`packages/server` implements it for the functional mockup, on top of the CSV
files in `data/`; a production service would implement the same contract on a
real database.

- Base URL: `https://api.familyshield.example/v1`
- Auth: `Authorization: Bearer <short-lived customer token>` on every call
  (see [INTEGRATION.md](INTEGRATION.md#1-authentication)). In the functional
  mockup the token is simply a person’s `id` from `data/people.csv`, e.g.
  `Bearer alex`.
- Bodies: JSON. Money is **integer cents**. Dates are ISO strings.
- Every `POST` that changes a loan returns the updated `LoanCase`, redacted
  for the caller.

## Types

`LoanCase`, `Offer`, `Agreement`, `Installment` and `PauseRequest` are defined
in `packages/core/src/types.ts`. `Profile` is defined in
`packages/sdk/src/api/types.ts`.

## Errors

```json
{ "error": { "code": "INVALID_STATE", "message": "This request has already been signed." } }
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `INVALID_INPUT` | 400 | A value is out of range (amount, term, note length…) |
| `FORBIDDEN` | 403 | The caller isn’t the borrower or a lender on this loan |
| `NOT_FOUND` | 404 | No such loan, member or reward |
| `INVALID_STATE` | 409 | The action doesn’t fit the loan’s current status |
| `LIMIT_REACHED` | 409 | E.g. the pause was already used |
| `NOT_ELIGIBLE` | 403 | The caller may not do this right now, e.g. offer to lend while their own loan is overdue (see `GET /me/eligibility`) |

`message` is written for end users; the SDK shows it as is.

## Endpoints

### Reading

| Method & path | Returns | Notes |
| --- | --- | --- |
| `GET /config` | `AppConfig` | `{ rules, reasons, rewards }`: the fee, limits, terms, request defaults (`defaultAmount`, `defaultTerm`), lender quick-pick amounts (`offerAmounts`), points, the request reasons with their pre-filled descriptions, and the reward catalog in force (from `settings.csv`, `reasons.csv` and `rewards.csv` in the mockup). No auth needed |
| `GET /me` | `Profile` | The caller, their circle, the people they may see, and their linked account |
| `GET /me/loan` | `LoanCase \| null` | The caller’s latest loan as borrower (excluding cancelled) |
| `GET /me/incoming` | `LoanCase[]` | Requests the caller was asked on, **redacted** for a lender, newest first |
| `GET /me/eligibility` | `Eligibility` | What the caller may do now: `{ today, eligible, blocks: [{ code, message }], overdue, lending }`. See “Who may start a request” below |

### Trusted circle

Each person manages their own circle. Every call returns the caller’s circle
as it now stands: `Person[]`, the same shape as `Profile.circle`
(`{ id, firstName, lastName, nickname? }`).

| Method & path | Body | Notes |
| --- | --- | --- |
| `GET /me/circle` | — | The caller’s circle, in the order members were added |
| `POST /me/circle` | `{ contact, nickname?, name? }` | Add someone by the **email or phone** they bank with (`contact`; a US phone number, 10 digits; case, spaces and phone punctuation don't matter). If nobody has it yet, a new FamilyShield account is created for it (in `new_people.csv`), named `name` if given. Fails with `INVALID_INPUT` for an empty or unreadable contact, yourself, someone already in the circle, or a nickname/name that's too long. *Short-term:* later the new person gets an invitation link, and eventually is only added after verifying their bank account |
| `POST /me/circle/:memberId/nickname` | `{ nickname }` | Rename how the caller refers to a member. A blank nickname clears it |
| `POST /me/circle/:memberId/remove` | — | Take a member out of the circle |

Rules:

- Nicknames are trimmed, inner spaces are collapsed, and they may be up to 40
  characters.
- A request goes to whoever is in the borrower’s circle **when it is created**.
  Adding someone later doesn’t add them to a request that is already open.
- Removing someone withdraws their offer on the caller’s request that is still
  `collecting`: an unanswered or made offer becomes `expired` and
  un-accepted, so it can’t be accepted or signed. A decline stays a decline.
  Once the borrower has signed, the agreements stand and the loan is
  unchanged (`withdrawMember` in `packages/core/src/loan.ts`).
- Removing someone only changes the caller’s circle, never theirs.

### Borrower actions

| Method & path | Body | Core function |
| --- | --- | --- |
| `POST /loans` | `{ reason, purpose, amount, months }` | `createLoanCase`; fails with `NOT_ELIGIBLE` if the caller may not start a request (below) |
| `POST /loans/:id/cancel` | — | `cancelRequest` |
| `POST /loans/:id/offers/:memberId/acceptance` | `{ accepted: boolean }` | `setOfferAccepted` |
| `POST /loans/:id/sign` | — | `signAsBorrower` |
| `POST /loans/:id/payments` | — | `recordPayment`: collects the next installment via the bank |
| `POST /loans/:id/pause` | — | `requestPause` |
| `POST /loans/:id/pause/cancel` | — | `cancelPause` |
| `POST /loans/:id/rewards/:rewardId/claim` | — | `claimReward`: the service gets a code from the partner |

#### Who may start a request

`checkEligibility` in `packages/core/src/eligibility.ts`. Each rule that blocks
the caller is one entry in `blocks`, most important first; `POST /loans`
refuses with the first one's message.

| `code` | Blocks when | Setting (`settings.csv`) |
| --- | --- | --- |
| `overdue` | A payment on their own loan is overdue (below) | `overdue_grace_days` |
| `open-loan` | The caller already has a request or loan that isn't repaid or cancelled (one at a time, as before) | — |

`Eligibility` also carries `today` (the bank's date), `overdue` and `lending`.

#### Customers who aren't repaying

`overdueOf` in `packages/core/src/overdue.ts`. An installment is **overdue**
when it is still unpaid more than `overdue_grace_days` days after its due
date. `Eligibility.overdue` is then `{ installments, amount, since, daysLate }`
(what it takes to catch up), and while it lasts:

- the customer can't start a request (`overdue` block, above);
- they can't **offer** to lend: `Eligibility.lending` is
  `{ allowed: false, message }` and `POST /loans/:id/responses` with
  `kind: 'offer'` fails with `NOT_ELIGIBLE`. Declining is always allowed.

Paying clears it: each payment goes to the oldest unpaid installment.

### Lender actions

| Method & path | Body | Core function |
| --- | --- | --- |
| `POST /loans/:id/responses` | `{ kind: 'offer', amount, note? }` or `{ kind: 'decline', note? }` | `respondToRequest` |
| `POST /loans/:id/lender-signature` | — | `signAsLender`; the last signature triggers funding |
| `POST /loans/:id/pause/responses` | `{ approve: boolean }` | `respondToPause` |

### Bank staff

For the partner bank's staff, not customers. In production these sit behind
the bank's own staff sign-in and are never reachable with a customer token;
the functional mockup has no staff sign-in.

| Method & path | Returns | Notes |
| --- | --- | --- |
| `GET /bank/dashboard` | `BankDashboard` | Activity and risk figures across every loan, as of the bank's date (`bankDashboard` in `packages/core/src/dashboard.ts`): `customers` (borrowers, lenders, restricted), `requests` (total and by status), `money` (requested, funded, repaid to lenders, outstanding, fees collected and contracted), `payments` (made, on time, late, on-time rate), `overdue` (loans, amount to catch up, principal at risk), `loans`: one row per request that wasn't cancelled, overdue first, and `people`: **every** customer (circle size, their latest request or loan and what's left to repay, what they lent and are still owed, overdue), restricted first. Amounts in cents |

The bank sees its customers' names, amounts, status and payment history, but
not what a request was for or the notes family members wrote to each other.

### Functional mockup only

These stand in for the bank’s own systems and are **not** part of the production contract.

| Method & path | Returns | Notes |
| --- | --- | --- |
| `GET /mockup/people` | `MockupPerson[]` | Everyone in `people.csv`, for the “Viewing as” menu |
| `GET /mockup/accounts/:userId` | `AccountSummary` | `{ balance, transactions, exampleTransactions }`: the opening balance plus `transactions.csv`, and the everyday bank activity from `example_transactions.csv` (display only, not counted in the balance) |
| `GET /mockup/clock` | `MockupClock` | `{ today, daysAhead }`: the date the mockup is on |
| `POST /mockup/clock/skip` | `MockupClock` | Body `{ days }` (1–366). Moves the mockup's calendar forward so due dates pass and unpaid payments become overdue. Kept in `mockup_clock.csv` |
| `POST /mockup/reset` | `204` | Puts every activity table, circles included, back to the shared starting state (setup tables untouched); the calendar goes back to today |

If a CSV can’t be read, every call returns `500` with
`{ "error": { "code": "DATA_ERROR", "message": "people.csv, line 3, column \"opening_balance\": …" } }`.

### Try it with curl

```bash
npm run dev:server
curl localhost:8787/v1/config
curl -H 'Authorization: Bearer alex' localhost:8787/v1/me
curl -X POST -H 'Authorization: Bearer maya' -H 'Content-Type: application/json' \
     -d '{"contact":"lisa.park@example.com","nickname":"Aunt Lisa"}' localhost:8787/v1/me/circle
curl -X POST -H 'Authorization: Bearer alex' -H 'Content-Type: application/json' \
     -d '{"reason":"car","purpose":"Car repair","amount":150000,"months":10}' localhost:8787/v1/loans
cat data/loans.csv
```

## Server responsibilities beyond the core rules

- **Idempotency:** accept an `Idempotency-Key` header on every `POST`. Payments
  and signatures must never apply twice.
- **Transactions:** load the loan, apply the core function, and persist with an
  optimistic version check, all in one transaction.
- **Money movement:** on funding and on each payment, instruct the bank’s
  ledger (see ARCHITECTURE.md) and record the bank’s confirmation before
  marking the step done.
- **Redaction:** never return another member’s offer, agreement, payout or pause answer to a lender.
- **Audit log:** append-only record of every state change, with actor and timestamp.
- **Notifications:** notify circle members on new requests, lenders on
  signatures and pauses, and borrowers before each due date.
- **Change feed:** `HttpApi` polls every 5 seconds by default. A push channel
  (SSE or WebSocket) can replace polling later without changing the UI.
