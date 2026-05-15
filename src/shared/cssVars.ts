import {
  DARK_PALETTE_VALUES,
  LIGHT_PALETTE_VALUES,
  type ThemeMode,
} from './constants';

function toKebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// Writes the active palette to :root as --as-* CSS variables. Components that
// reference PALETTE.* read these via var() at paint time, so this single call
// re-skins the entire app without re-rendering.
export function applyPaletteVars(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const values = mode === 'light' ? LIGHT_PALETTE_VALUES : DARK_PALETTE_VALUES;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(values)) {
    root.style.setProperty(`--as-${toKebab(k)}`, v);
  }
  root.style.colorScheme = mode;
}

// Seed the CSS variables synchronously at module load so the first paint
// already has a complete palette, even before the React tree mounts the
// ThemeModeProvider. The provider will overwrite with the user's actual
// preference once it knows what that is.
if (typeof window !== 'undefined') {
  const prefersDark =
    !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyPaletteVars(prefersDark ? 'dark' : 'light');
}
