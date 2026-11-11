import type { FamilyShieldApi } from '@familyshield/sdk';

/**
 * The "Free option" switch on the functional mockup's toolbar: experiment arm B
 * (M5, hypothesis #8) shows the choice between FamilyShield and arranging the
 * loan for free before the request; arm A doesn't.
 *
 * - Not switched yet: follows show_free_option in data/settings.csv.
 * - A link with ?free_option=yes (arm B) or ?free_option=no (arm A) sets it,
 *   so participants can be sent straight into one arm.
 * - The toolbar switch is remembered in this browser.
 *
 * It works the same in browser and server mode, inline and WebView, because it
 * only changes what the module is told about the setting, not the CSV data.
 */

const KEY = 'mockup-free-option';

/** true / false when switched (link or toolbar); null to follow settings.csv. */
export function readFreeOption(): boolean | null {
  try {
    const fromLink = new URLSearchParams(window.location.search).get('free_option')?.toLowerCase();
    if (fromLink === 'yes') return true;
    if (fromLink === 'no') return false;
    const saved = localStorage.getItem(KEY);
    return saved === 'on' ? true : saved === 'off' ? false : null;
  } catch {
    return null;
  }
}

/** Remember the toolbar choice, and drop ?free_option from the link so it doesn't win next time. */
export function saveFreeOption(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: the switch still works until reload */
  }
  const url = new URL(window.location.href);
  if (url.searchParams.has('free_option')) {
    url.searchParams.delete('free_option');
    window.history.replaceState(null, '', url);
  }
}

/** The API as the module sees it, with show_free_option replaced when the switch is set. */
export function withFreeOption(api: FamilyShieldApi, on: boolean | null): FamilyShieldApi {
  if (on === null) return api;
  return new Proxy(api, {
    get(target, prop) {
      if (prop === 'getConfig') {
        return async () => {
          const config = await target.getConfig();
          return { ...config, rules: { ...config.rules, showFreeOption: on } };
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
