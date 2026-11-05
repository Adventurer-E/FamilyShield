# FamilyShield

[![CI](https://github.com/Adventurer-E/familysheild/actions/workflows/ci.yml/badge.svg)](https://github.com/Adventurer-E/familysheild/actions/workflows/ci.yml)

**Family support for life’s shocks, built into the banking app people already use.**

FamilyShield is an embeddable module for banks and credit unions. When a customer
is hit by a car repair, a medical bill or a lost job, they can ask their trusted
family circle for help privately, receive private offers, sign clear
interest-free terms, and repay automatically, all without leaving their bank’s app.

**▶ [Try the live functional mockup](https://adventurer-e.github.io/FamilyShield/)**: no install needed. It runs entirely in your browser.
Every pull request also gets its own preview link, posted as a comment on the pull request.

> **Status:** working prototype. Every person, bank, partner and dollar in this
> repository is fictional.

---

## Part 1 · What FamilyShield is

### The problem

Most families already lend each other money in a crisis. It just happens
informally: an awkward phone call, a vague promise, no written terms, and
nobody quite sure what’s been paid back. That uncertainty strains
relationships at exactly the moment people need them most.

### How it works

| Step | What the borrower sees | What family sees |
| --- | --- | --- |
| **1. Request** | Pick what happened, how much (from $500 to $5,000) and a 6, 10 or 12-month plan. | A private request from someone in their circle. |
| **2. Private offers** | Each relative’s answer, one by one. Accept the ones you want. | Only their own answer. “Not this time” is always fine, and nobody else finds out. |
| **3. Agreement** | One plain-language, e-signed agreement per lender: 0% interest, a fixed schedule, automatic reminders. | Their own agreement only. Money moves once everyone signs. |
| **4. Repay & earn** | Autopay splits each payment between lenders. One private request to pause a month if life gets hard again. | Repayments land in their account automatically. |

Along the way the family earns **points** together: +100 for each relative who
helps, +80 for each on-time payment, and +200 when the loan is fully repaid. When the
loan is **fully repaid**, the points unlock **partner offers** the family can
use together, such as a dinner out, a weekend trip or a group activity.

### Why it lives inside the bank

FamilyShield is **not a separate app**. It runs as a module inside a partner
bank’s existing app, so:

- customers use the identity, accounts and trust they already have;
- money moves through the bank’s own rails, not a new wallet;
- the bank offers a caring, sticky feature without building it.

### Business model

- **Service fee:** a one-time **5%** fee on the funded amount. The borrower pays it,
  and it is added to their repayment and spread across the monthly payments.
  Lenders always get back exactly what they lent.
- **Partner commission:** reward partners fund the discounts and pay
  FamilyShield a referral commission (about **4%**) on bookings made through an offer.
  It never adds to the family’s price.

### Privacy principles

1. Only the borrower sees who offered and how much.
2. Each lender sees only their own answer, agreement and repayments.
3. Declines and pause decisions are private.
4. Everything is in writing and signed before any money moves.

---

## Part 2 · For developers

### Quick start

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

This starts two things:

- the **backend server** on http://localhost:8787, which reads and writes the CSV files in [`data/`](data/README.md)
- the **BlueRiver functional mockup** on http://localhost:5173, which is the page to open

Then follow the story on the right side of the page:

1. As **Alex**, tap the FamilyShield card and send a request.
2. Cousin Maya and Aunt Lisa answer automatically within a few seconds.
3. Switch **Viewing as** to **Grace Chen** (Mom). Her bank shows Alex’s request; offer privately.
4. Back as Alex, accept the offers and sign. Maya signs automatically; switch to Mom to sign hers.
5. Make payments (or use the functional mockup shortcut), ask for a pause, and claim a partner reward.

Use **Embed as: Inline SDK / WebView** to switch integration styles.
**Reset functional mockup** clears all activity from the CSV files.

### The data: CSV files instead of a database

There is no real database. Everything lives in editable CSV files in
[`data/`](data/README.md):

| Setup (you edit) | Activity (the app writes, you can edit) |
| --- | --- |
| `settings.csv`: fee %, request limits, terms, points, pauses | `loans.csv`, `offers.csv`, `agreements.csv` |
| `people.csv`: customers and opening balances | `installments.csv`, `installment_splits.csv` |
| `circles.csv`: who is in whose trusted circle | `points_log.csv`, `pauses.csv`, `pause_answers.csv` |
| `rewards.csv`: partner offers and point thresholds | `claimed_rewards.csv` |
| `auto_replies.csv`: relatives the mockup plays automatically | `transactions.csv`: every bank posting |

Money is written in dollars. Change a number, save, and the app shows it on the
next refresh. Running the app changes the activity files, so expect them in
`git status`. Press **Reset functional mockup** before committing if you
want them empty again.

**Two modes, same app:**

| | `npm run dev` | GitHub Pages / `npm run dev:browser` |
| --- | --- | --- |
| Backend | Node server (`packages/server`) | The same backend code, running in the browser |
| Data | `data/*.csv` on disk, read and written live | `data/*.csv` bundled at build time; activity saved in the visitor’s browser |
| Shared between browsers | Yes | No |
| Top-bar label | “Data: CSV files via server” | “Data: CSV files in this browser”, with CSV downloads |

### Repository layout

```
data/          The CSV "fake database" (see data/README.md)
packages/
  core/        Business rules as pure functions, with no dependencies and full tests
               money (integer cents) · fees · schedules · points · rewards · loan lifecycle
  service/     The backend logic: the API's operations over the CSV database
               CSV reader/writer · table mapping · privacy redaction · bank ledger · scripted relatives
  server/      Node HTTP server exposing the service as the REST API in docs/API.md
  sdk/         The embeddable module (React, rendered in a shadow root)
               mountFamilyShield() · bootEmbed() · HttpApi · functional-mockup hosts
apps/
  demo-bank/   "BlueRiver Bank", a fictional host app that embeds the SDK
scripts/
  dev.mjs      Runs the server and the bank app together
docs/
  ARCHITECTURE.md   How the pieces fit and where money actually moves
  INTEGRATION.md    How a bank embeds FamilyShield (web, iOS, Android, React Native)
  API.md            The backend contract the SDK expects
```

### Scripts

Run these from the repo root:

| Command | What it does |
| --- | --- |
| `npm run dev` | Backend server + BlueRiver functional mockup, both with hot reload |
| `npm run dev:browser` | The bank app alone, with the backend running in the browser (like GitHub Pages) |
| `npm run dev:server` | The backend server alone, on http://localhost:8787/v1 |
| `npm test` | Run the core and service tests (Vitest) |
| `npm run typecheck` | Type-check every package |
| `npm run build` | Build the SDK (embed page + library) and the BlueRiver functional mockup |
| `npm run check` | Type-check, test and build, the same as CI |

The server reads `PORT` (default `8787`) and `DATA_DIR` (default `data/`), so
you can point it at a copy of the data, e.g. `DATA_DIR=/tmp/scenario npm run dev:server`.

### How the code is organized

- **Business rules live in `packages/core` only.** Each lifecycle step
  (`respondToRequest`, `signAsBorrower`, `recordPayment`, `requestPause`, …) is a
  pure function from one `LoanCase` to the next, or it throws a
  `FamilyShieldError` whose message is safe to show users. The UI never computes
  fees or schedules on its own.
- **Rules are data.** Fee, limits, terms, points and pauses come from
  `data/settings.csv`, and rewards from `data/rewards.csv`. The UI gets them from
  the backend (`GET /v1/config`); `DEFAULT_RULES` in `core/src/config.ts` is only
  the fallback.
- **One backend, two hosts.** `packages/service` implements every API
  operation over the CSV tables. The Node server wraps it in HTTP; the browser
  mode (`createBrowserMockup`) calls it directly. Both apply the same rules,
  privacy redaction, ledger postings and scripted relatives, so the two modes
  can’t drift apart.
- **Money is integer cents** inside the code and dollars in the CSVs.
  `splitEvenly` makes installments add up exactly; leftover cents go to the
  earliest payments.
- **The SDK talks to a `FamilyShieldApi` interface**: `HttpApi` against any
  server that implements [docs/API.md](docs/API.md), or the in-browser backend.
- **Styles are isolated.** The module renders in a shadow root, and partner banks
  re-skin it with theme tokens (`sdk/src/theme.ts`) instead of CSS overrides.

### Embedding it, in one example

```ts
import { mountFamilyShield, HttpApi } from '@familyshield/sdk';

const fs = mountFamilyShield(document.getElementById('familyshield')!, {
  api: new HttpApi({ baseUrl: 'https://api.familyshield.example/v1', getToken: getCustomerToken }),
  theme: { brand: '#0B5CAD' },
  onEvent: (e) => {
    if (e.type === 'close') hideSheet();
    if (e.type === 'loan.funded' || e.type === 'payment.made') refreshBalances();
  },
});
```

Native apps load the standalone embed page in a WebView instead. See
[docs/INTEGRATION.md](docs/INTEGRATION.md).

### Testing

- `packages/core/test` covers limits, offers, signing, fee-inclusive
  schedules (every lender gets exactly their principal back), points (the example
  family in the functional mockup earns exactly 1,200), pauses, reward unlocking
  at full repayment, custom rules and immutability.
- `packages/service/test` runs the whole family story against the real
  `data/` files: CSV round-trips (quotes, commas, newlines), friendly error
  messages for bad edits, live pickup of hand edits, bank balances, and reset.
- CI (`.github/workflows/ci.yml`) runs type-checks, tests and builds on every
  push and pull request.

### What’s next

The prototype covers the full customer experience. Before a pilot it would need:

- [ ] Production storage: swap the CSV files for a real database with an audit log (the service’s `CsvStorage` interface is the seam)
- [ ] Bank-side integration: token exchange, and money movement through the bank’s payment rails
- [ ] Legal review of the agreement template and fee disclosures for each market
- [ ] Notifications (push, email) for lenders and payment reminders
- [ ] Native WebView wrappers (Swift and Kotlin samples) and accessibility testing with real assistive tech
- [ ] Real reward partners and redemption tracking

### License

No license has been chosen yet. All rights reserved. Please don’t reuse this code without permission.
