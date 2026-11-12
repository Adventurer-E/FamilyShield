import { useEffect, useRef } from 'react';
import { mountFamilyShield } from '@familyshield/sdk';
import type { BridgeMessage, HostEvent, InitMessage } from '@familyshield/sdk';
import { host } from './host';

export type EmbedMode = 'inline' | 'webview';

/**
 * How BlueRiver hosts FamilyShield. Two integration styles, same module:
 *  - inline:  mountFamilyShield() into a div (web or hybrid banking apps)
 *  - webview: the standalone embed page in an iframe, talking over
 *             postMessage, the same protocol a native WebView uses
 */
export function FamilyShieldSheet(props: { userId: string; mode: EmbedMode; onClose: () => void; onEvent: (e: HostEvent) => void }) {
  // Keep the latest callbacks without re-mounting the module.
  const handlers = useRef(props);
  handlers.current = props;

  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { userId, mode } = props;

  useEffect(() => {
    if (mode !== 'inline' || !mountRef.current) return;
    const handle = mountFamilyShield(mountRef.current, {
      api: host.apiFor(userId),
      onEvent: (event) => (event.type === 'close' ? handlers.current.onClose() : handlers.current.onEvent(event)),
    });
    return () => handle.unmount();
  }, [mode, userId]);

  useEffect(() => {
    if (mode !== 'webview') return;
    const onMessage = (msg: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      // Only trust messages from our own embed frame and origin.
      if (!frame || msg.source !== frame || msg.origin !== window.location.origin) return;
      const data = msg.data as BridgeMessage;
      if (data?.source !== 'familyshield') return;
      const event = data.event;
      if (event.type === 'loaded') {
        const init: InitMessage = { source: 'familyshield-host', version: 1, type: 'init', session: { userId } };
        frame.postMessage(init, window.location.origin);
      } else if (event.type === 'close') {
        handlers.current.onClose();
      } else {
        handlers.current.onEvent(event);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [mode, userId]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="FamilyShield">
      {mode === 'inline' ? (
        <div ref={mountRef} className="sheet-body" />
      ) : (
        <iframe key={userId} ref={frameRef} className="sheet-body" title="FamilyShield" src="./embed.html" />
      )}
    </div>
  );
}
