// Zustand store for the agent's runtime UI state — the bits multiple
// components (Dashboard, Topbar, future toast bar) need to observe and
// react to. Everything in here is pure client state: nothing that lives
// on the main process or comes back from IPC reads belongs here (server
// state goes through TanStack Query instead).

import { create } from 'zustand';
import { ipc } from '../ipc';
import type { AgentStatus, ClassificationStats, LLMHealth } from '../ipc-contract';

type AgentStoreState = {
  status: AgentStatus | null;
  llmHealth: LLMHealth | null;
  // Whether a classify call is currently in flight from the UI. Distinct
  // from `status.running` (which reflects the observer loop on main).
  // Cross-component so a topbar spinner could observe it.
  classifying: boolean;
  // Last error from any agent-related action. UI-driven; clear when user
  // dismisses or when a new action succeeds.
  error: string | null;
};

type AgentStoreActions = {
  refreshStatus: () => Promise<void>;
  refreshLlmHealth: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  // Returns the run's stats so the caller can render an ephemeral, view-local
  // message. We deliberately do NOT keep that message in the store — it would
  // outlive the relevant screen and reappear stale after navigation.
  classifyNow: () => Promise<ClassificationStats>;
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
    set({ classifying: true, error: null });
    try {
      const stats: ClassificationStats = await ipc('agent:classifyNow', undefined);
      set({ classifying: false });
      // Pull the fresh pending count so the "N pending observations" label
      // updates immediately after a run.
      void get().refreshStatus();
      return stats;
    } catch (e) {
      set({ classifying: false, error: asMessage(e) });
      throw e;
    }
  },

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
