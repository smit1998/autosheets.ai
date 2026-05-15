import { getDatabase } from '../db';
import { IDLE_APP_NAMES } from '../agent/idle';

export type ObservationInput = {
  userId: string;
  startedAt: string;
  endedAt: string;
  app: string | null;
  windowTitle: string | null;
  url: string | null;
};

export type ObservationRow = {
  id: number;
  userId: string;
  startedAt: string;
  endedAt: string;
  app: string | null;
  windowTitle: string | null;
  url: string | null;
};

type RawRow = {
  id: number;
  user_id: string;
  started_at: string;
  ended_at: string;
  app: string | null;
  window_title: string | null;
  url: string | null;
};

function toObservation(r: RawRow): ObservationRow {
  return {
    id: r.id,
    userId: r.user_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    app: r.app,
    windowTitle: r.window_title,
    url: r.url,
  };
}

export function insertObservation(input: ObservationInput): number {
  const info = getDatabase()
    .prepare(
      `INSERT INTO observations (user_id, started_at, ended_at, app, window_title, url)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.userId, input.startedAt, input.endedAt, input.app, input.windowTitle, input.url);
  return Number(info.lastInsertRowid);
}

// Placeholders + lowercased values for the idle-app exclusion below.
const IDLE_PLACEHOLDERS = IDLE_APP_NAMES.map(() => '?').join(',');

// Returns observations belonging to `userId` that haven't yet been turned
// into a time_entry, oldest first. Idle-app segments (lock screen,
// screensaver) are excluded — they aren't work time and the agent stopped
// recording them, but older databases may still hold some.
export function listUnclassifiedForUser(userId: string, limit = 200): ObservationRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, user_id, started_at, ended_at, app, window_title, url
         FROM observations
        WHERE user_id = ?
          AND classified_entry_id IS NULL
          AND (skip_reason IS NULL OR skip_reason = '')
          AND LOWER(COALESCE(app, '')) NOT IN (${IDLE_PLACEHOLDERS})
        ORDER BY started_at
        LIMIT ?`,
    )
    .all(userId, ...IDLE_APP_NAMES, limit) as RawRow[];
  return rows.map(toObservation);
}

export function markObservationsClassified(ids: number[], entryId: string): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  getDatabase()
    .prepare(
      `UPDATE observations SET classified_entry_id = ? WHERE id IN (${placeholders})`,
    )
    .run(entryId, ...ids);
}

// Marks observations the classifier deliberately declined to turn into a
// time entry (no project fit, low confidence, would round to 0 minutes).
// They stop counting toward "pending" and are skipped on future runs so the
// LLM doesn't keep re-evaluating the same noise.
export function markObservationsSkipped(ids: number[], reason: string): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  getDatabase()
    .prepare(
      `UPDATE observations SET skip_reason = ? WHERE id IN (${placeholders})`,
    )
    .run(reason, ...ids);
}
