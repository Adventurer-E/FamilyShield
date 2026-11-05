import { StrictMode, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import type { FamilyShieldApi } from './api/types';
import type { HostEvent } from './bridge';
import { themeToCss } from './theme';
import type { Theme } from './theme';
import { FamilyShieldProvider } from './ui/context';
import type { Route } from './ui/context';
import { Screens } from './ui/App';
import { styles } from './ui/styles';

export interface FamilyShieldConfig {
  /** Backend adapter for the signed-in customer: `new HttpApi(...)` or a mock. */
  api: FamilyShieldApi;
  /** Receives UI events (ready, close, payment.made, …). */
  onEvent?: (event: HostEvent) => void;
  /** Partner-bank colors; see theme.ts for every token. */
  theme?: Partial<Theme>;
  /** Show demo hints and shortcuts. Never enable in production. */
  demo?: boolean;
  /** Open on a specific screen, e.g. a lender tapping a push notification. */
  initialRoute?: Route;
  /**
   * Isolate the module's styles in a shadow root (default true). Turn off only
   * if the host must style the module's internals itself.
   */
  shadow?: boolean;
}

export interface FamilyShieldHandle {
  unmount(): void;
}

/** The React tree, shared by the inline mount and the embed page. */
export function FamilyShieldApp(props: Omit<FamilyShieldConfig, 'shadow'>) {
  const { api, onEvent, demo = false, initialRoute } = props;
  const emit = useMemo(() => (event: HostEvent) => onEvent?.(event), [onEvent]);
  const vars = useMemo(() => themeToCss(props.theme), [props.theme]);
  return (
    <div className="fs-root" style={cssVars(vars)}>
      <FamilyShieldProvider api={api} emit={emit} demo={demo} initialRoute={initialRoute}>
        {({ ready, loadError }) =>
          ready ? (
            <Screens />
          ) : (
            <div className="fs-loading" role="status">
              {loadError ? (
                <span>
                  FamilyShield couldn’t load: {loadError}
                </span>
              ) : (
                <>
                  <span className="fs-dot" aria-hidden="true" />
                  Loading FamilyShield…
                </>
              )}
            </div>
          )
        }
      </FamilyShieldProvider>
    </div>
  );
}

function cssVars(declarations: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of declarations.split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out as CSSProperties;
}

/**
 * Mount FamilyShield into an element of the bank's app. The module fills the
 * element, so give it a height (typically a full-screen sheet).
 *
 *   const fs = mountFamilyShield(el, { api, onEvent: (e) => e.type === 'close' && hideSheet() });
 *   // later
 *   fs.unmount();
 */
export function mountFamilyShield(element: HTMLElement, config: FamilyShieldConfig): FamilyShieldHandle {
  const useShadow = config.shadow ?? true;
  const host = useShadow ? element.shadowRoot ?? element.attachShadow({ mode: 'open' }) : element;
  const style = document.createElement('style');
  style.textContent = styles;
  const container = document.createElement('div');
  container.style.height = '100%';
  host.append(style, container);

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <FamilyShieldApp api={config.api} onEvent={config.onEvent} theme={config.theme} demo={config.demo} initialRoute={config.initialRoute} />
    </StrictMode>,
  );

  let unmounted = false;
  return {
    unmount() {
      if (unmounted) return;
      unmounted = true;
      // Hosts usually call this from their own React effect cleanup. Unmounting
      // a root synchronously while another root is rendering is unsafe, so
      // defer it to the next task.
      setTimeout(() => {
        root.unmount();
        style.remove();
        container.remove();
      }, 0);
    },
  };
}
