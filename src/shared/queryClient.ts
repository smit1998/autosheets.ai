import { QueryClient } from '@tanstack/react-query';

// One QueryClient for the whole renderer. Settings are tuned for a local
// Electron IPC backend: requests are cheap and never network-flaky, so we
// skip retries and let staleness drive refetches on intent (mutations,
// focus changes) rather than on noisy network heuristics.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 30s default — most lists feel snappy without thrashing IPC.
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
