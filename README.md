# FamilyShield

[![CI](https://github.com/Adventurer-E/familysheild/actions/workflows/ci.yml/badge.svg)](https://github.com/Adventurer-E/familysheild/actions/workflows/ci.yml)

**Family support for life’s shocks, built into the banking app people already use.**

FamilyShield is an embeddable module for banks and credit unions. When a customer
is hit by a car repair, a medical bill or a lost job, they can ask their trusted
family circle for help privately, receive private offers, sign clear
interest-free terms, and repay automatically, all without leaving their bank’s app.

**▶ [Try the live functional mockup](https://adventurer-e.github.io/FamilyShield/)**: no install needed. It runs entirely in your browser.

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
npm run dev          # BlueRiver functional mockup at http://localhost:5173
```

Then follow the story on the right side of the functional mockup page:

1. As **Alex**, tap the FamilyShield card and send a request.
2. Cousin Maya and Aunt Lisa answer automatically within a few seconds.
3. Switch to **Mom** in the top bar. Her bank shows Alex’s request; offer privately.
4. Back as Alex, accept the offers and sign. Maya signs automatically; switch to Mom to sign hers.
5. Make payments (or use the functional mockup shortcut), ask for a pause, and claim a partner reward.

Use **Embed as: Inline SDK / WebView** in the top bar to switch integration
styles. **Reset functional mockup** starts over. Functional mockup state is saved in your browser’s localStorage.

### Repository layout

```
packages/
  core/        Pure TypeScript domain logic, with no dependencies and full tests
               money (integer cents) · fees · schedules · points · rewards · loan lifecycle
  sdk/         The embeddable module (React, rendered in a shadow root)
               mountFamilyShield() · bootEmbed() · HttpApi · mock backend
apps/
  demo-bank/   "BlueRiver Bank", a fictional host app that embeds the SDK
docs/
  ARCHITECTURE.md   How the pieces fit and where money actually moves
  INTEGRATION.md    How a bank embeds FamilyShield (web, iOS, Android, React Native)
  API.md            The backend contract the SDK expects
```

### Scripts

Run these from the repo root:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the BlueRiver functional mockup with hot reload |
| `npm test` | Run the core domain tests (Vitest) |
| `npm run typecheck` | Type-check every package |
| `npm run build` | Build the SDK (embed page + library) and the BlueRiver functional mockup |
| `npm run check` | Type-check, test and build, the same as CI |

### How the code is organized

- **Business rules live in `packages/core` only.** Each lifecycle step
  (`respondToRequest`, `signAsBorrower`, `recordPayment`, `requestPause`, …) is a
  pure function from one `LoanCase` to the next, or it throws a
  `FamilyShieldError` whose message is safe to show users. The UI never computes
  fees or schedules on its own.
- **Money is integer cents.** `splitEvenly` makes installments add up exactly;
  leftover cents go to the earliest payments.
- **Tunable rules are in one file:** `packages/core/src/config.ts` holds the fee rate,
  amount limits, terms, points and pause allowance.
- **The SDK talks to a `FamilyShieldApi` interface** with two implementations:
  `HttpApi` for production and `createMockBackend()` for functional mockups and tests. The
  mock applies the same core rules, redacts what lenders may see, simulates the
  bank ledger, and plays the scripted relatives in `sdk/src/api/mock/seed.ts`.
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
  family in the functional mockup earns exactly 1,200), pauses, reward unlocking at full repayment, and
  immutability.
- CI (`.github/workflows/ci.yml`) runs type-checks, tests and builds on every
  push and pull request.

### What’s next

The prototype covers the full customer experience. Before a pilot it would need:

- [ ] The FamilyShield service: a real implementation of [docs/API.md](docs/API.md) with a database and audit log
- [ ] Bank-side integration: token exchange, and money movement through the bank’s payment rails
- [ ] Legal review of the agreement template and fee disclosures for each market
- [ ] Notifications (push, email) for lenders and payment reminders
- [ ] Native WebView wrappers (Swift and Kotlin samples) and accessibility testing with real assistive tech
- [ ] Real reward partners and redemption tracking

### License

No license has been chosen yet. All rights reserved. Please don’t reuse this code without permission.
