export const SPACING_UNIT = 4;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

export const RADIUS = {
  sm: 2,
  base: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

export const LAYOUT = {
  containerMax: 1440,
  gutter: 24,
} as const;

// Palette tokens are exposed as CSS variable references so that swapping the
// theme is a single setProperty pass on :root rather than a deep re-render or
// per-component refactor. The actual values are written by
// `applyPaletteVars(mode)` from cssVars.ts. Two complete value sets
// (DARK_VALUES / LIGHT_VALUES) live below.
type PaletteToken =
  | 'surface'
  | 'surfaceDim'
  | 'surfaceBright'
  | 'surfaceContainerLowest'
  | 'surfaceContainerLow'
  | 'surfaceContainer'
  | 'surfaceContainerHigh'
  | 'surfaceContainerHighest'
  | 'onSurface'
  | 'onSurfaceVariant'
  | 'outline'
  | 'outlineVariant'
  | 'primary'
  | 'onPrimary'
  | 'primaryContainer'
  | 'onPrimaryContainer'
  | 'secondary'
  | 'secondaryContainer'
  | 'tertiary'
  | 'tertiaryContainer'
  | 'error'
  | 'errorContainer'
  | 'background'
  | 'onBackground';

function toKebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function buildVarRefs(): Record<PaletteToken, string> {
  const keys: PaletteToken[] = [
    'surface', 'surfaceDim', 'surfaceBright',
    'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
    'surfaceContainerHigh', 'surfaceContainerHighest',
    'onSurface', 'onSurfaceVariant',
    'outline', 'outlineVariant',
    'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
    'secondary', 'secondaryContainer',
    'tertiary', 'tertiaryContainer',
    'error', 'errorContainer',
    'background', 'onBackground',
  ];
  const out = {} as Record<PaletteToken, string>;
  for (const k of keys) out[k] = `var(--as-${toKebab(k)})`;
  return out;
}

export const PALETTE: Record<PaletteToken, string> = buildVarRefs();

export const DARK_PALETTE_VALUES: Record<PaletteToken, string> = {
  surface: '#0b1326',
  surfaceDim: '#0b1326',
  surfaceBright: '#31394d',
  surfaceContainerLowest: '#060e20',
  surfaceContainerLow: '#131b2e',
  surfaceContainer: '#171f33',
  surfaceContainerHigh: '#222a3d',
  surfaceContainerHighest: '#2d3449',
  onSurface: '#dae2fd',
  onSurfaceVariant: '#c4c5d9',
  outline: '#8e90a2',
  outlineVariant: '#434656',
  primary: '#b8c3ff',
  onPrimary: '#002388',
  primaryContainer: '#2e5bff',
  onPrimaryContainer: '#efefff',
  secondary: '#c0c1ff',
  secondaryContainer: '#3131c0',
  tertiary: '#89ceff',
  tertiaryContainer: '#0074a6',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  background: '#0b1326',
  onBackground: '#dae2fd',
};

export const LIGHT_PALETTE_VALUES: Record<PaletteToken, string> = {
  surface: '#f6f7fb',
  surfaceDim: '#e6e8f0',
  surfaceBright: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f1f2f7',
  surfaceContainer: '#eaecf3',
  surfaceContainerHigh: '#dfe2ec',
  surfaceContainerHighest: '#d3d6e2',
  onSurface: '#14182b',
  onSurfaceVariant: '#4a4f64',
  outline: '#6b6e7e',
  outlineVariant: '#c8cad6',
  primary: '#2e5bff',
  onPrimary: '#ffffff',
  primaryContainer: '#dde2ff',
  onPrimaryContainer: '#001a6b',
  secondary: '#3131c0',
  secondaryContainer: '#dee0ff',
  tertiary: '#0074a6',
  tertiaryContainer: '#c5e7ff',
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  background: '#f6f7fb',
  onBackground: '#14182b',
};

// AI-glass surface (translucent panel for AI-tagged elements). Two modes:
// the dark variant matches the original design; the light variant tints the
// same accent over a light background so the chip stays readable.
export const DARK_AI_GLASS = {
  background: 'rgba(99, 102, 241, 0.08)',
  border: 'rgba(184, 195, 255, 0.18)',
  blur: 12,
} as const;

export const LIGHT_AI_GLASS = {
  background: 'rgba(46, 91, 255, 0.07)',
  border: 'rgba(46, 91, 255, 0.22)',
  blur: 12,
} as const;

// Kept as a default export for any code that imports it directly; current
// theme uses the per-mode constants above.
export const AI_GLASS = DARK_AI_GLASS;

export const PRIMARY_GRADIENT =
  'linear-gradient(135deg, #2e5bff 0%, #124af0 100%)';

export type ThemeMode = 'light' | 'dark';
