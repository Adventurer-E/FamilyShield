import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { FamilyShieldApi } from './api/types';
import { createEmbeddedEmitter, isInitMessage } from './bridge';
import type { BridgeMessage, InitMessage } from './bridge';
import { FamilyShieldApp } from './mount';
import { styles } from './ui/styles';

export interface EmbedOptions {
  /** Build the API for the session the host sent in its init message. */
  createApi: (session: InitMessage['session']) => FamilyShieldApi;
  /**
   * Origins allowed to host this page in an iframe. Init messages from any
   * other origin are ignored. Native WebViews (React Native, WKWebView,
   * Android) don't use origins; they inject the init message instead.
   */
  allowedHostOrigins: string[];
  /** Element to render into; defaults to #root, created if missing. */
  container?: HTMLElement;
}

declare global {
  interface Window {
    /** Native WebView hosts call this with the init message (as an object or JSON string). */
    familyShieldInit?: (message: InitMessage | string) => void;
  }
}

/**
 * Boot the standalone page a bank loads in a WebView or iframe. The page
 * waits for the host's init message, which carries the customer session,
 * then renders the module full-screen.
 */
export function bootEmbed(options: EmbedOptions): void {
  const style = document.createElement('style');
  style.textContent = `${styles}\nhtml, body { margin: 0; height: 100%; } #root { height: 100%; }`;
  document.head.append(style);

  const container =
    options.container ??
    document.getElementById('root') ??
    document.body.appendChild(Object.assign(document.createElement('div'), { id: 'root' }));

  let started = false;
  const start = (message: InitMessage, hostOrigin: string | null) => {
    if (started) return;
    started = true;
    const emit = createEmbeddedEmitter(hostOrigin);
    createRoot(container).render(
      <StrictMode>
        <FamilyShieldApp api={options.createApi(message.session)} onEvent={emit} theme={message.theme} />
      </StrictMode>,
    );
  };

  // iframe hosts: postMessage from an allowed origin only.
  window.addEventListener('message', (event: MessageEvent) => {
    if (!options.allowedHostOrigins.includes(event.origin)) return;
    if (isInitMessage(event.data)) start(event.data, event.origin);
  });

  // Native WebView hosts: injected JavaScript calls window.familyShieldInit(...).
  window.familyShieldInit = (raw) => {
    const message: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (isInitMessage(message)) start(message, null);
  };

  // Tell an iframe host we're ready for the init message.
  if (window.parent !== window) {
    for (const origin of options.allowedHostOrigins) {
      const loaded: BridgeMessage = { source: 'familyshield', version: 1, event: { type: 'loaded' } };
      window.parent.postMessage(loaded, origin);
    }
  }
}
