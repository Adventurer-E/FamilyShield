/**
 * Partner banks re-skin the module with these tokens. Defaults are the
 * FamilyShield teal, chosen to read as a distinct module inside a navy bank app.
 */
export interface Theme {
  /** Primary actions, progress bars, selected states. */
  brand: string;
  /** Text on brand-colored fills. */
  onBrand: string;
  /** Darker brand for pressed states and text links. */
  brandStrong: string;
  /** Light brand tint for selected backgrounds and notices. */
  brandSoft: string;
  ink: string;
  muted: string;
  line: string;
  surface: string;
  ground: string;
  /** Dark fill for celebratory or summary cards. */
  night: string;
  accent: string;
  radius: string;
  /** Inherit the host app's font by default. */
  font: string;
}

export const defaultTheme: Theme = {
  brand: '#0E6E66',
  onBrand: '#FFFFFF',
  brandStrong: '#0A524C',
  brandSoft: '#E3F2EF',
  ink: '#13213A',
  muted: '#5A6478',
  line: '#E2E6EE',
  surface: '#FFFFFF',
  ground: '#F3F5F9',
  night: '#13213A',
  accent: '#F2C14E',
  radius: '16px',
  font: 'inherit',
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function themeToCss(theme: Partial<Theme> = {}): string {
  const merged = { ...defaultTheme, ...theme };
  return Object.entries(merged)
    .map(([k, v]) => `--fs-${kebab(k)}: ${v};`)
    .join(' ');
}
