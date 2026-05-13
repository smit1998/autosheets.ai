import { getDatabase } from '../db';
import { requireCurrentUser } from './settings';
import type {
  DashboardProjectShare,
  DashboardSummary,
  TimeEntry,
} from '../../src/shared/ipc-contract';

type ShareRow = { project_id: string; project_name: string; minutes: number };

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

const RECENT_LIMIT = 8;

function rowToEntry(r: EntryRow): TimeEntry {
  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    categoryId: r.category_id,
    categoryName: r.category_name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    source: r.source,
    confidence: r.confidence,
    confirmed: r.confirmed === 1,
    note: r.note,
    createdAt: r.created_at,
  };
}

function monthBounds(month?: string): { start: string; end: string } {
  let year: number;
  let m: number;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    [year, m] = month.split('-').map(Number) as [number, number];
  } else {
    const now = new Date();
    year = now.getFullYear();
    m = now.getMonth() + 1;
  }
  const start = new Date(year, m - 1, 1, 0, 0, 0, 0).toISOString();
  const end = new Date(year, m, 0, 23, 59, 59, 999).toISOString();
  return { start, end };
}

// Aggregates the *current user's* entries for the requested month.
export function getDashboardSummary(input?: { month?: string }): DashboardSummary {
  const user = requireCurrentUser();
  const db = getDatabase();
  const { start, end } = monthBounds(input?.month);

  const shareRows = db
    .prepare(
      `SELECT
         e.project_id,
         p.name AS project_name,
         CAST(SUM(e.duration_seconds) / 60 AS INTEGER) AS minutes
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at <= ?
       GROUP BY e.project_id
       ORDER BY minutes DESC`,
    )
    .all(user.id, start, end) as ShareRow[];

  const byProject: DashboardProjectShare[] = shareRows.map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    minutes: r.minutes ?? 0,
  }));

  const totalMinutes = byProject.reduce((s, p) => s + p.minutes, 0);

  const recentRows = db
    .prepare(
      `SELECT
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
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at <= ?
       ORDER BY e.started_at DESC
       LIMIT ?`,
    )
    .all(user.id, start, end, RECENT_LIMIT) as EntryRow[];

  const recentEntries = recentRows.map(rowToEntry);

  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN source = 'agent' THEN 1 ELSE 0 END) AS agent_total,
         SUM(CASE WHEN source = 'manual' THEN 1 ELSE 0 END) AS manual_total,
         SUM(CASE WHEN source = 'agent' AND confirmed = 0 THEN 1 ELSE 0 END) AS unconfirmed,
         AVG(CASE WHEN source = 'agent' THEN confidence ELSE NULL END) AS avg_agent_conf
       FROM time_entries
       WHERE user_id = ? AND started_at >= ? AND started_at <= ?`,
    )
    .get(user.id, start, end) as {
    total: number;
    agent_total: number | null;
    manual_total: number | null;
    unconfirmed: number | null;
    avg_agent_conf: number | null;
  };

  return {
    monthStart: start,
    monthEnd: end,
    totalMinutes,
    byProject,
    recentEntries,
    totalEntries: counts.total ?? 0,
    agentEntries: counts.agent_total ?? 0,
    manualEntries: counts.manual_total ?? 0,
    unconfirmedAgentEntries: counts.unconfirmed ?? 0,
    averageAgentConfidence: counts.avg_agent_conf,
  };
}
