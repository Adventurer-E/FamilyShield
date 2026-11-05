# Developer guide: start here

Welcome! These guides assume you're new to web development. You don't need to
know React, TypeScript, front-end, back-end or this codebase yet. Read them in
order the first time; later, jump straight to the screen you want to change.

## Learning path

| # | Guide | You'll learn | Time |
| --- | --- | --- | --- |
| 1 | [Set up your computer](01-setup.md) | Install the tools, download the code, run the app | 20 min |
| 2 | [The big picture](02-big-picture.md) | What "front-end", "back-end" and "data" mean here, and which folder is which | 15 min |
| 3 | [Find and change anything](03-find-and-change.md) | The everyday loop: find the code behind something on screen, edit it, see it update | 15 min |
| 4 | [**Screen by screen**](screens/README.md) | For every page of the app: which files draw it, where its numbers come from, and how to change it | Look up as needed |
| 5 | [The data and the backend](04-data-and-backend.md) | The CSV files, the server, and how a click becomes a saved row | 15 min |
| 6 | [Recipes](05-recipes.md) | Step-by-step changes: rename a button, add a reward, change the fee, add a field… | Look up as needed |
| 7 | [Testing and checks](06-testing.md) | Running tests, what CI checks, preview links | 10 min |
| 8 | [How we work as a team](07-team-workflow.md) | Tickets on the Kanban board, branches, reviews and merging | 10 min |
| ★ | [Glossary](glossary.md) | Every jargon word used in these guides | — |

## The 30-second version

```bash
npm install      # once, after downloading the code
npm run dev      # starts everything; open http://localhost:5173
```

- Want to change **how something looks or what it says**? Find the screen in
  [Screen by screen](screens/README.md). Each page names the exact file.
- Want to change **a number** (a balance, the fee, a reward)? It's probably in a
  CSV file in [`data/`](../../data/README.md), not in the code.
- Want to **start a piece of work**? Create a ticket on the board and follow
  [How we work as a team](07-team-workflow.md).

## Getting stuck

1. Check the terminal where `npm run dev` is running. Errors appear there,
   usually with a file name and line number.
2. In the browser, open the developer tools (F12, or Cmd+Option+I on a Mac) and
   look at the **Console** tab for red errors.
3. Search these guides for the error message or the word you're stuck on.
4. Still stuck? Comment on your ticket. That's what reviewers are for.
