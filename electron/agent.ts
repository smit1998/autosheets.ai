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
let lastSweepAt = 0;
const llm: LLMClient = new OllamaClient({
  host: DEFAULT_OLLAMA_HOST,
  model: DEFAULT_OLLAMA_MODEL,
});

// How often the auto-classifier checks the pending queue. The check itself
// is a cheap COUNT(*); the heavy LLM work only fires when the threshold
// below is crossed AND no other run is already in flight.
const AUTO_CHECK_INTERVAL_MS = 60_000;

// Kick off auto-classification as soon as this many observations are queued.
// Set deliberately low (10) so the timesheet stays close to live and we
// never sit on a growing backlog between fixed-interval ticks.
const AUTO_CLASSIFY_THRESHOLD = 10;

// Safety-net cadence: even when pending is below the threshold, sweep the
// queue at least this often so a small trickle still lands in the timesheet
// instead of waiting forever for a 10-row burst.
const AUTO_SWEEP_INTERVAL_MS = 10 * 60_000;

// Max observations a single classification pass will pull. Bumped well above
// the 7B model's per-chunk capacity so a real backlog clears in one run
// (chunking inside the classifier batches it into LLM-friendly slices).
const AUTO_PASS_MAX_OBSERVATIONS = 200;

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
  return runClassificationGuarded(user.id, AUTO_PASS_MAX_OBSERVATIONS);
}

// Background classification loop, started/stopped with the agent. Polls
// pending-observation count cheaply and only fires the (expensive) LLM run
// when the threshold is crossed, or when the safety-net sweep cadence is
// due. Skips ticks while a previous run is still in flight so a slow LLM
// doesn't pile up overlapping requests.
function startAutoClassify(): void {
  if (classifyTimer) return;
  lastSweepAt = Date.now();
  classifyTimer = setInterval(() => {
    void runAutoTick();
  }, AUTO_CHECK_INTERVAL_MS);
  // Fire a check right away so a backlog accumulated while the agent was
  // stopped gets drained without waiting a full check interval.
  void runAutoTick();
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
  if (inFlightClassification) return; // previous run still draining; nothing to do

  // Cheap COUNT(*) — fine to do every minute.
  const pending = pendingObservationCount(user.id);
  const sweepDue = Date.now() - lastSweepAt >= AUTO_SWEEP_INTERVAL_MS;
  if (pending < AUTO_CLASSIFY_THRESHOLD && !sweepDue) return;

  observer?.flushPending();
  lastSweepAt = Date.now();
  try {
    const stats = await runClassificationGuarded(user.id, AUTO_PASS_MAX_OBSERVATIONS);
    if (stats.observations > 0) {
      console.log(
        `[agent] auto-classify (pending=${pending}): classified ${stats.classified}/${stats.observations}, skipped ${stats.skipped}`,
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
async function runClassificationGuarded(
  userId: string,
  maxObservations?: number,
): Promise<ClassificationStats> {
  if (inFlightClassification) return inFlightClassification;
  inFlightClassification = (async () => {
    try {
      return await runClassification({ userId, llm, maxObservations });
    } finally {
      inFlightClassification = null;
    }
  })();
  return inFlightClassification;
}

export async function probeLLM(): Promise<LLMProbe> {
  return llm.probe();
}
