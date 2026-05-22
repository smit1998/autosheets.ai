import { getDatabase } from '../db';
import { requireCurrentUser } from './settings';
import type {
  AnalyticsBreakdownItem,
  AnalyticsOverview,
  AnalyticsRange,
} from '../../src/shared/ipc-contract';

function rangeDays(range: AnalyticsRange): number {
  switch (range) {
    case 'last7':
      return 7;
    case 'last90':
      return 90;
    case 'last30':
    default:
      return 30;
  }
}

// Local calendar date helpers — the main process runs in the user's
// timezone, so "today" / "N days ago" match what the user sees in the UI.
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

export function getAnalyticsOverview({
  range,
  userId,
}: {
  range: AnalyticsRange;
  userId?: string;
}): AnalyticsOverview {
  const user = requireCurrentUser();
  const db = getDatabase();

  // Admin can ask for a specific user; otherwise admin gets team-wide and
  // non-admins are silently scoped to themselves regardless of `userId`.
  const scopedUserId = user.isAdmin && userId ? userId : user.isAdmin ? null : user.id;
  const teamWide = scopedUserId === null;

  const days = rangeDays(range);
  const today = new Date();
  const endDate = isoLocal(today);
  const startDate = isoLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)));

  // Shared WHERE fragment across all aggregations. date(..., 'localtime')
  // converts the stored UTC timestamps to the local calendar day so the
  // window lines up with the dates above.
  const scoped = teamWide ? '' : ' AND e.user_id = @uid';
  const where = `date(e.started_at, 'localtime') >= @start AND date(e.started_at, 'localtime') <= @end${scoped}`;
  const params = teamWide
    ? { start: startDate, end: endDate }
    : { start: startDate, end: endDate, uid: scopedUserId };

  const totals = db
    .prepare(`SELECT COALESCE(SUM(e.duration_seconds), 0) AS s, COUNT(*) AS n FROM time_entries e WHERE ${where}`)
    .get(params) as { s: number; n: number };

  const projectsCount = db
    .prepare(`SELECT COUNT(DISTINCT e.project_id) AS n FROM time_entries e WHERE ${where}`)
    .get(params) as { n: number };

  const bySourceRows = db
    .prepare(`SELECT e.source AS src, COALESCE(SUM(e.duration_seconds), 0) AS s FROM time_entries e WHERE ${where} GROUP BY e.source`)
    .all(params) as { src: 'agent' | 'manual'; s: number }[];
  const agentSeconds = bySourceRows.find((r) => r.src === 'agent')?.s ?? 0;
  const manualSeconds = bySourceRows.find((r) => r.src === 'manual')?.s ?? 0;

  // Daily totals — fill in every day in the window so the chart has no gaps.
  const dailyRows = db
    .prepare(`SELECT date(e.started_at, 'localtime') AS d, COALESCE(SUM(e.duration_seconds), 0) AS s FROM time_entries e WHERE ${where} GROUP BY d`)
    .all(params) as { d: string; s: number }[];
  const dailyMap = new Map(dailyRows.map((r) => [r.d, r.s]));
  const daily: { date: string; seconds: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDaysIso(startDate, i);
    daily.push({ date, seconds: dailyMap.get(date) ?? 0 });
  }

  const byProject = (
    db
      .prepare(
        `SELECT e.project_id AS id, p.name AS label, COALESCE(SUM(e.duration_seconds), 0) AS s
           FROM time_entries e JOIN projects p ON p.id = e.project_id
          WHERE ${where}
          GROUP BY e.project_id
          ORDER BY s DESC`,
      )
      .all(params) as { id: string; label: string; s: number }[]
  ).map<AnalyticsBreakdownItem>((r) => ({ id: r.id, label: r.label, seconds: r.s }));

  const byCategory = (
    db
      .prepare(
        `SELECT e.category_id AS id, c.name AS label, p.name AS sublabel, COALESCE(SUM(e.duration_seconds), 0) AS s
           FROM time_entries e
           JOIN categories c ON c.id = e.category_id
           JOIN projects p ON p.id = e.project_id
          WHERE ${where}
          GROUP BY e.category_id
          ORDER BY s DESC`,
      )
      .all(params) as { id: string; label: string; sublabel: string; s: number }[]
  ).map<AnalyticsBreakdownItem>((r) => ({ id: r.id, label: r.label, sublabel: r.sublabel, seconds: r.s }));

  const byUser: AnalyticsBreakdownItem[] = teamWide
    ? (
        db
          .prepare(
            `SELECT e.user_id AS id, u.name AS label, COALESCE(SUM(e.duration_seconds), 0) AS s
               FROM time_entries e JOIN users u ON u.id = e.user_id
              WHERE ${where}
              GROUP BY e.user_id
              ORDER BY s DESC`,
          )
          .all(params) as { id: string; label: string; s: number }[]
      ).map<AnalyticsBreakdownItem>((r) => ({ id: r.id, label: r.label, seconds: r.s }))
    : [];

  return {
    range,
    startDate,
    endDate,
    totalSeconds: totals.s,
    entryCount: totals.n,
    activeProjectCount: projectsCount.n,
    agentSeconds,
    manualSeconds,
    daily,
    byProject,
    byCategory,
    byUser,
    teamWide,
  };
}
