import { createTheme, alpha } from '@mui/material/styles';
import { PALETTE, RADIUS, AI_GLASS, PRIMARY_GRADIENT } from './constants';

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

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: PALETTE.background,
      paper: PALETTE.surfaceContainer,
    },
    primary: {
      main: PALETTE.primary,
      contrastText: PALETTE.onPrimary,
      dark: PALETTE.primaryContainer,
      light: '#dde1ff',
    },
    secondary: {
      main: PALETTE.secondary,
      dark: PALETTE.secondaryContainer,
    },
    info: {
      main: PALETTE.tertiary,
      dark: PALETTE.tertiaryContainer,
    },
    error: {
      main: PALETTE.error,
      dark: PALETTE.errorContainer,
    },
    text: {
      primary: PALETTE.onSurface,
      secondary: PALETTE.onSurfaceVariant,
    },
    divider: PALETTE.outlineVariant,
    aiGlass: AI_GLASS,
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
    h1: {
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 48,
      lineHeight: 1.1,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontFamily: DISPLAY,
      fontWeight: 600,
      fontSize: 32,
      lineHeight: 1.15,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontFamily: DISPLAY,
      fontWeight: 600,
      fontSize: 24,
      lineHeight: 1.2,
    },
    h4: {
      fontFamily: DISPLAY,
      fontWeight: 600,
      fontSize: 20,
      lineHeight: 1.25,
    },
    body1: {
      fontFamily: SANS,
      fontSize: 16,
      lineHeight: 1.6,
    },
    body2: {
      fontFamily: SANS,
      fontSize: 14,
      lineHeight: 1.5,
    },
    button: {
      fontFamily: SANS,
      fontWeight: 600,
      letterSpacing: '0.01em',
      textTransform: 'none',
    },
    caption: {
      fontFamily: SANS,
      fontSize: 12,
      lineHeight: 1.4,
    },
    overline: {
      fontFamily: SANS,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    displayLg: {
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 48,
      lineHeight: 1.1,
      letterSpacing: '-0.02em',
    },
    headlineMd: {
      fontFamily: DISPLAY,
      fontWeight: 600,
      fontSize: 24,
      lineHeight: 1.2,
    },
    labelCaps: {
      fontFamily: SANS,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    dataTabular: {
      fontFamily: SANS,
      fontSize: 14,
      fontWeight: 500,
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: 'dark',
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
        // Tabular figures for any element marked with this class — use on
        // numeric cells in data tables per DESIGN.md.
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
                color: PALETTE.onPrimaryContainer,
                '&:hover': {
                  background: PRIMARY_GRADIENT,
                  boxShadow: `0 0 0 1px ${alpha(PALETTE.primary, 0.4)}, 0 8px 24px ${alpha('#2e5bff', 0.35)}`,
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
            borderColor: PALETTE.primary,
            boxShadow: `0 0 0 3px ${alpha(PALETTE.primary, 0.18)}`,
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
            borderColor: PALETTE.primary,
            borderWidth: 1,
            boxShadow: `0 0 0 3px ${alpha(PALETTE.primary, 0.18)}`,
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
            backgroundColor: alpha(PALETTE.primary, 0.04),
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
