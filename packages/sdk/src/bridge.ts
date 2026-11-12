/**
 * Events the module sends to the host banking app. They are UI hints only:
 * money never moves because of a client-side event. The bank's backend moves
 * money when the FamilyShield service tells it to (see docs/ARCHITECTURE.md).
 */
export type HostEvent =
  /** Embed page only: loaded and waiting for the host's init message. */
  | { type: 'loaded' }
  /** First data loaded; the module is usable. */
  | { type: 'ready' }
  /** The user tapped close/back at the module's root: hide the module. */
  | { type: 'close' }
  | { type: 'request.sent'; loanId: string; amount: number }
  /** The loan went live; the host may want to refresh balances. */
  | { type: 'loan.funded'; loanId: string; amount: number }
  | { type: 'payment.made'; loanId: string; amount: number; remaining: number }
  | { type: 'loan.repaid'; loanId: string }
  | { type: 'reward.claimed'; loanId: string; rewardId: string; partner: string }
  | { type: 'error'; message: string };

export type HostEventType = HostEvent['type'];

/** Wire format used for postMessage / WebView bridges. */
export interface BridgeMessage {
  source: 'familyshield';
  version: 1;
  event: HostEvent;
}

/** Sent by the host to an embedded (iframe / WebView) module to start it. */
export interface InitMessage {
  source: 'familyshield-host';
  version: 1;
  type: 'init';
  /** Opaque to the SDK; passed to the embed page's `createApi`. */
  session: Record<string, unknown>;
  theme?: Partial<import('./theme').Theme>;
}

export function isInitMessage(data: unknown): data is InitMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as InitMessage).source === 'familyshield-host' &&
    (data as InitMessage).type === 'init'
  );
}

interface ReactNativeWebViewWindow {
  ReactNativeWebView?: { postMessage(message: string): void };
  webkit?: { messageHandlers?: { familyshield?: { postMessage(message: unknown): void } } };
  FamilyShieldAndroid?: { postMessage(message: string): void };
}

/**
 * Sends events out of an embedded module to whatever is hosting it:
 * a React Native WebView, an iOS WKWebView, an Android WebView, or a web
 * page (iframe). `hostOrigin` must be the bank's exact origin for iframes;
 * the module never posts to "*".
 */
export function createEmbeddedEmitter(hostOrigin: string | null): (event: HostEvent) => void {
  return (event) => {
    const message: BridgeMessage = { source: 'familyshield', version: 1, event };
    const w = window as unknown as ReactNativeWebViewWindow;
    if (w.ReactNativeWebView) {
      w.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (w.webkit?.messageHandlers?.familyshield) {
      w.webkit.messageHandlers.familyshield.postMessage(message);
    } else if (w.FamilyShieldAndroid) {
      w.FamilyShieldAndroid.postMessage(JSON.stringify(message));
    } else if (window.parent !== window && hostOrigin) {
      window.parent.postMessage(message, hostOrigin);
    }
  };
}
