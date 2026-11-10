# Integrating FamilyShield into a banking app

There are two ways to embed the module. Both render the same screens and send
the same events.

| | **Inline SDK** | **Embed page (WebView / iframe)** |
| --- | --- | --- |
| Best for | Web and hybrid banking apps | Native iOS / Android apps, or strict CSP setups |
| How | `mountFamilyShield(element, config)` | Load the hosted page, send an `init` message |
| Isolation | Shadow DOM | Separate document |
| Events | `onEvent` callback | `postMessage` / native message handler |

## 1. Authentication

The bank already knows who the customer is. FamilyShield never sees bank
credentials.

1. The bank’s backend calls the FamilyShield service (server to server) to mint
   a **short-lived customer token** for the signed-in customer, e.g.
   `POST /v1/sessions { bankCustomerId }`, which returns `{ token, expiresAt }`.
2. The app hands that token to the module: `getToken` for the inline SDK, or
   `session.token` in the embed page’s init message.
3. Every API call sends `Authorization: Bearer <token>`. Refresh the token
   before it expires; `getToken` is called before every request.

## 2a. Inline SDK (web / hybrid)

```ts
import { mountFamilyShield, HttpApi } from '@familyshield/sdk';

const api = new HttpApi({
  baseUrl: 'https://api.familyshield.example/v1',
  getToken: () => bank.session.familyShieldToken(), // may return a Promise
});

const handle = mountFamilyShield(sheetElement, {
  api,
  theme: { brand: '#0B5CAD', brandStrong: '#08427D', brandSoft: '#E4EEF9' },
  onEvent(event) {
    switch (event.type) {
      case 'close': closeSheet(); break;
      case 'loan.funded':
      case 'payment.made': refreshAccounts(); break;
      case 'error': monitoring.report(event.message); break;
    }
  },
});

// When the sheet is dismissed:
handle.unmount();
```

- Give the element a fixed height (a full-screen sheet is typical). The module
  scrolls inside it.
- The module inherits the host’s `font-family` unless `theme.font` is set.
- To open on a specific screen, for example from a push notification, pass
  `initialRoute: { name: 'respond', loanId }`.
- By default the module opens on the borrower home, or on the lender home when a
  family request is waiting on the user and they have no open request of their own.
  To force one, pass `initialRoute: { name: 'borrowerHome' }` or
  `initialRoute: { name: 'lenderHome' }`. Back (or ✕) at a home closes the module.
- To open straight on the trusted circle (for example from a "Manage family"
  entry in the bank's own settings), pass `initialRoute: { name: 'circle' }`.
  Back from there closes the module.

## 2b. Embed page (native WebView or iframe)

Build and host the embed page (`npm run build -w @familyshield/sdk` creates
`packages/sdk/dist/embed/`). Set `VITE_ALLOWED_HOST_ORIGINS` at build time to
the bank origins allowed to frame it.

### Handshake

```
host                                         embed page
 │  load https://embed.familyshield.example   │
 │ ─────────────────────────────────────────► │
 │      { source:'familyshield', event:{type:'loaded'} }  (iframe hosts only)
 │ ◄───────────────────────────────────────── │
 │  { source:'familyshield-host', version:1, type:'init',
 │    session:{ apiBaseUrl, token }, theme? } │
 │ ─────────────────────────────────────────► │
 │      { source:'familyshield', event:{type:'ready'} } … then UI events
 │ ◄───────────────────────────────────────── │
```

### iframe (web)

```ts
const frame = document.querySelector('iframe#familyshield')!;
const EMBED_ORIGIN = 'https://embed.familyshield.example';
window.addEventListener('message', (msg) => {
  if (msg.origin !== EMBED_ORIGIN || msg.source !== frame.contentWindow) return;
  const { event } = msg.data;
  if (event.type === 'loaded') {
    frame.contentWindow!.postMessage(
      { source: 'familyshield-host', version: 1, type: 'init', session: { apiBaseUrl, token } },
      EMBED_ORIGIN,
    );
  }
  if (event.type === 'close') closeSheet();
});
```

The embed page only accepts `init` from origins in its allow-list, and only
posts events to the origin that initialized it. It never uses `"*"`.

### React Native

```tsx
<WebView
  source={{ uri: 'https://embed.familyshield.example/' }}
  injectedJavaScript={`window.familyShieldInit(${JSON.stringify(JSON.stringify(initMessage))}); true;`}
  onMessage={(e) => handle(JSON.parse(e.nativeEvent.data).event)}
/>
```

### iOS (WKWebView)

Register a script message handler named `familyshield`, then call
`window.familyShieldInit(<json>)` with `evaluateJavaScript` after the page
loads. Events arrive in `userContentController(_:didReceive:)` as dictionaries.

### Android (WebView)

Add a JavaScript interface named `FamilyShieldAndroid` with a
`@JavascriptInterface fun postMessage(json: String)` method, then call
`window.familyShieldInit('<json>')` with `evaluateJavascript` once the page
has loaded.

## 3. Events reference

| Event | When | Typical host reaction |
| --- | --- | --- |
| `loaded` | Embed page ready for `init` (iframe only) | Send `init` |
| `ready` | First data loaded | Hide your spinner |
| `close` | User closed the module from its root screen | Dismiss the sheet |
| `request.sent` | Borrower sent a request | Optional toast |
| `loan.funded` | All signatures in; money moving | Refresh balances |
| `payment.made` | Borrower paid an installment | Refresh balances |
| `loan.repaid` | Final payment | Optional celebration |
| `reward.claimed` | A partner offer was claimed | Analytics |
| `error` | Unexpected failure | Report to monitoring |

Events are **UI hints only**. Money moves server-side; see [ARCHITECTURE.md](ARCHITECTURE.md).

## 4. Theming

All tokens are in `packages/sdk/src/theme.ts`: `brand`, `onBrand`,
`brandStrong`, `brandSoft`, `ink`, `muted`, `line`, `surface`, `ground`,
`night`, `accent`, `radius` and `font`. Check that `onBrand` on `brand` keeps at
least 4.5:1 contrast.

## 5. The entry point in your app

Put one FamilyShield card where customers already manage money, such as the
home screen under quick actions. Show a short status from the service (for
example “Next family payment $157.50 · Dec 5” or “Your family needs you · 1 to
review”) so lenders notice requests without opening the module.
