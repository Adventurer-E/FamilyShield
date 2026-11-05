# Glossary

| Word | Meaning here |
| --- | --- |
| **API** | The list of things the front-end can ask the back-end to do ("create a request", "pay"). Ours is in `packages/sdk/src/api/types.ts` and [docs/API.md](../API.md) |
| **Back-end** | Code that applies rules and saves data: `packages/core`, `service`, `server` |
| **Branch** | A separate line of work in git. Each ticket gets its own branch, so unfinished work never affects `main` |
| **Build** | Packaging the code into files a browser can load (`npm run build`) |
| **CI / CD** | *Continuous integration*: automatic checks on every pull request. *Continuous deployment*: automatic publishing when `main` changes. See [Testing](06-testing.md) |
| **Commit** | A saved snapshot of changes in git, with a message saying what and why |
| **Component** | A reusable piece of screen, written as a function that returns JSX (`Hub`, `Button`, …) |
| **CSV** | "Comma-separated values": a plain-text spreadsheet. Our data |
| **Embed / embedded module** | FamilyShield runs *inside* a bank's app rather than as its own app |
| **Endpoint / route** | One web address the server answers, e.g. `POST /v1/loans/:id/payments` |
| **Front-end** | Code that draws screens in the browser: `packages/sdk`, `apps/demo-bank` |
| **Functional mockup** | This project: realistic screens with working logic and data, but fake people, money and partners |
| **Hot reload** | The browser updating by itself when you save a file |
| **JSX / TSX** | HTML-like tags inside TypeScript (`<Button>Pay</Button>`). Files ending in `.tsx` |
| **Main** | The shared, always-working branch. The live site is built from it |
| **Merge** | Bringing a branch's changes into `main`. Here, only the ticket's reviewer does it |
| **npm** | Downloads libraries and runs the project's commands (`npm run dev`) |
| **Package** | A folder of code with one job and its own `package.json` (e.g. `packages/core`) |
| **Pull request (PR)** | A request to merge a branch, where reviewers read, comment and approve |
| **React** | The library our screens are written with |
| **Redaction** | Removing data a person shouldn't see before sending it (lenders only see their own part) |
| **Review / reviewer** | A teammate reads your PR, asks for changes or approves it |
| **Router** | Code that decides which screen to show (`packages/sdk/src/ui/App.tsx`) |
| **Server** | The back-end program running on port 8787 during `npm run dev` |
| **Shadow DOM / shadow root** | A walled-off area of the page so the bank's styles and ours can't interfere |
| **SDK** | "Software development kit": what a bank installs to embed FamilyShield (`packages/sdk`) |
| **Status (loan)** | `collecting` → `signing` → `active` → `repaid` (or `cancelled`) |
| **Status (ticket)** | Icebox → In progress → Under review → Reviewed → Done. See [team workflow](07-team-workflow.md) |
| **Terminal** | A window where you type commands |
| **Test** | A small program that checks our code gives the right answers |
| **TypeScript** | JavaScript with *types*: labels that say what kind of value something is, checked before running |
| **WebView** | A browser window inside a native phone app; one way banks embed FamilyShield |
