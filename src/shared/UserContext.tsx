import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ipc } from './ipc';
import type { User } from './ipc-contract';

type UserContextValue = {
  current: User | null;
  users: User[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  login: (email: string) => Promise<void>;
  signup: (input: { name: string; email: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await ipc('users:current', undefined);
      setCurrent(c);
      // Only admins need the full user list (for member pickers, team page).
      // Non-admins can manage with just `current`. Errors here shouldn't fail
      // the whole context — keep `users` empty instead.
      try {
        const list = await ipc('users:list', undefined);
        setUsers(list);
      } catch {
        setUsers([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (email: string) => {
      const user = await ipc('auth:login', { email });
      setCurrent(user);
      try {
        const list = await ipc('users:list', undefined);
        setUsers(list);
      } catch {
        setUsers([]);
      }
    },
    [],
  );

  const signup = useCallback(
    async ({ name, email }: { name: string; email: string }) => {
      const user = await ipc('auth:signup', { name, email });
      setCurrent(user);
      try {
        const list = await ipc('users:list', undefined);
        setUsers(list);
      } catch {
        setUsers([]);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    await ipc('auth:logout', undefined);
    setCurrent(null);
    setUsers([]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<UserContextValue>(
    () => ({ current, users, loading, error, refresh, login, signup, logout }),
    [current, users, loading, error, refresh, login, signup, logout],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useCurrentUser must be used inside <UserProvider>');
  return ctx;
}
