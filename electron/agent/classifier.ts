import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db';
import { listProjects } from '../repositories/projects';
import { listCategoriesForProject } from '../repositories/categories';
import {
  listUnclassifiedForUser,
  markObservationsClassified,
  type ObservationRow,
} from '../repositories/observations';
import type { LLMClient } from '../llm/types';
import type { ClassifyOption, ClassifyObservation, ClassifyResult } from '../llm/types';

export type ClassificationStats = {
  observations: number;
  classified: number;
  skipped: number;
  errors: number;
};

// 7B models tend to underestimate confidence; keep the floor low.
const MIN_CONFIDENCE = 0.4;

// Within-batch / cross-batch grouping only merges adjacent observations.
// The later consolidation pass handles non-adjacent same-day grouping.
const MAX_GROUP_GAP_MS = 10 * 60_000;

export async function runClassification(opts: {
  userId: string;
  llm: LLMClient;
  maxObservations?: number;
}): Promise<ClassificationStats> {
  const stats: ClassificationStats = { observations: 0, classified: 0, skipped: 0, errors: 0 };

  const observations = listUnclassifiedForUser(opts.userId, opts.maxObservations ?? 50);
  stats.observations = observations.length;
  if (observations.length === 0) {
    // Still run consolidation — earlier auto-runs may have left fragments
    // that a follow-up "Classify now" should clean up.
    const merged = consolidateByDay(opts.userId);
    if (merged > 0) {
      console.log(`[classifier] consolidation merged away ${merged} entries`);
    }
    return stats;
  }

  const projects = listProjects();
  if (projects.length === 0) {
    stats.skipped = observations.length;
    return stats;
  }

  const options: ClassifyOption[] = projects.map((p) => ({
    projectId: p.id,
    projectName: p.name,
    categories: listCategoriesForProject({ projectId: p.id }).map((c) => ({
      id: c.id,
      name: c.name,
    })),
  }));

  const llmObservations: ClassifyObservation[] = observations.map((o, i) => ({
    index: i,
    app: o.app,
    windowTitle: o.windowTitle,
    url: o.url,
    durationSeconds: observationDurationSeconds(o),
  }));

  let results;
  try {
    results = await opts.llm.classify({ observations: llmObservations, options });
  } catch (e) {
    stats.errors = observations.length;
    throw e;
  }

  const byIndex = new Map(results.map((r) => [r.index, r]));

  // Within-batch grouping: fold consecutive same-(project, category)
  // observations into one block. duration is the sum of observation
  // durations — invariant: <= (block.endedAt - block.startedAt).
  const blocks: ObservationGroup[] = [];
  let current: ObservationGroup | null = null;
  observations.forEach((row, i) => {
    const r = byIndex.get(i);
    const skipReason = explainSkip(r);
    if (skipReason) {
      logSkip(row, skipReason, r);
      stats.skipped += 1;
      current = null;
      return;
    }
    const ok = r as ClassifyResult & { projectId: string; categoryId: string };
    if (current && canExtend(current, ok, row)) {
      current.observations.push(row);
      current.confidenceSum += ok.confidence;
      if (ok.reasoning) current.reasonings.push(ok.reasoning);
      current.endedAt = row.endedAt;
      current.durationSeconds += observationDurationSeconds(row);
    } else {
      current = {
        projectId: ok.projectId,
        categoryId: ok.categoryId,
        observations: [row],
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        durationSeconds: observationDurationSeconds(row),
        confidenceSum: ok.confidence,
        reasonings: ok.reasoning ? [ok.reasoning] : [],
      };
      blocks.push(current);
    }
  });

  const db = getDatabase();
  const insertEntry = db.prepare(
    `INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confidence, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'agent', ?, 0, ?)`,
  );
  // Cross-batch extend: pick the most recent unconfirmed agent entry for the
  // same (project, category) and stretch it if the gap fits. Saves a row
  // when adjacent observations land in different classify runs.
  const findRecentEntry = db.prepare(
    `SELECT id, ended_at AS endedAt, confidence, duration_seconds AS durationSeconds
       FROM time_entries
      WHERE user_id = ?
        AND project_id = ?
        AND category_id = ?
        AND source = 'agent'
        AND confirmed = 0
      ORDER BY ended_at DESC
      LIMIT 1`,
  );
  const extendEntry = db.prepare(
    `UPDATE time_entries
        SET ended_at = ?,
            duration_seconds = duration_seconds + ?,
            confidence = ?
      WHERE id = ?`,
  );

  const tx = db.transaction((groups: ObservationGroup[]) => {
    groups.forEach((g) => {
      const blockAvg = g.confidenceSum / g.observations.length;
      const existing = findRecentEntry.get(opts.userId, g.projectId, g.categoryId) as
        | { id: string; endedAt: string; confidence: number | null; durationSeconds: number }
        | undefined;

      if (existing) {
        const gap = new Date(g.startedAt).getTime() - new Date(existing.endedAt).getTime();
        if (gap >= -1000 && gap <= MAX_GROUP_GAP_MS) {
          const merged = Math.min(existing.confidence ?? blockAvg, blockAvg);
          extendEntry.run(g.endedAt, g.durationSeconds, merged, existing.id);
          markObservationsClassified(
            g.observations.map((o) => o.id),
            existing.id,
          );
          stats.classified += g.observations.length;
          return;
        }
      }

      const entryId = randomUUID();
      insertEntry.run(
        entryId,
        opts.userId,
        g.projectId,
        g.categoryId,
        g.startedAt,
        g.endedAt,
        g.durationSeconds,
        blockAvg,
        dedupeJoin(g.reasonings),
      );
      markObservationsClassified(
        g.observations.map((o) => o.id),
        entryId,
      );
      stats.classified += g.observations.length;
    });
  });

  tx(blocks);

  // Final pass: collapse every (local-day, project, category) bucket of
  // unconfirmed agent entries into ONE entry. Honest duration (sum of
  // actual time), and started_at / ended_at span the whole bucket so the
  // UI can show "first session — last session".
  const merged = consolidateByDay(opts.userId);
  if (merged > 0) {
    console.log(`[classifier] consolidation merged away ${merged} entries`);
  }

  return stats;
}

type ObservationGroup = {
  projectId: string;
  categoryId: string;
  observations: ObservationRow[];
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  confidenceSum: number;
  reasonings: string[];
};

function observationDurationSeconds(o: ObservationRow): number {
  return Math.max(
    1,
    Math.round((new Date(o.endedAt).getTime() - new Date(o.startedAt).getTime()) / 1000),
  );
}

function explainSkip(r: ClassifyResult | undefined): string | null {
  if (!r) return 'no result for index';
  if (!r.projectId || !r.categoryId) return 'no fit';
  if (r.confidence < MIN_CONFIDENCE) {
    return `low confidence ${r.confidence.toFixed(2)} < ${MIN_CONFIDENCE}`;
  }
  return null;
}

function canExtend(
  current: ObservationGroup,
  next: ClassifyResult & { projectId: string; categoryId: string },
  row: ObservationRow,
): boolean {
  if (current.projectId !== next.projectId || current.categoryId !== next.categoryId) {
    return false;
  }
  const gap = new Date(row.startedAt).getTime() - new Date(current.endedAt).getTime();
  return gap >= 0 && gap <= MAX_GROUP_GAP_MS;
}

function dedupeJoin(reasonings: string[]): string | null {
  if (reasonings.length === 0) return null;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const r of reasonings) {
    const trimmed = r.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique.length === 0 ? null : unique.join(' · ');
}

function logSkip(row: ObservationRow, reason: string, r: ClassifyResult | undefined): void {
  const reasoning = r?.reasoning ? `; reasoning=${r.reasoning}` : '';
  console.log(
    `[classifier] skip obs ${row.id} (${row.app} | ${row.windowTitle}): ${reason}${reasoning}`,
  );
}

// Returns the calendar date of an ISO timestamp in the user's local timezone
// as YYYY-MM-DD. Local because "same day" is a user-facing concept.
function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Merges all unconfirmed agent entries for a user into ONE entry per
// (local-day, project, category). Confirmed entries are untouched — once
// the user has signed off on something we don't silently rewrite it.
//
// The surviving entry:
//   - id      = earliest entry's id (lets any UI that knew about that id stay valid)
//   - started_at = min(started_at)
//   - ended_at   = max(ended_at)
//   - duration_seconds = sum(duration_seconds)  ← honest working time
//   - confidence = min(confidence)  ← least-sure component wins
//   - note       = first entry's note (UI stability)
//
// All observations of the merged entries get reassigned to the surviving id.
function consolidateByDay(userId: string): number {
  const db = getDatabase();

  type Row = {
    id: string;
    project_id: string;
    category_id: string;
    started_at: string;
    ended_at: string;
    duration_seconds: number;
    confidence: number | null;
  };

  const select = db.prepare(
    `SELECT id, project_id, category_id, started_at, ended_at, duration_seconds, confidence
       FROM time_entries
      WHERE user_id = ? AND source = 'agent' AND confirmed = 0
      ORDER BY started_at ASC`,
  );
  const updateEntry = db.prepare(
    `UPDATE time_entries
        SET started_at = ?, ended_at = ?, duration_seconds = ?, confidence = ?
      WHERE id = ?`,
  );
  const reassignObs = db.prepare(
    `UPDATE observations SET classified_entry_id = ? WHERE classified_entry_id = ?`,
  );
  const deleteEntry = db.prepare(`DELETE FROM time_entries WHERE id = ?`);

  let mergedAway = 0;

  const tx = db.transaction(() => {
    const rows = select.all(userId) as Row[];

    // Group by (local-day, project, category). First row in each bucket wins.
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const key = `${localDate(row.started_at)}|${row.project_id}|${row.category_id}`;
      const list = buckets.get(key);
      if (list) list.push(row);
      else buckets.set(key, [row]);
    }

    for (const list of buckets.values()) {
      if (list.length <= 1) continue;
      list.sort((a, b) => a.started_at.localeCompare(b.started_at));
      const target = list[0];

      let earliest = target.started_at;
      let latest = target.ended_at;
      let totalDuration = target.duration_seconds;
      let minConf: number | null = target.confidence;

      for (let i = 1; i < list.length; i += 1) {
        const r = list[i];
        if (r.started_at < earliest) earliest = r.started_at;
        if (r.ended_at > latest) latest = r.ended_at;
        totalDuration += r.duration_seconds;
        if (r.confidence !== null) {
          minConf = minConf === null ? r.confidence : Math.min(minConf, r.confidence);
        }
      }

      updateEntry.run(earliest, latest, totalDuration, minConf, target.id);
      for (let i = 1; i < list.length; i += 1) {
        const other = list[i];
        reassignObs.run(target.id, other.id);
        deleteEntry.run(other.id);
        mergedAway += 1;
      }
    }
  });

  tx();
  return mergedAway;
}
