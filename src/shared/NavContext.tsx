import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Route = 'dashboard' | 'projects' | 'timesheets' | 'team' | 'analytics';

type NavContextValue = {
  route: Route;
  setRoute: (r: Route) => void;
};

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>('dashboard');
  const value = useMemo(() => ({ route, setRoute }), [route]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavProvider>');
  return ctx;
}
