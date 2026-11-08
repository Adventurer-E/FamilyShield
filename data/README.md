# The CSV "fake database"

FamilyShield's functional mockup has no real database server. Every number it
shows comes from CSV files. Open any of them in Excel, Google Sheets, Numbers or
a text editor.

## Two layers: shared state and your working copy

| Folder | In git? | What's in it | Who changes it |
| --- | --- | --- | --- |
| `data/` (this folder) | **Committed** | Setup tables, plus the **starting state** of the activity tables | You, on purpose, reviewed in pull requests like code |
| `data/local/` | **Ignored** | Your **working copy** of the activity tables | The app, every time you click something |

The first time the server starts, it copies the activity tables from `data/` to
`data/local/`. After that, everything you do in the app is written to
`data/local/` only. Testing on your branch never changes `data/`, so different
developers and branches don't conflict over test data.

| Command | What it does |
| --- | --- |
| `npm run data:reset` (or **Reset functional mockup**) | Throw away your working copy and start again from `data/` |
| `npm run data:status` | List the activity files where your copy differs from `data/` |
| `npm run data:save` | Copy your working copy into `data/`, then review with `git diff data/` and commit. Use this to share a scenario (e.g. "a loan one payment from done") |

If someone changes the shared starting state (you pull a commit that touches
`data/`), the server warns you at startup and suggests `npm run data:reset`.

Setup tables (settings, people, circles, reasons, rewards, auto replies, example
transactions) live **only** in
`data/`. Edit them there; the change applies on the next request.

## Where each mode reads from

- **`npm run dev`**: the backend server reads setup tables from `data/` and
  activity from `data/local/`, on every request. Save an edit, and it shows on
  the next refresh (within about 2 seconds).
- **GitHub Pages / `npm run dev:browser`**: these files are bundled into the page
  when it is built. Activity is then kept in the visitor's browser; use the
  **Data** button in the top bar to download it as CSV.

If an edit can't be read, the app shows exactly where, e.g.
`people.csv, line 3, column "opening_balance": "twenty grand" is not an amount in dollars`.

## Conventions

| Kind | Format | Examples |
| --- | --- | --- |
| Money | Dollars. `$` and thousands commas are fine. | `4328.50`, `$4,328.50`, `-157.50` |
| Yes/no | `yes`/`no`, `true`/`false`, `1`/`0` | `yes` |
| Times | ISO 8601, UTC | `2026-11-05T15:00:00.000Z` |
| Dates | `YYYY-MM-DD` | `2026-12-05` |
| Text with commas | Wrap in double quotes; double any quote inside | `"Two nights, breakfast included"` |

Column order doesn't matter, because columns are matched by their header name.
Extra columns are ignored.

---

## Setup tables (edited by you, read-only to the app)

### `settings.csv`: the business rules

| key | Meaning | Default |
| --- | --- | --- |
| `fee_rate_percent` | One-time service fee, added to what the borrower repays | `5` |
| `min_request` / `max_request` | Request limits in dollars | `500` / `5000` |
| `request_step` | Amount stepper increment in dollars | `250` |
| `terms_months` | Terms a borrower can choose, separated by `\|` | `6\|10\|12` |
| `default_request` | Amount the request screen starts at, in dollars (must be between `min_request` and `max_request`) | `1500` |
| `default_term_months` | Term the request screen starts at (must be one of `terms_months`) | `10` |
| `lender_offer_amounts` | Quick-pick amounts a lender sees when offering, in dollars, separated by `\|`. Only amounts up to the request are shown; a "The full $X" choice appears when the request is larger than all of them | `250\|500\|1000` |
| `max_pauses` | One-month pauses allowed per loan | `1` |
| `show_free_option` | Experiment arm B (M5, hypothesis #8): before the request, the borrower chooses between FamilyShield (with its fee) and arranging the loan themselves for free. `yes` or `no`. On the live mockup, add `?free_option=yes` (arm B) or `?free_option=no` (arm A) to the link instead of editing this file | `no` |
| `points_per_helper` | Points per relative who funds the loan | `100` |
| `points_per_on_time_payment` | Points per on-time payment | `80` |
| `points_on_full_repayment` | Bonus at full repayment | `200` |

Changes apply to **new** requests and actions. Fees already written into a
signed agreement don't change.

### `people.csv`: bank customers

`id` (used everywhere else), `first_name`, `last_name`, `account_label`,
`opening_balance`. A person's balance is `opening_balance` plus all their
rows in `transactions.csv`. Everyone listed here appears in the top bar's
**Viewing as** menu.

### `circles.csv`: trusted circles

One row per (owner, member): `owner_id`, `member_id`, `nickname` (how the owner
refers to them, e.g. "Mom"). A request goes to everyone in the borrower's circle.

### `auto_replies.csv`: relatives the mockup plays automatically

| Column | Meaning |
| --- | --- |
| `member_id` | Who |
| `reply_after_seconds` | Delay after a request is created |
| `reply` | `offer` or `decline` |
| `offer_amount` | Dollars offered (capped at the request; blank = the full request) |
| `note` | Message shown to the borrower |
| `auto_sign` | Sign the agreement automatically after the borrower signs |
| `auto_approve_pause` | Approve pause requests automatically |

Anyone not listed (Mom, in the default data) waits for a real person: switch to
them in **Viewing as**.

### `reasons.csv`: what can happen

The "What happened?" choices on the request screen, in the order shown:
`id` (one of `car`, `medical`, `job`, `other`; stored on the loan), `label`
(the button text) and `template` (the description it pre-fills, which the
borrower can rewrite). Remove a row to hide that choice. If the file is
missing, the built-in four are used.

### `example_transactions.csv`: everyday bank activity

Rows shown under the FamilyShield postings on the bank home, for realism only:
`id`, `date` (`YYYY-MM-DD`), `name`, `category` and `amount` (+ in, − out).
Everyone sees the same rows, and they are **not** counted in any balance.

### `rewards.csv`: partner offers

`id`, `name`, `short_label`, `points_needed`, `category`, `partner`,
`headline`, `detail`, `terms`, `valid_for_months`. Offers unlock only when a
loan is fully repaid **and** the family's points reach `points_needed`.

---

## Activity tables (written by the app, editable by you)

The app writes these in your working copy (`data/local/`). The copies in
`data/` are the shared starting state: header-only by default, so the story
starts fresh. “Reset functional mockup” copies them over your working copy.
Setup tables are untouched.

| File | One row per | Columns |
| --- | --- | --- |
| `loans.csv` | request / loan | `id`, `borrower_id`, `reason` (car, medical, job, other), `purpose`, `amount`, `months`, `status` (collecting, signing, active, repaid, cancelled), `created_at`, `funded_at`, `repaid_at`, `points`, `pauses_used` |
| `offers.csv` | person asked | `loan_id`, `member_id`, `status` (pending, offered, declined, expired), `amount`, `accepted`, `note`, `responded_at` |
| `agreements.csv` | lender | `loan_id`, `lender_id`, `principal`, `interest_rate_percent`, `fee`, `total` (always recalculated as principal + fee), `borrower_signed_at`, `lender_signed_at` |
| `installments.csv` | monthly payment | `loan_id`, `number` (1, 2, …), `due_date`, `amount`, `paid_at`, `on_time` |
| `installment_splits.csv` | who gets what from a payment | `loan_id`, `number`, `pays_to` (a lender id, or `fee`), `amount`. These are the source of truth: an installment's amount is the sum of its splits |
| `points_log.csv` | points award | `loan_id`, `at`, `points`, `reason` (help, on-time, complete), `label` |
| `pauses.csv` | pause request | `loan_id`, `status` (pending, approved, declined), `requested_at` |
| `pause_answers.csv` | lender's pause answer | `loan_id`, `lender_id`, `answer` (yes, no, or blank = not answered) |
| `claimed_rewards.csv` | claimed offer | `loan_id`, `reward_id`, `code` |
| `transactions.csv` | bank posting | `id`, `user_id`, `at`, `amount` (+ in, − out), `memo` |

Tip: to build a scenario, e.g. a loan that's one payment from done, play it in
the app until it's close, adjust `paid_at` dates or `points` in `data/local/`
by hand, then `npm run data:save` and commit it so everyone starts there.
