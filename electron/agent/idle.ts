// Foreground "apps" that mean the user isn't actually present — the macOS
// lock screen / login window, the screensaver, etc. Time spent here is not
// work time. Single source of truth: the observer never records segments
// for these, and the classifier excludes any that predate that behaviour.

export const IDLE_APP_NAMES = [
  'loginwindow',
  'screensaverengine',
  'screensaverview',
  'lockoutagent',
] as const;

const IDLE_SET = new Set<string>(IDLE_APP_NAMES);

export function isIdleApp(appName: string | null | undefined): boolean {
  if (!appName) return true; // no foreground app == nothing to attribute
  return IDLE_SET.has(appName.trim().toLowerCase());
}
