# 5. The data and the back-end

## The data is spreadsheets

There's no database server. All data is **CSV files**: plain-text spreadsheets
you can open in Excel, Google Sheets or VS Code (install *Rainbow CSV*). The full
column-by-column reference is [data/README.md](../../data/README.md); here's
the idea.

| Kind | Files | Who edits |
| --- | --- | --- |
| **Setup**: the world the app runs in | `settings.csv` (fee, limits, terms, points), `people.csv`, `circles.csv`, `rewards.csv`, `auto_replies.csv` | You, by hand |
| **Activity**: what people did | `loans.csv`, `offers.csv`, `agreements.csv`, `installments.csv`, `installment_splits.csv`, `points_log.csv`, `pauses.csv`, `pause_answers.csv`, `claimed_rewards.csv`, `transactions.csv` | The app (you can too) |

### Shared state vs. your copy

- `data/` is **shared** and saved in git. Everyone starts from it.
- `data/local/` is **your personal copy** of the activity files. The server
  writes there, and git ignores it. So your test clicks never show up in a pull
  request, and you never get conflicts with teammates over test data.

| I want to… | Do this |
| --- | --- |
| Start over | Press **Reset functional mockup**, or `npm run data:reset` |
| See what I changed | `npm run data:status` |
| Share a situation with the team (e.g. "a loan one payment from done") | Set it up in the app, then `npm run data:save`, check `git diff data/`, and commit it in a ticket's branch |
| Change a rule, person or reward | Edit the file in `data/` directly and commit it |

## The back-end, in three packages

```
packages/server/src/app.ts        "Which address does what": the list of routes
        │  calls
        ▼
packages/service/src/service.ts   "What an action means": checks who you are, applies the rule,
        │                          moves money, saves. Reads/writes CSVs through database.ts
        │  uses
        ▼
packages/core/src/*.ts            "The rules": pure calculations with no files, no network.
                                   Easiest code to test; heavily tested
```

| File | Read it when you want to… |
| --- | --- |
| `packages/core/src/loan.ts` | Change what's allowed (limits, who can sign when, the schedule, pauses) |
| `packages/core/src/rewards.ts` | Change when rewards unlock |
| `packages/core/src/selectors.ts` | Change a summary number (totals, progress) |
| `packages/core/src/config.ts` | See the rule settings and their defaults |
| `packages/service/src/service.ts` | Change what an action does (who gets money, what's saved, scripted relatives) |
| `packages/service/src/database.ts` | Change a CSV file's columns |
| `packages/service/src/csv.ts` | You probably don't; it reads and writes CSV text |
| `packages/server/src/app.ts` | Add or change a web address (endpoint) |
| `packages/server/src/storage.ts` | Change where files are read and written (`data/` vs `data/local/`) |

The full list of endpoints is in [docs/API.md](../API.md). Try one while the app runs:

```bash
curl localhost:8787/v1/config
curl -H 'Authorization: Bearer alex' localhost:8787/v1/me/loan
```

(`Bearer alex` means "I am Alex". The functional mockup uses the person's id
from `people.csv` instead of a real login.)

## Money is cents in code, dollars in files

Inside the code, $157.50 is the number `15750` (cents) so sums never get
rounding errors. CSV files use dollars (`157.50`) because people edit them.
`database.ts` converts in both directions. In code, `50_000` means $500 (the
`_` is just a readable separator).

## Adding a column

Example: give rewards a booking link, so **Book with Harborline Inn** opens the
partner's site.

1. **Data:** add a `url` column to `data/rewards.csv` and fill it in.
2. **Type:** in `packages/core/src/rewards.ts`, add `url?: string;` to `interface Reward`.
3. **Read it:** in `packages/service/src/database.ts`, function `readRewards`,
   add `url: r.get('url') || undefined,`.
4. **Show it:** in `packages/sdk/src/ui/screens/Reward.tsx`, replace the book
   button with
   `<a className="fs-btn dark" href={reward.url} target="_blank" rel="noreferrer">Book with {reward.partner}</a>`.
5. **Document it:** add the column to the rewards section of `data/README.md`.
6. Run `npm run check`.

Setup tables are only read, so that's all. For an **activity** table (one the
app writes), also add the column to `ACTIVITY_TABLES` and to `writeActivity`
in `database.ts`, and add a round-trip test in `packages/service/test/service.test.ts`.

## Adding an action (endpoint)

Example: let a borrower edit their note while collecting offers.

1. **Rule** (`packages/core/src/loan.ts`): `export function editPurpose(loan, purpose)`,
   which checks the status is `collecting` and returns the updated loan. Add a test.
2. **Service** (`packages/service/src/service.ts`): add
   `editPurpose(userId, loanId, purpose) { return this.mutate(loanId, (l) => editPurpose(l, purpose), this.asBorrower(userId)); }`
3. **Route** (`packages/server/src/app.ts`):
   `route('POST', '/v1/loans/:id/purpose', (c) => service.editPurpose(c.user(), c.params.id!, str(c.body.purpose, 'purpose')));`
4. **API contract** (`packages/sdk/src/api/types.ts`): add `editPurpose(loanId: string, purpose: string): Promise<LoanCase>;`
5. **Both API implementations** must follow the contract. TypeScript tells you
   if one is missing:
   - `packages/sdk/src/api/http.ts`: `editPurpose(loanId, purpose) { return this.call<LoanCase>('POST', `/loans/${…}/purpose`, { purpose }); }`
   - `packages/sdk/src/mockup/browser.ts`: `editPurpose: (id, p) => async(() => service.editPurpose(userId, id, p)),`
6. **Screen:** call `run(() => api.editPurpose(loan.id, text))` from a button.
7. **Docs:** add the endpoint to `docs/API.md`.

Steps 2–5 look repetitive. That's on purpose: each layer has one job, and
the browser mode on GitHub Pages works automatically because it reuses step 2.
