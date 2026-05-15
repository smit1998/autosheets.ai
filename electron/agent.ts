// Coordinates the background agent: holds the running observer instance,
// owns the LLM client, exposes start / stop / status / classify-now to the
// IPC layer.

import type { AgentStatus } from '../src/shared/ipc-contract';
import { Observer } from './agent/observer';
import { runClassification, type ClassificationStats } from './agent/classifier';
import { OllamaClient, DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL } from './llm/ollama';
import type { LLMClient, LLMProbe } from './llm/types';
import { getCurrentUser } from './repositories/settings';
import { getDatabase } from './db';
import { IDLE_APP_NAMES } from './agent/idle';

let observer: Observer | null = null;
let startedAt: string | null = null;
let classifyTimer: ReturnType<typeof setInterval> | null = null;
let inFlightClassification: Promise<ClassificationStats> | null = null;
const llm: LLMClient = new OllamaClient({
  host: DEFAULT_OLLAMA_HOST,
  model: DEFAULT_OLLAMA_MODEL,
});

// Auto-classification cadence. Long enough for several observations to
// accumulate so each LLM call has decent context; short enough that the
// timesheet stays fresh through the day.
const AUTO_CLASSIFY_INTERVAL_MS = 5 * 60_000;

function pendingObservationCount(userId: string | null): number {
  if (!userId) return 0;
  // Match the classifier's eligibility filter exactly: idle-app rows
  // (lock screen, screensaver) and rows the LLM has already given up on
  // shouldn't count as "pending" — otherwise the badge sticks above zero
  // forever after a successful classify run.
  const placeholders = IDLE_APP_NAMES.map(() => '?').join(',');
  const row = getDatabase()
    .prepare(
      `SELECT COUNT(*) AS n FROM observations
        WHERE user_id = ?
          AND classified_entry_id IS NULL
          AND (skip_reason IS NULL OR skip_reason = '')
          AND LOWER(COALESCE(app, '')) NOT IN (${placeholders})`,
    )
    .get(userId, ...IDLE_APP_NAMES) as { n: number };
  return row.n;
}

export function agentState(): AgentStatus {
  const running = observer?.isRunning() ?? false;
  const user = getCurrentUser();
  return {
    running,
    startedAt,
    lastObservationAt: observer?.getLastObservationAt()?.toISOString() ?? null,
    pendingObservations: pendingObservationCount(user?.id ?? null),
    lastError: observer?.getLastError() ?? null,
  };
}

export function startAgent(): AgentStatus {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in before starting the agent.');
  if (observer?.isRunning()) return agentState();

  observer = new Observer({
    userId: user.id,
    onError: (err) => {
      // Per-tick errors are recoverable; we only log here so they're visible
      // in the dev console. The renderer reads `lastError` via agent:status.
      console.error('[agent] observation error:', err);
    },
  });
  observer.start();
  startedAt = new Date().toISOString();
  startAutoClassify();
  return agentState();
}

export async function stopAgent(): Promise<AgentStatus> {
  stopAutoClassify();
  if (observer) {
    await observer.stop();
    observer = null;
  }
  startedAt = null;
  return agentState();
}

export async function classifyNow(): Promise<ClassificationStats> {
  const user = getCurrentUser();
  if (!user) throw new Error('Sign in before running classification.');
  // Flush whatever the user is doing right now so the classifier sees it.
  observer?.flushPending();
  return runClassificationGuarded(user.id);
}

// Background classification loop, started/stopped with the agent. Skips
// ticks while a previous run is still in flight so a slow LLM doesn't pile
// up overlapping requests.
function startAutoClassify(): void {
  if (classifyTimer) return;
  classifyTimer = setInterval(() => {
    void runAutoTick();
  }, AUTO_CLASSIFY_INTERVAL_MS);
}

function stopAutoClassify(): void {
  if (classifyTimer) {
    clearInterval(classifyTimer);
    classifyTimer = null;
  }
}

async function runAutoTick(): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;
  observer?.flushPending();
  try {
    const stats = await runClassificationGuarded(user.id);
    if (stats.observations > 0) {
      console.log(
        `[agent] auto-classify: classified ${stats.classified}/${stats.observations}, skipped ${stats.skipped}`,
      );
    }
  } catch (e) {
    console.error('[agent] auto-classify failed:', e);
  }
}

// If a classification run (auto or manual) is already in flight, callers
// share its promise and get the *real* result rather than a misleading
// "nothing to classify" empty stats object. The userId of the first caller
// wins — switching users mid-run is an edge case we don't special-case.
async function runClassificationGuarded(userId: string): Promise<ClassificationStats> {
  if (inFlightClassification) return inFlightClassification;
  inFlightClassification = (async () => {
    try {
      return await runClassification({ userId, llm });
    } finally {
      inFlightClassification = null;
    }
  })();
  return inFlightClassification;
}

export async function probeLLM(): Promise<LLMProbe> {
  return llm.probe();
}
