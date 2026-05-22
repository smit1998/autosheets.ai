import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Route = 'dashboard' | 'projects' | 'timesheets' | 'team' | 'analytics';

// Per-route params. Today only Analytics uses any (to scope to a specific
// member when an admin drills in from the Team page); add more as needed.
export type NavParams = {
  memberId?: string;
  memberName?: string;
};

type NavContextValue = {
  route: Route;
  params: NavParams;
  // Setting a route without explicit params clears the previous params, so
  // params only survive the single transition that set them.
  setRoute: (r: Route, params?: NavParams) => void;
};

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [route, setRouteState] = useState<Route>('dashboard');
  const [params, setParamsState] = useState<NavParams>({});

  const setRoute = useCallback((r: Route, p: NavParams = {}) => {
    setRouteState(r);
    setParamsState(p);
  }, []);

  const value = useMemo(() => ({ route, params, setRoute }), [route, params, setRoute]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavProvider>');
  return ctx;
}
