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

`message` is written for end users; the SDK shows it as is.

## Endpoints

### Reading

| Method & path | Returns | Notes |
| --- | --- | --- |
| `GET /config` | `AppConfig` | `{ rules, reasons, rewards }`: the fee, limits, terms, request defaults (`defaultAmount`, `defaultTerm`), lender quick-pick amounts (`offerAmounts`), points, the request reasons with their pre-filled descriptions, and the reward catalog in force (from `settings.csv`, `reasons.csv` and `rewards.csv` in the mockup). No auth needed |
| `GET /me` | `Profile` | The caller, their circle, the people they may see, and their linked account |
| `GET /me/loan` | `LoanCase \| null` | The caller’s latest loan as borrower (excluding cancelled) |
| `GET /me/incoming` | `LoanCase[]` | Requests the caller was asked on, **redacted** for a lender, newest first |

### Borrower actions

| Method & path | Body | Core function |
| --- | --- | --- |
| `POST /loans` | `{ reason, purpose, amount, months }` | `createLoanCase`; fails if the caller already has an open loan |
| `POST /loans/:id/cancel` | — | `cancelRequest` |
| `POST /loans/:id/offers/:memberId/acceptance` | `{ accepted: boolean }` | `setOfferAccepted` |
| `POST /loans/:id/sign` | — | `signAsBorrower` |
| `POST /loans/:id/payments` | — | `recordPayment`: collects the next installment via the bank |
| `POST /loans/:id/pause` | — | `requestPause` |
| `POST /loans/:id/pause/cancel` | — | `cancelPause` |
| `POST /loans/:id/rewards/:rewardId/claim` | — | `claimReward`: the service gets a code from the partner |

### Lender actions

| Method & path | Body | Core function |
| --- | --- | --- |
| `POST /loans/:id/responses` | `{ kind: 'offer', amount, note? }` or `{ kind: 'decline', note? }` | `respondToRequest` |
| `POST /loans/:id/lender-signature` | — | `signAsLender`; the last signature triggers funding |
| `POST /loans/:id/pause/responses` | `{ approve: boolean }` | `respondToPause` |

### Functional mockup only

These stand in for the bank’s own systems and are **not** part of the production contract.

| Method & path | Returns | Notes |
| --- | --- | --- |
| `GET /mockup/people` | `MockupPerson[]` | Everyone in `people.csv`, for the “Viewing as” menu |
| `GET /mockup/accounts/:userId` | `AccountSummary` | `{ balance, transactions, exampleTransactions }`: the opening balance plus `transactions.csv`, and the everyday bank activity from `example_transactions.csv` (display only, not counted in the balance) |
| `POST /mockup/reset` | `204` | Empties every activity table (setup tables untouched) |

If a CSV can’t be read, every call returns `500` with
`{ "error": { "code": "DATA_ERROR", "message": "people.csv, line 3, column \"opening_balance\": …" } }`.

### Try it with curl

```bash
npm run dev:server
curl localhost:8787/v1/config
curl -H 'Authorization: Bearer alex' localhost:8787/v1/me
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
