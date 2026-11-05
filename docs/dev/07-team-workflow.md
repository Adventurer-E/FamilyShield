# 8. How we work as a team

Every piece of work is a **ticket** on the **Kanban board**. A ticket moves
through five columns, mostly by itself:

```
 Icebox ──/start──▶ In progress ──open PR──▶ Under review ──approve──▶ Reviewed ──merge──▶ Done
 (idea)             a branch is created      the reviewer is notified   the reviewer merges   automatic
```

| Column | Means | How a ticket gets there |
| --- | --- | --- |
| **Icebox** | Written down, nobody on it yet | New tickets start here |
| **In progress** | Someone is working on it, on its own **branch** | Comment `/start`, or drag the card. The branch `ticket/<number>-<title>` is created for you |
| **Under review** | A **pull request** is open; the reviewer is asked to look | Opening a (non-draft) pull request from the ticket's branch. GitHub notifies the reviewer |
| **Reviewed** | The reviewer approved | The reviewer clicks **Approve**. Requesting changes sends it back to In progress |
| **Done** | Merged into `main` and live | The reviewer merges. The ticket closes itself |

## Roles

| Role | Who | Does |
| --- | --- | --- |
| **Author** | The person assigned to the ticket | Writes the change on the ticket's branch and opens the pull request |
| **Reviewer** | Named on the ticket | Reads the pull request, asks for changes or approves, **then merges it** |

You can't review your own work, so the reviewer must be someone else.

## Step by step

### 1. Create a ticket

**Issues → New issue → Task.** Fill in *What and why* and *Done when*. Name a
reviewer if you know who; otherwise leave it empty. The bot adds the ticket to
the board in **Icebox** and replies with the list of commands.

### 2. Pick it up

On the ticket, comment:

```
/start
```

You're assigned (if nobody was), the card moves to **In progress**, and the bot
replies with your branch name. On your computer:

```bash
git fetch origin
git switch ticket/12-show-last-payment-date     # the name from the bot's comment
```

> No reviewer yet? Ask someone, or they can comment `/reviewer me` themselves.

### 3. Make the change

Use the [screen guides](screens/README.md) to find the files. Save your work
often with commits:

```bash
git add .
git commit -m "Show the last payment date on Repay"
git push
```

Run `npm run check` before the next step.

### 4. Open a pull request

On GitHub, a yellow banner offers **Compare & pull request** for your branch.
Click it, fill in the template (keep the `Closes #12` line), and click
**Create pull request**.

- The ticket moves to **Under review**, and the reviewer gets a GitHub
  notification (and an email, depending on their settings).
- **Not ready yet?** Choose **Create draft pull request** instead. The ticket
  stays **In progress** until you click **Ready for review**.
- A preview link of the app with your change appears as a comment. Share it!

### 5. Review (reviewer)

Open the pull request → **Files changed**. Leave comments on lines, try the
preview link, then **Review changes** →

- **Request changes**: the ticket goes back to **In progress** and the author is told.
- **Approve**: the ticket moves to **Reviewed**.

### 6. Merge (reviewer)

When **Checks** and **Review gate** are green, the reviewer clicks **Merge pull
request** (squash is fine). The ticket moves to **Done**, closes itself, the
branch is deleted, and the live site updates a couple of minutes later.

> **Only the ticket's reviewer merges.** GitHub can't enforce *which* person
> clicks the button, so if someone else merges, the bot labels the pull request
> `merge rule broken` and leaves a friendly reminder.

## Ticket commands

Write these as a comment on the **ticket** (not on the pull request):

| Command | Does |
| --- | --- |
| `/start` | Move to In progress, assign you if nobody is, create the branch |
| `/assign me` · `/assign @ann` · `/unassign @ann` | Change who works on it (or use **Assignees** on the right) |
| `/review` or `/reviewer me` | Make yourself the reviewer |
| `/reviewer @ann` | Add a reviewer (several: `/reviewer @ann @bo`) |
| `/reviewer remove @ann` · `/reviewer clear` | Remove a reviewer, or all |
| `/status icebox` (or `in progress`, `under review`, `reviewed`) | Set the column by hand |
| `/help` | List the commands |

Reviewers are shown at the bottom of the ticket, in the 🤖 line the bot maintains.

## The board

**Projects → FamilyShield board** (link at the top of the repo's **Projects**
tab). You can drag cards between columns too. The bot catches up within 10
minutes and does the same things the commands do (e.g. dragging to In
progress creates the branch). Labels like `status: in progress` on the ticket
always match the column.

## Rules that GitHub enforces on `main`

- Nobody pushes to `main` directly. Every change arrives through a pull request.
- A pull request can only be merged when:
  - **Checks** passed (types, tests, build: see [Testing](06-testing.md)), and
  - **Review gate** passed: the ticket's reviewer approved, and nobody on the
    ticket's reviewer list requested changes.
- New commits after an approval cancel the approval; the reviewer looks again.
