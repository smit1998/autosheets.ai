// Zustand store for the agent's runtime UI state — the bits multiple
// components (Dashboard, Topbar, future toast bar) need to observe and
// react to. Everything in here is pure client state: nothing that lives
// on the main process or comes back from IPC reads belongs here (server
// state goes through TanStack Query instead).

import { create } from 'zustand';
import { ipc } from '../ipc';
import { queryClient } from '../queryClient';
import type { AgentStatus, ClassificationStats, LLMHealth } from '../ipc-contract';

// Survives navigation so the user sees the outcome of their click even if
// they switched pages mid-run. Cleared explicitly via clearLastClassifyResult
// (or implicitly by a fresh classify call).
export type ClassifyResult = {
  stats: ClassificationStats;
  // Wall-clock timestamp of completion. Lets the UI age out stale notices.
  at: number;
};

type AgentStoreState = {
  status: AgentStatus | null;
  llmHealth: LLMHealth | null;
  // Whether a classify call is currently in flight from the UI. Distinct
  // from `status.running` (which reflects the observer loop on main).
  // Cross-component so the topbar spinner can observe it across pages.
  classifying: boolean;
  // Result of the most recent classify call. Kept in the store so the
  // originating page can have unmounted without the user losing context.
  lastClassifyResult: ClassifyResult | null;
  // Last error from any agent-related action. UI-driven; clear when user
  // dismisses or when a new action succeeds.
  error: string | null;
};

type AgentStoreActions = {
  refreshStatus: () => Promise<void>;
  refreshLlmHealth: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  // Runs a classification pass. The work itself runs in the Electron main
  // process and is unaffected by renderer navigation. On completion the
  // result is stashed in the store (so the originating page can have
  // unmounted) and the relevant TanStack queries are invalidated globally
  // (so any other open page refreshes without depending on a mounted
  // listener).
  classifyNow: () => Promise<ClassificationStats>;
  clearLastClassifyResult: () => void;
  // Background polling of agent:status. Idempotent — multiple callers
  // share a single timer.
  startStatusPolling: () => void;
  stopStatusPolling: () => void;
  clearError: () => void;
};

type AgentStore = AgentStoreState & AgentStoreActions;

// Module-private so the timer handle doesn't leak into state subscribers /
// devtools, and so concurrent components share exactly one interval.
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollSubscribers = 0;
const POLL_INTERVAL_MS = 5_000;

function asMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  status: null,
  llmHealth: null,
  classifying: false,
  lastClassifyResult: null,
  error: null,

  refreshStatus: async () => {
    try {
      const status = await ipc('agent:status', undefined);
      set({ status });
    } catch {
      // Silent — polling failures shouldn't pop UI; the next tick will retry.
    }
  },

  refreshLlmHealth: async () => {
    try {
      const llmHealth = await ipc('agent:llmHealth', undefined);
      set({ llmHealth });
    } catch (e) {
      set({ llmHealth: { ok: false, error: asMessage(e) } });
    }
  },

  start: async () => {
    set({ error: null });
    try {
      const status = await ipc('agent:start', undefined);
      set({ status });
    } catch (e) {
      set({ error: asMessage(e) });
    }
  },

  stop: async () => {
    set({ error: null });
    try {
      const status = await ipc('agent:stop', undefined);
      set({ status });
    } catch (e) {
      set({ error: asMessage(e) });
    }
  },

  classifyNow: async () => {
    // Clear any previous result so the user knows the new run has started
    // even if they navigated away from the page that initiated it.
    set({ classifying: true, error: null, lastClassifyResult: null });
    try {
      const stats: ClassificationStats = await ipc('agent:classifyNow', undefined);
      set({ classifying: false, lastClassifyResult: { stats, at: Date.now() } });
      // Pull the fresh pending count so the "N pending observations" label
      // updates immediately after a run.
      void get().refreshStatus();
      // Globally invalidate anything that could have changed. Done here (not
      // in the caller) so the queries refresh whether or not the page that
      // initiated classification is still mounted.
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
      void queryClient.invalidateQueries({ queryKey: ['weekGrid'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      return stats;
    } catch (e) {
      set({ classifying: false, error: asMessage(e) });
      throw e;
    }
  },

  clearLastClassifyResult: () => set({ lastClassifyResult: null }),

  startStatusPolling: () => {
    pollSubscribers += 1;
    if (pollTimer) return;
    void get().refreshStatus();
    pollTimer = setInterval(() => void get().refreshStatus(), POLL_INTERVAL_MS);
  },

  stopStatusPolling: () => {
    pollSubscribers = Math.max(0, pollSubscribers - 1);
    if (pollSubscribers === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },

  clearError: () => set({ error: null }),
}));
