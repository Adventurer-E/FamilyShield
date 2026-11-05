# 2. The big picture

## Three layers

Almost every app has the same three layers. FamilyShield is no exception.

```
  ┌───────────────────────────┐
  │ FRONT-END                 │  What people see and click: screens, buttons, colors.
  │ runs in the browser       │  Written in React (TypeScript + HTML-like "JSX").
  └─────────────┬─────────────┘
                │  "Alex wants to borrow $1,500"   (a request over HTTP)
                ▼
  ┌───────────────────────────┐
  │ BACK-END                  │  The rules and the bookkeeping: is $1,500 allowed?
  │ runs on a server          │  What's the fee? Who gets paid back what?
  └─────────────┬─────────────┘
                │  reads and writes
                ▼
  ┌───────────────────────────┐
  │ DATA                      │  Where everything is remembered. For us: CSV files
  │ the data/ folder          │  (spreadsheets), instead of a real database.
  └───────────────────────────┘
```

## Two apps in one

FamilyShield isn't a standalone app. It's a **module that lives inside a bank's
existing app**. To show that, this project contains two front-ends:

- **BlueRiver Bank**: a pretend bank app (balance, transactions, menu). It
  exists only so we have something to embed FamilyShield in. In real life, each
  partner bank has its own app.
- **The FamilyShield module**: our actual product. It opens as a full-screen
  sheet when you tap the FamilyShield card in the bank app.

Above both is the dark **functional mockup bar** (switch person, reset, see
where data lives). That bar is a testing tool, not part of either app.

## The folders

```
FamilyShield/
├── apps/
│   └── demo-bank/          FRONT-END · BlueRiver Bank (the pretend host bank)
├── packages/
│   ├── sdk/                FRONT-END · the FamilyShield module (our product's screens)
│   ├── core/               SHARED    · the business rules: fees, schedules, points, rewards
│   ├── service/            BACK-END  · every action ("sign", "pay") applied to the data
│   └── server/             BACK-END  · the web server that front-ends talk to
├── data/                   DATA      · the CSV files (see data/README.md)
├── docs/                   Documentation (you are here)
├── scripts/                Small helper programs behind `npm run …` commands
└── .github/                GitHub automation: checks, previews, ticket workflow
```

A **package** is just a folder of related code with its own `package.json`. We
split the code into packages so each part has one job. When you see
`import … from '@familyshield/core'` in a file, it means "use code from the
`packages/core` folder".

### Which package do I touch?

| I want to change… | Go to |
| --- | --- |
| What a FamilyShield screen shows or how it looks | `packages/sdk/src/ui/` → see [Screen by screen](screens/README.md) |
| The pretend bank around it (home screen, balance, menu, top bar) | `apps/demo-bank/src/` |
| A number such as a balance, the fee %, limits or a reward | `data/*.csv` (no code!) |
| A **rule** (how the schedule is split, when rewards unlock) | `packages/core/src/` |
| What happens when someone clicks an action (who gets paid, what's saved) | `packages/service/src/service.ts` |
| A web address the front-end calls (an "endpoint") | `packages/server/src/app.ts` |

## The journey of one click

What happens when Alex taps **Pay $157.50 now**:

1. **Screen** (`packages/sdk/src/ui/screens/Repay.tsx`): the button's `onClick`
   calls `api.makePayment(loanId)`.
2. **API client** (`packages/sdk/src/api/http.ts`): sends
   `POST /v1/loans/<id>/payments` to the server, saying it's Alex.
3. **Server** (`packages/server/src/app.ts`): matches the address to a
   "route" and calls `service.makePayment('alex', loanId)`.
4. **Service** (`packages/service/src/service.ts`): reads the CSV files, checks
   Alex is the borrower, and asks the rules to record the payment.
5. **Rules** (`packages/core/src/loan.ts`, `recordPayment`): marks the next
   installment paid, adds on-time points, and marks the loan *repaid* if it was
   the last payment.
6. **Bank ledger** (still in `service.ts`, `settle`): adds rows to
   `transactions.csv`: −$157.50 for Alex, +$100 for Mom, +$50 for Maya.
7. **Data**: the service writes the changed CSV files in `data/local/`.
8. **Back on screen**: the module reloads its data and shows "2 payments made".
   The bank notices too and updates Alex's balance.

On GitHub Pages there's no server, so steps 2–3 are skipped: the *same* service
code runs inside the browser and keeps the CSVs in browser storage. Everything
else is identical. That's why `packages/service` exists as its own package.

## Two ways to run

| | `npm run dev` | GitHub Pages / `npm run dev:browser` |
| --- | --- | --- |
| Back-end | A real server on your computer (port 8787) | The same back-end code, inside the browser |
| Data | `data/` (shared) + `data/local/` (your copy) | Bundled `data/` + browser storage |
| Use it for | Day-to-day development | Showing people; quick checks |

The top bar always tells you which one you're in ("Data: CSV files via server"
vs. "…in this browser").

**Next:** [Find and change anything →](03-find-and-change.md)
