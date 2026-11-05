# One-time GitHub setup (repository admin)

The automation lives in the repo (`.github/`), but a few switches can only be
flipped by the account that owns the repository. Do these once, in order.

## 1. Add your teammates

**Settings → Collaborators → Add people**, with the **Write** role. Everyone who
creates tickets, works on branches or reviews needs this.

## 2. Create the Kanban board

GitHub boards ("Projects") belong to your account, not to the repository.

1. Your profile picture → **Your projects** → **New project** → **Board** template.
   Name it **FamilyShield board**.
2. The board has a **Status** field with columns *Todo / In Progress / Done*.
   Click **⋯** on a column → **Edit details** to rename, and **+** to add, until
   the columns are exactly:

   **Icebox · In progress · Under review · Reviewed · Done**

   (Upper/lower case doesn't matter; the spelling does.)
3. **⋯ (top right) → Settings**:
   - **Manage access**: add your teammates as **Write** (so they can drag cards),
     or set **Visibility: Public**.
4. **⋯ → Workflows**: turn on **Item closed → Done** and **Pull request merged → Done**,
   and turn **off** any workflow that sets other statuses.
5. In the repository, open the **Projects** tab → **Link a project** → choose
   **FamilyShield board**.
6. Note the board's **number** from its address:
   `github.com/users/Adventurer-E/projects/`**`3`**.

## 3. Let the automation move cards

The automation's built-in token can't touch boards (they belong to your
account), so it needs a token of yours.

1. Your profile picture → **Settings → Developer settings → Personal access
   tokens → Tokens (classic) → Generate new token (classic)**.
   - Note: `FamilyShield board automation`
   - Expiration: whatever your team prefers (set a reminder to renew it)
   - Scopes: **`repo`** and **`project`**
2. Copy the token. In the repository: **Settings → Secrets and variables →
   Actions**:
   - **Secrets** tab → **New repository secret**: name `PROJECT_TOKEN`, value = the token
   - **Variables** tab → **New repository variable**: name `PROJECT_NUMBER`, value = the board number from step 2.6
3. **Actions → Tickets → Run workflow** once. It creates the labels and adds
   every open ticket to the board.

Without this step everything still works through labels and commands; only the
board columns won't follow along.

## 4. Protect `main`

**Settings → Branches → Add branch ruleset** (or **Add classic branch
protection rule**) for `main`:

- ✅ Require a pull request before merging
  - Required approvals: **1**
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require approval of the most recent reviewable push
- ✅ Require status checks to pass: add **Checks** and **Review gate**
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings (applies to admins too)
- ✅ Block force pushes · ✅ Restrict deletions

> ⚠️ With these rules **someone other than the author must approve every
> pull request**. Add at least one teammate (step 1) first, or you won't be
> able to merge anything yourself.

Also, under **Settings → General → Pull Requests**: ✅ **Automatically delete
head branches**, so merged ticket branches disappear.

## 5. Pages (already done?)

**Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`**.
This serves the live site and the per-pull-request previews.

## What each automation file does

| File | Job |
| --- | --- |
| `.github/workflows/ci.yml` | **Checks**: type-check, tests, automation tests, build |
| `.github/workflows/review-gate.yml` | **Review gate**: passes once the ticket's reviewer approved |
| `.github/workflows/tickets.yml` | Ticket commands, status labels and board column, branch per ticket, review requests, merge reminder, board sync every 10 min |
| `.github/workflows/pages.yml` | Deploys the live site from `main`, and a preview per pull request |
| `.github/scripts/tickets.cjs` | The ticket logic (tested by `tickets.test.cjs`) |
| `.github/ISSUE_TEMPLATE/task.yml` | The ticket form |
| `.github/pull_request_template.md` | The pull request description template |
