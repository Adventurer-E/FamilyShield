# 3. Find and change anything

The everyday loop is: **see something → find its code → change it → watch it
update.** This page teaches that loop with a real example.

## The loop, with an example

Let's change the button **Start a request** on the FamilyShield hub to say
**Ask my family**.

1. **Run the app** with `npm run dev` and open http://localhost:5173.
2. **Search for the exact words you see.** In VS Code press **Ctrl+Shift+F**
   (Cmd+Shift+F on a Mac) and type `Start a request`. One result appears:
   `packages/sdk/src/ui/screens/Hub.tsx`.
3. **Open it and change the words** between the tags:

   ```tsx
   <Button onClick={() => go({ name: 'request' })}>{myLoan ? 'Start a new request' : 'Start a request'}</Button>
   ```

   becomes

   ```tsx
   <Button onClick={() => go({ name: 'request' })}>{myLoan ? 'Ask my family again' : 'Ask my family'}</Button>
   ```

4. **Save** (Ctrl+S). The browser updates by itself within a second. This is
   called *hot reload*. No restart needed.

That's 90% of everyday changes. If a search finds nothing, the text probably
comes from **data** (a name, an amount, a reward): look in `data/*.csv`, or in
the screen's guide under [Screen by screen](screens/README.md).

> **Tip:** text that's built from pieces, like `Pay $157.50 now`, won't be found
> whole. Search for a fixed part instead: `now` is too common, but `Pay {` works.
> Searching for `>Pay ` finds it too.

## Reading a screen file (just enough React)

Screen files end in `.tsx`. They're TypeScript with HTML-like tags mixed in
(called **JSX**). Here's a trimmed real example from `Reward.tsx`, annotated:

```tsx
export function Reward({ loan, rewardId }) {          // ① a "component": a function that returns UI
  const { api, run, data } = useFs();                   // ② get shared data and tools
  const reward = data.config.rewards.find((r) => r.id === rewardId);  // ③ normal code: find the reward

  return (                                              // ④ what to draw
    <Screen title={reward.name} eyebrow="FamilyShield rewards">       {/* ⑤ our page frame (header + back button) */}
      <h2 className="fs-h2">{reward.headline}</h2>     {/* ⑥ {curly braces} = insert a value */}
      {code ? <div className="fs-code">…</div>          /* ⑦ condition: show this… */
            : <Button onClick={claim}>Claim offer for my family</Button>}   {/* …or this */}
    </Screen>
  );
}
```

| Mark | Means |
| --- | --- |
| ① | A **component** is a reusable piece of screen. `Reward` draws the whole reward page. |
| ② | `useFs()` gives every screen the same toolbox: `data` (everything loaded from the back-end), `api` (to send actions), `go` (to open another screen), `run` (to call the API and show errors nicely). |
| ⑤ | Capitalized tags like `<Screen>`, `<Button>`, `<Notice>` are **our** components, from `packages/sdk/src/ui/kit.tsx`. Lowercase tags like `<div>`, `<h2>` are plain HTML. |
| ⑥ | `{…}` drops a value into the page. `className="fs-h2"` picks a style (see below). |
| ⑦ | `condition ? A : B` shows A or B. You'll also see `condition ? A : null`, which means "A or nothing". |

You don't need more React than that to make most changes.

## Changing how things look

| Where | Styles live in | How it works |
| --- | --- | --- |
| FamilyShield module (`packages/sdk`) | `packages/sdk/src/ui/styles.ts` | One big CSS text. Class names start with `fs-` (e.g. `.fs-btn.primary`). Some elements also have `style={{ … }}` written right on them in the `.tsx` file |
| Brand colors of the module | `packages/sdk/src/theme.ts` | `brand: '#0E6E66'` is the teal; change it here and every button, bar and highlight follows |
| BlueRiver bank + top bar | `apps/demo-bank/src/styles.css` | Normal CSS file |

**Finding a style in the browser:** right-click the element → **Inspect**. The
FamilyShield module lives inside a `#shadow-root` (a walled-off area so the
bank's styles can't break it). Expand it to see the elements and their
`fs-…` classes, then search for that class in `styles.ts`.

## When something breaks

- **Red error text in the terminal** names the file and line. Undo your last
  change (Ctrl+Z) if you're not sure.
- **A blank or frozen screen**: open the browser's developer tools (F12) →
  **Console**. The red message usually names the component.
- **"Can't load the data" banner** at the top of the page: the server isn't
  running, or a CSV file has a typo. The message says exactly which file, line
  and column.
- Everything weird? Stop (Ctrl+C), run `npm install`, then `npm run dev` again.

## Before you hand your change to a reviewer

```bash
npm run check
```

It runs the same checks GitHub runs (types, tests, build). Fix anything red,
then follow [How we work as a team](07-team-workflow.md).

**Next:** [Screen by screen →](screens/README.md)
