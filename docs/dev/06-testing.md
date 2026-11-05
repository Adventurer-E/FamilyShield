# 7. Testing and checks

## The one command

```bash
npm run check
```

Runs everything below. Run it before asking for a review; GitHub runs the
same thing on every pull request.

| Command | Checks | Takes |
| --- | --- | --- |
| `npm run typecheck` | **Types**: that every piece of code is used the way it was meant to (e.g. you didn't pass text where a number is expected). Catches many bugs before you even run the app | ~10 s |
| `npm test` | **Tests**: small programs that use our code and check the answers | ~5 s |
| `npm run test:automation` | Tests for the ticket automation in `.github/scripts/` | ~1 s |
| `npm run build` | **Build**: that the app can be packaged for the web | ~10 s |

## Where the tests are

| Tests | Cover | File |
| --- | --- | --- |
| Rules | limits, offers, signing, fees in repayment, schedules that add up to the cent, points (the example family earns exactly 1,200), pauses, rewards only at full repayment | `packages/core/test/loan.test.ts`, `money.test.ts` |
| Back-end over CSV | the whole family story against the real `data/` files, CSV quirks (commas, quotes, new lines), helpful errors for typos, hand edits picked up, balances, reset | `packages/service/test/service.test.ts` |
| Ticket automation | slash commands, status labels, reviewer lists, branch names | `.github/scripts/tickets.test.cjs` |

Tests read like sentences:

```ts
it('only unlock at full repayment, even with enough points', () => { … });
```

**When you change a rule, change or add its test in the same pull request.**
A reviewer will ask for it.

Run one file while you work (it re-runs on every save):

```bash
npm run test:watch -w @familyshield/core
```

## What GitHub does automatically (CI/CD)

| When | What runs | Where to see it |
| --- | --- | --- |
| Every push to a pull request | **CI · Checks**: type-check, tests, automation tests, build | The PR's checks list (bottom of the PR page) |
| Every push to a pull request | **Review gate**: passes once the ticket's reviewer has approved | Same list |
| Every push to a pull request | **Preview**: the app built in browser mode, at `…/pr-preview/pr-<number>/` | A bot comment on the PR |
| Merge into `main` | **Deploy**: publishes the live site | https://adventurer-e.github.io/FamilyShield/ |

A red ✗ on a check blocks merging. Click **Details** next to it to read the log;
the failing step and error are near the bottom.
