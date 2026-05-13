import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
};

export type AsyncResult<T> = State<T> & {
  refetch: () => void;
};

// Tiny renderer-side fetch hook. Resolves a promise, tracks loading/error,
// and exposes a refetch the caller can fire after mutations. Avoids React
// Query — overkill for an Electron app where IPC is in-process and fast.
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[]): AsyncResult<T> {
  const [state, setState] = useState<State<T>>({ data: undefined, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const cancelled = useRef(false);

  // Capture loader by ref so we don't have to put it in deps. The caller
  // controls invalidation explicitly via `deps` and `refetch`.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    cancelled.current = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loaderRef.current()
      .then((data) => {
        if (!cancelled.current) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled.current) {
          setState({
            data: undefined,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refetch };
}
