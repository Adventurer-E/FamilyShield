# FamilyShield

[![CI](https://github.com/Adventurer-E/familysheild/actions/workflows/ci.yml/badge.svg)](https://github.com/Adventurer-E/familysheild/actions/workflows/ci.yml)

**Family support for life’s shocks, built into the banking app people already use.**

FamilyShield is an embeddable module for banks and credit unions. When a customer
is hit by a car repair, a medical bill or a lost job, they can ask their trusted
family circle for help privately, receive private offers, sign clear
interest-free terms, and repay automatically, all without leaving their bank’s app.

**▶ [Try the live mockup](https://adventurer-e.github.io/FamilyShield/)**: no install needed. It runs entirely in your browser.
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

**New here? Start with the [developer guide in the wiki](https://github.com/Adventurer-E/FamilyShield/wiki).** It assumes
no web-development experience and walks through everything below in more detail.

### Run it

You need [Node.js 20+](https://nodejs.org) and [Git](https://git-scm.com).

```bash
git clone https://github.com/Adventurer-E/FamilyShield.git
cd FamilyShield
npm install
npm run dev        # then open http://localhost:5173
```

### Where to go next

| I want to… | Read |
| --- | --- |
| Set up my computer step by step | [Setup](https://github.com/Adventurer-E/FamilyShield/wiki/Setup) |
| Understand what all the folders are | [The big picture](https://github.com/Adventurer-E/FamilyShield/wiki/The-big-picture) |
| Change something I see on screen | [Find and change anything](https://github.com/Adventurer-E/FamilyShield/wiki/Find-and-change-anything), then the page for that screen in [**Screen by screen**](https://github.com/Adventurer-E/FamilyShield/wiki/Screen-by-screen) |
| Change a number (balance, fee, reward) | [`data/README.md`](data/README.md). It's a CSV file, not code |
| Understand the back-end and the CSV data | [The data and the back-end](https://github.com/Adventurer-E/FamilyShield/wiki/Data-and-back-end) |
| Follow a recipe for a common change | [Recipes](https://github.com/Adventurer-E/FamilyShield/wiki/Recipes) |
| Run tests; understand CI and preview links | [Testing and checks](https://github.com/Adventurer-E/FamilyShield/wiki/Testing-and-checks) |
| Pick up a ticket, branch, get reviewed, merge | [How we work as a team](https://github.com/Adventurer-E/FamilyShield/wiki/Team-workflow) |
| Look up a word | [Glossary](https://github.com/Adventurer-E/FamilyShield/wiki/Glossary) |
| Set up the board, tokens and branch rules (repo admin) | [One-time GitHub setup](https://github.com/Adventurer-E/FamilyShield/wiki/GitHub-setup) |

### Repository at a glance

```
apps/demo-bank/     BlueRiver Bank, the pretend bank app FamilyShield is embedded in
packages/sdk/       The FamilyShield module: every screen of our product
packages/core/      Business rules: fees, schedules, points, rewards
packages/service/   Back-end logic over the CSV data
packages/server/    The back-end web server (port 8787)
data/               The CSV "fake database" (shared starting state; your copy is data/local/)
docs/               Architecture, integration and API reference (developer guide: the wiki)
.github/            CI, previews, deploys and the ticket workflow
```

### Everyday commands

| Command | Does |
| --- | --- |
| `npm run dev` | Run everything (server + bank app) with live reload |
| `npm run check` | All checks GitHub runs: types, tests, build |
| `npm run data:reset` | Start your data over from the shared state |

More in [Testing and checks](https://github.com/Adventurer-E/FamilyShield/wiki/Testing-and-checks) and [The data and the back-end](https://github.com/Adventurer-E/FamilyShield/wiki/Data-and-back-end).

### Reference docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit and where money moves
- [docs/INTEGRATION.md](docs/INTEGRATION.md): how a bank embeds FamilyShield (web, iOS, Android, React Native)
- [docs/API.md](docs/API.md): the back-end's endpoints

### What’s next

The mockup covers the full customer experience. Before a pilot it would need:

- [ ] Production storage: swap the CSV files for a real database with an audit log (the service’s `CsvStorage` interface is the seam)
- [ ] Bank-side integration: token exchange, and money movement through the bank’s payment rails
- [ ] Legal review of the agreement template and fee disclosures for each market
- [ ] Notifications (push, email) for lenders and payment reminders
- [ ] Native WebView wrappers (Swift and Kotlin samples) and accessibility testing with real assistive tech
- [ ] Real reward partners and redemption tracking

### License

No license has been chosen yet. All rights reserved. Please don’t reuse this code without permission.
