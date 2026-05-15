import { createTheme, alpha, type Theme } from '@mui/material/styles';
import {
  PALETTE,
  RADIUS,
  DARK_AI_GLASS,
  LIGHT_AI_GLASS,
  DARK_PALETTE_VALUES,
  LIGHT_PALETTE_VALUES,
  PRIMARY_GRADIENT,
  type ThemeMode,
} from './constants';

declare module '@mui/material/styles' {
  interface TypographyVariants {
    displayLg: React.CSSProperties;
    headlineMd: React.CSSProperties;
    labelCaps: React.CSSProperties;
    dataTabular: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    displayLg?: React.CSSProperties;
    headlineMd?: React.CSSProperties;
    labelCaps?: React.CSSProperties;
    dataTabular?: React.CSSProperties;
  }
  interface Palette {
    aiGlass: { background: string; border: string; blur: number };
    gradients: { primary: string };
  }
  interface PaletteOptions {
    aiGlass?: { background: string; border: string; blur: number };
    gradients?: { primary: string };
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    displayLg: true;
    headlineMd: true;
    labelCaps: true;
    dataTabular: true;
  }
}

const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DISPLAY = '"Space Grotesk", "Inter", system-ui, sans-serif';

// Build the MUI theme for a given mode. Component overrides reference
// PALETTE.* (var() strings) so they automatically reflect whichever set of
// CSS variables is currently on :root. The few alpha() calls below need real
// color values (CSS var refs can't be parsed by alpha), so we pull those from
// the raw value tables for the current mode.
export function buildTheme(mode: ThemeMode): Theme {
  const values = mode === 'light' ? LIGHT_PALETTE_VALUES : DARK_PALETTE_VALUES;
  const aiGlass = mode === 'light' ? LIGHT_AI_GLASS : DARK_AI_GLASS;
  return createTheme({
    // MUI runs color math (contrast, light/dark shading, hover overlays) on
    // these entries internally — they must be real color strings, not the
    // var() refs used elsewhere. Component overrides below stay on var()
    // refs so they swap live with the CSS variables.
    palette: {
      mode,
      background: {
        default: values.background,
        paper: values.surfaceContainer,
      },
      primary: {
        main: values.primary,
        contrastText: values.onPrimary,
        dark: values.primaryContainer,
        light: mode === 'light' ? '#5a7dff' : '#dde1ff',
      },
      secondary: {
        main: values.secondary,
        dark: values.secondaryContainer,
      },
      info: {
        main: values.tertiary,
        dark: values.tertiaryContainer,
      },
      error: {
        main: values.error,
        dark: values.errorContainer,
      },
      text: {
        primary: values.onSurface,
        secondary: values.onSurfaceVariant,
      },
      divider: values.outlineVariant,
      aiGlass: { ...aiGlass },
      gradients: { primary: PRIMARY_GRADIENT },
    },
    shape: {
      borderRadius: RADIUS.base,
    },
    spacing: 4,
    typography: {
      fontFamily: SANS,
      htmlFontSize: 16,
      fontSize: 14,
      h1: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 48, lineHeight: 1.1, letterSpacing: '-0.02em' },
      h2: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 32, lineHeight: 1.15, letterSpacing: '-0.01em' },
      h3: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, lineHeight: 1.2 },
      h4: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 20, lineHeight: 1.25 },
      body1: { fontFamily: SANS, fontSize: 16, lineHeight: 1.6 },
      body2: { fontFamily: SANS, fontSize: 14, lineHeight: 1.5 },
      button: { fontFamily: SANS, fontWeight: 600, letterSpacing: '0.01em', textTransform: 'none' },
      caption: { fontFamily: SANS, fontSize: 12, lineHeight: 1.4 },
      overline: { fontFamily: SANS, fontSize: 12, fontWeight: 600, lineHeight: 1, letterSpacing: '0.05em', textTransform: 'uppercase' },
      displayLg: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 48, lineHeight: 1.1, letterSpacing: '-0.02em' },
      headlineMd: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, lineHeight: 1.2 },
      labelCaps: { fontFamily: SANS, fontSize: 12, fontWeight: 600, lineHeight: 1, letterSpacing: '0.05em', textTransform: 'uppercase' },
      dataTabular: { fontFamily: SANS, fontSize: 14, fontWeight: 500, lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            colorScheme: mode,
          },
          body: {
            backgroundColor: PALETTE.background,
            color: PALETTE.onSurface,
            fontFamily: SANS,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          '*, *::before, *::after': {
            boxSizing: 'border-box',
          },
          '.tnum': {
            fontVariantNumeric: 'tabular-nums',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: PALETTE.surfaceContainer,
            border: `1px solid ${PALETTE.outlineVariant}`,
            borderRadius: RADIUS.lg,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: PALETTE.surfaceContainerLow,
            border: `1px solid ${PALETTE.outlineVariant}`,
            borderRadius: RADIUS.lg,
            backgroundImage: 'none',
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: RADIUS.base,
            paddingInline: 16,
            paddingBlock: 8,
            fontWeight: 600,
            variants: [
              {
                props: { variant: 'contained', color: 'primary' },
                style: {
                  background: PRIMARY_GRADIENT,
                  color: '#ffffff',
                  '&:hover': {
                    background: PRIMARY_GRADIENT,
                    boxShadow: `0 0 0 1px ${alpha(values.primary, 0.4)}, 0 8px 24px ${alpha('#2e5bff', 0.35)}`,
                  },
                },
              },
              {
                props: { variant: 'outlined' },
                style: { borderColor: PALETTE.outlineVariant },
              },
            ],
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'filled',
          size: 'small',
        },
      },
      MuiFilledInput: {
        styleOverrides: {
          root: {
            backgroundColor: PALETTE.surfaceContainerLowest,
            borderRadius: RADIUS.base,
            border: `1px solid ${PALETTE.outlineVariant}`,
            '&:hover': {
              backgroundColor: PALETTE.surfaceContainerLow,
            },
            '&.Mui-focused': {
              backgroundColor: PALETTE.surfaceContainerLow,
              borderColor: values.primary,
              boxShadow: `0 0 0 3px ${alpha(values.primary, 0.18)}`,
            },
            '&::before, &::after': { display: 'none' },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.base,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: PALETTE.outlineVariant,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: PALETTE.outline,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: values.primary,
              borderWidth: 1,
              boxShadow: `0 0 0 3px ${alpha(values.primary, 0.18)}`,
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.full,
            fontWeight: 500,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: PALETTE.outlineVariant,
            fontFamily: SANS,
          },
          head: {
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: PALETTE.onSurfaceVariant,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: alpha(values.primary, 0.04),
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: PALETTE.surfaceContainerHighest,
            border: `1px solid ${PALETTE.outlineVariant}`,
            fontSize: 12,
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: PALETTE.outlineVariant },
        },
      },
    },
  });
}

// Default export for any callers that still want a single theme reference
// (kept for backwards-compatibility — new code should use buildTheme(mode)
// via ThemeModeProvider).
export const theme = buildTheme('dark');
