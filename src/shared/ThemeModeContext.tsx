import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import { applyPaletteVars } from './cssVars';
import { buildTheme } from './theme';
import type { ThemeMode } from './constants';
import { ipc } from './ipc';
import { useCurrentUser } from './UserContext';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'autosheets.themePreference';

type Ctx = {
  preference: ThemePreference;
  // The mode actually being rendered (resolved from preference + OS setting).
  resolved: ThemeMode;
  setPreference: (p: ThemePreference) => void;
};

const ThemeModeContext = createContext<Ctx | null>(null);

function readStoredPreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(pref: ThemePreference, prefersDark: boolean): ThemeMode {
  if (pref === 'system') return prefersDark ? 'dark' : 'light';
  return pref;
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const { current, refresh } = useCurrentUser();
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  // When a user signs in, their server-side preference wins over the local
  // default — but we don't override an explicit local change made *after*
  // they signed in (that change is pushed to the server immediately below).
  useEffect(() => {
    if (current?.themePreference) {
      setPreferenceState(current.themePreference);
    }
  }, [current?.id, current?.themePreference]);

  // Track OS-level dark/light changes so 'system' updates live.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const resolved = resolve(preference, prefersDark);

  // Apply CSS vars before paint on every resolved-mode change so the UI
  // never flashes the previous mode's colors.
  useLayoutEffect(() => {
    applyPaletteVars(resolved);
  }, [resolved]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPreferenceState(p);
      try {
        localStorage.setItem(STORAGE_KEY, p);
      } catch {
        /* private mode etc. — fine */
      }
      // Push to backend only if signed in. Fire-and-forget; on failure we
      // keep the local change (it'll re-sync on next login).
      if (current) {
        void ipc('users:setTheme', { theme: p })
          .then(() => refresh())
          .catch(() => undefined);
      }
    },
    [current, refresh],
  );

  const muiTheme = useMemo(() => buildTheme(resolved), [resolved]);

  const value = useMemo<Ctx>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): Ctx {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used inside <ThemeModeProvider>');
  return ctx;
}
