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

export const PALETTE = {
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
} as const;

export const AI_GLASS = {
  background: 'rgba(99, 102, 241, 0.08)',
  border: 'rgba(184, 195, 255, 0.18)',
  blur: 12,
} as const;

export const PRIMARY_GRADIENT =
  'linear-gradient(135deg, #2e5bff 0%, #124af0 100%)';
