# 6. Recipes

Short, tested steps for common changes. ⚙️ = no code, data only.

- [Change any text on screen](#change-any-text-on-screen)
- [Change the brand color](#change-the-brand-color)
- ⚙️ [Change the fee, limits or terms](#change-the-fee-limits-or-terms)
- ⚙️ [Add a person](#add-a-person)
- ⚙️ [Add a reward](#add-a-reward)
- ⚙️ [Make a relative answer automatically (or stop)](#make-a-relative-answer-automatically)
- ⚙️ [Set up a scenario and share it](#set-up-a-scenario-and-share-it)
- [Rename the four steps](#rename-the-four-steps)
- [Add a new screen](#add-a-new-screen)
- [Add a column or an action](#add-a-column-or-an-action)

---

### Change any text on screen

Search the exact words with **Ctrl+Shift+F** in VS Code, edit, save. See
[Find and change anything](03-find-and-change.md). Names, amounts and reward
wording live in `data/`, not code.

### Change the brand color

`packages/sdk/src/theme.ts` → `brand` (buttons, bars), `brandStrong` (links),
`brandSoft` (light backgrounds). Keep text readable: white text on `brand`
needs a dark enough color. The bank's own colors are at the top of
`apps/demo-bank/src/styles.css`.

### Change the fee, limits or terms

Edit `data/settings.csv`:

```csv
key,value,description
fee_rate_percent,4,...
terms_months,3|6|12,...
```

Save and refresh. New requests use the new values; already-signed agreements
keep theirs. Commit the file if the change is meant for everyone.

### Add a person

1. `data/people.csv`: add `sam,Sam,Rivera,Everyday Checking ••5512,2500.00`
2. `data/circles.csv`: give Sam family, e.g. `alex,sam,Uncle Sam` (Alex's
   requests now go to Sam too) and `sam,alex,Alex` (Sam can ask Alex).
3. Refresh. Sam appears in **Viewing as**.

### Add a reward

Add a row to `data/rewards.csv`:

```csv
spa,Spa day,SPA,800,Wellness,Calm Waters Spa,30% off a spa day,"A relaxing day for two, with lunch.",Weekdays only.,3
```

It shows on [Repay & earn](screens/repay.md) and unlocks at full repayment once the
family has 800 points.

### Make a relative answer automatically

`data/auto_replies.csv`. Add `mom,5,offer,1000,Happy to help,yes,yes` to make
Mom offer $1,000 after 5 seconds and sign automatically. Delete Maya's row to
answer as Maya yourself instead.

### Set up a scenario and share it

1. `npm run data:reset` to start clean.
2. Play the story in the app up to the point you want (e.g. 9 of 10 payments).
3. Optional: fine-tune by hand in `data/local/*.csv`.
4. `npm run data:save` copies your state into `data/`. Check `git diff data/`.
5. Commit it on your ticket's branch. After merging, everyone's server warns
   them that the shared state changed, and `npm run data:reset` gives them your scenario.

### Rename the four steps

`STEP_LABELS` in `packages/sdk/src/ui/kit.tsx`.

### Add a new screen

1. Create `packages/sdk/src/ui/screens/MyScreen.tsx`. Copy a small screen
   like `Reward.tsx` and wrap your content in `<Screen title="…">`.
2. In `packages/sdk/src/ui/context.tsx`, add `| { name: 'my-screen' }` to `type Route`.
3. In `packages/sdk/src/ui/App.tsx`, add `case 'my-screen': return <MyScreen />;`.
4. Open it from a button: `go({ name: 'my-screen' })`.
5. Add a guide page in `docs/dev/screens/` (copy an existing one) and a row to its index.

### Add a column or an action

See [The data and the back-end](04-data-and-backend.md#adding-a-column).
