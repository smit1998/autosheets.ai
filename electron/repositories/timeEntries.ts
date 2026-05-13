import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db';
import { requireCurrentUser } from './settings';
import type { TimeEntry, WeekGrid, WeekGridRow } from '../../src/shared/ipc-contract';

type EntryRow = {
  id: string;
  project_id: string;
  project_name: string;
  category_id: string;
  category_name: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  source: 'agent' | 'manual';
  confidence: number | null;
  confirmed: number;
  note: string | null;
  created_at: string;
};

const SELECT = `
  SELECT
    e.id,
    e.project_id,
    p.name AS project_name,
    e.category_id,
    c.name AS category_name,
    e.started_at,
    e.ended_at,
    e.duration_seconds,
    e.source,
    e.confidence,
    e.confirmed,
    e.note,
    e.created_at
  FROM time_entries e
  JOIN projects p ON p.id = e.project_id
  JOIN categories c ON c.id = e.category_id
`;

function rowToEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    source: row.source,
    confidence: row.confidence,
    confirmed: row.confirmed === 1,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function listTimeEntriesForDate({ date }: { date: string }): TimeEntry[] {
  const user = requireCurrentUser();
  const start = `${date}T00:00:00.000Z`;
  const end = `${date}T23:59:59.999Z`;
  const rows = getDatabase()
    .prepare(
      `${SELECT}
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at <= ?
       ORDER BY e.started_at`,
    )
    .all(user.id, start, end) as EntryRow[];
  return rows.map(rowToEntry);
}

export function createTimeEntry(input: {
  projectId: string;
  categoryId: string;
  startedAt: string;
  endedAt: string;
  note?: string;
}): TimeEntry {
  const startMs = new Date(input.startedAt).getTime();
  const endMs = new Date(input.endedAt).getTime();
  if (endMs <= startMs) {
    throw new Error('End time must be after start time.');
  }
  const user = requireCurrentUser();
  const db = getDatabase();
  const category = db
    .prepare('SELECT project_id FROM categories WHERE id = ?')
    .get(input.categoryId) as { project_id: string } | undefined;
  if (!category) throw new Error('Category not found.');
  if (category.project_id !== input.projectId) {
    throw new Error('Selected category does not belong to the selected project.');
  }
  if (!user.isAdmin) {
    const member = db
      .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(input.projectId, user.id);
    if (!member) throw new Error('You are not a member of this project.');
  }
  const id = randomUUID();
  const durationSeconds = Math.round((endMs - startMs) / 1000);
  db.prepare(
    `INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?)`,
  ).run(
    id,
    user.id,
    input.projectId,
    input.categoryId,
    input.startedAt,
    input.endedAt,
    durationSeconds,
    input.note ?? null,
  );
  const row = db.prepare(`${SELECT} WHERE e.id = ?`).get(id) as EntryRow;
  return rowToEntry(row);
}

export function confirmTimeEntry({ id }: { id: string }): TimeEntry {
  const user = requireCurrentUser();
  const db = getDatabase();
  const owner = db.prepare(`SELECT user_id FROM time_entries WHERE id = ?`).get(id) as
    | { user_id: string | null }
    | undefined;
  if (!owner) throw new Error('Entry not found.');
  if (!user.isAdmin && owner.user_id !== user.id) {
    throw new Error('You can only confirm your own entries.');
  }
  db.prepare(`UPDATE time_entries SET confirmed = 1 WHERE id = ?`).run(id);
  const row = db.prepare(`${SELECT} WHERE e.id = ?`).get(id) as EntryRow;
  return rowToEntry(row);
}

export function deleteTimeEntry({ id }: { id: string }): void {
  const user = requireCurrentUser();
  const db = getDatabase();
  const owner = db.prepare(`SELECT user_id FROM time_entries WHERE id = ?`).get(id) as
    | { user_id: string | null }
    | undefined;
  if (!owner) return;
  if (!user.isAdmin && owner.user_id !== user.id) {
    throw new Error('You can only delete your own entries.');
  }
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
}

// ── Weekly grid ───────────────────────────────────────────────────────────

// Local calendar date (YYYY-MM-DD) for an ISO timestamp. The main process
// runs in the user's timezone, so "the day this happened" matches what the
// user sees in the UI.
function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00`); // parsed in local time
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getWeekGrid({ weekStart }: { weekStart: string }): WeekGrid {
  const user = requireCurrentUser();
  const db = getDatabase();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Pull every entry whose local day falls in the window. date(..., 'localtime')
  // converts the stored UTC timestamp to the local calendar day so it lines up
  // with `days`.
  type Raw = {
    project_id: string;
    project_name: string;
    category_id: string;
    category_name: string;
    started_at: string;
    duration_seconds: number;
    source: 'agent' | 'manual';
    confirmed: number;
  };
  const rows = db
    .prepare(
      `SELECT
         e.project_id, p.name AS project_name,
         e.category_id, c.name AS category_name,
         e.started_at, e.duration_seconds, e.source, e.confirmed
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ?
         AND date(e.started_at, 'localtime') >= ?
         AND date(e.started_at, 'localtime') <= ?`,
    )
    .all(user.id, days[0], days[6]) as Raw[];

  const dayIndex = new Map(days.map((d, i) => [d, i]));
  // Key: `${projectId}|${categoryId}`
  const grid = new Map<string, WeekGridRow>();
  for (const r of rows) {
    const idx = dayIndex.get(localDate(r.started_at));
    if (idx === undefined) continue; // shouldn't happen given the WHERE clause
    const key = `${r.project_id}|${r.category_id}`;
    let row = grid.get(key);
    if (!row) {
      row = {
        projectId: r.project_id,
        projectName: r.project_name,
        categoryId: r.category_id,
        categoryName: r.category_name,
        cells: Array.from({ length: 7 }, () => 0),
        agentCells: Array.from({ length: 7 }, () => false),
      };
      grid.set(key, row);
    }
    row.cells[idx] += r.duration_seconds;
    if (r.source === 'agent' && r.confirmed === 0) row.agentCells[idx] = true;
  }

  const sorted = Array.from(grid.values()).sort(
    (a, b) =>
      a.projectName.localeCompare(b.projectName) ||
      a.categoryName.localeCompare(b.categoryName),
  );

  return { weekStart, days, rows: sorted };
}

// Sets the total time for one (project, category, calendar day) cell. Wipes
// whatever entries existed for that cell — agent or manual — and replaces
// them with one manual, pre-confirmed entry, anchored at local noon so it
// stays within the day regardless of timezone. A duration of 0 just clears
// the cell.
export function setWeekCell(input: {
  projectId: string;
  categoryId: string;
  date: string;
  durationSeconds: number;
}): void {
  const user = requireCurrentUser();
  const db = getDatabase();

  const category = db
    .prepare('SELECT project_id FROM categories WHERE id = ?')
    .get(input.categoryId) as { project_id: string } | undefined;
  if (!category) throw new Error('Category not found.');
  if (category.project_id !== input.projectId) {
    throw new Error('Selected category does not belong to the selected project.');
  }
  if (!user.isAdmin) {
    const member = db
      .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
      .get(input.projectId, user.id);
    if (!member) throw new Error('You are not a member of this project.');
  }

  const seconds = Math.max(0, Math.round(input.durationSeconds));
  const remove = db.prepare(
    `DELETE FROM time_entries
       WHERE user_id = ? AND project_id = ? AND category_id = ?
         AND date(started_at, 'localtime') = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confidence, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', NULL, 1, NULL)`,
  );

  const tx = db.transaction(() => {
    remove.run(user.id, input.projectId, input.categoryId, input.date);
    if (seconds > 0) {
      const startedAt = new Date(`${input.date}T12:00:00`).toISOString();
      const endedAt = new Date(new Date(startedAt).getTime() + seconds * 1000).toISOString();
      insert.run(
        randomUUID(),
        user.id,
        input.projectId,
        input.categoryId,
        startedAt,
        endedAt,
        seconds,
      );
    }
  });
  tx();
}
