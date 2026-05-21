import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db';
import { listProjects } from '../repositories/projects';
import { listCategoriesForProject } from '../repositories/categories';
import {
  listUnclassifiedForUser,
  markObservationsClassified,
  type ObservationRow,
} from '../repositories/observations';
import { ensureDefaultCategory } from '../repositories/defaults';
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

// 7B models truncate their JSON output array beyond ~10–15 entries even when
// the prompt explicitly asks for N results. Chunking keeps every observation
// in a batch the model can actually answer in full.
const LLM_CHUNK_SIZE = 10;


// Within-batch / cross-batch grouping only merges adjacent observations.
// The later consolidation pass handles non-adjacent same-day grouping.
const MAX_GROUP_GAP_MS = 10 * 60_000;

// New entries shorter than this round down to 0 minutes in the UI, which is
// just noise. We skip creating them — the underlying observations stay
// unclassified and may roll up into a longer block on a later run. Extending
// an *existing* entry by a few seconds is fine; the entry was already worth
// keeping, and the small addition only makes it more accurate.
const MIN_NEW_ENTRY_SECONDS = 30;

// Confidence we stamp on a rule-based match. Higher than the LLM ceiling
// because these come from URL/app evidence the model can't override.
const RULE_MATCH_CONFIDENCE = 0.95;

// Map well-known browser hosts to the tokens we'll try to match against
// category names. Lets `mail.google.com` resolve to a "Gmail" category even
// though neither "mail" nor "google" alone is a perfect match.
const HOST_ALIASES: Record<string, string[]> = {
  'mail.google.com': ['gmail'],
  'inbox.google.com': ['gmail'],
  'chatgpt.com': ['chatgpt', 'gpt'],
  'chat.openai.com': ['chatgpt', 'gpt'],
  'gemini.google.com': ['gemini'],
  'web.whatsapp.com': ['whatsapp'],
  'docs.google.com': ['gdocs', 'docs'],
  'drive.google.com': ['gdrive', 'drive'],
  'meet.google.com': ['meet'],
  'calendar.google.com': ['calendar'],
  'github.com': ['github'],
  'gitlab.com': ['gitlab'],
  'linkedin.com': ['linkedin'],
  'youtube.com': ['youtube'],
  'm.youtube.com': ['youtube'],
  'facebook.com': ['facebook'],
  'instagram.com': ['instagram'],
  'twitter.com': ['twitter', 'x'],
  'x.com': ['twitter', 'x'],
  'reddit.com': ['reddit'],
  'stackoverflow.com': ['stackoverflow', 'stack overflow'],
};

// Map app names (lowercased, exact) to category tokens. Native apps don't
// carry URLs, so this is our only deterministic signal for them.
const APP_ALIASES: Record<string, string[]> = {
  slack: ['slack'],
  'zoom.us': ['zoom'],
  zoom: ['zoom'],
  'microsoft teams': ['teams', 'microsoft teams'],
  'microsoft outlook': ['outlook', 'email'],
  outlook: ['outlook', 'email'],
  'visual studio code': ['vscode', 'code'],
  'whatsapp': ['whatsapp'],
};

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Generates candidate tokens that, if found in a category name (or vice
// versa), constitute a confident match. Combines aliases above with the
// second-level domain and the leading subdomain.
function candidateTokens(obs: ObservationRow): string[] {
  const tokens = new Set<string>();
  const host = hostFromUrl(obs.url);
  if (host) {
    if (HOST_ALIASES[host]) HOST_ALIASES[host].forEach((t) => tokens.add(t));
    const parts = host.split('.');
    if (parts.length >= 2) tokens.add(parts[parts.length - 2]); // e.g. "google"
    if (parts.length >= 3 && !['www', 'm', 'mobile', 'app'].includes(parts[0])) {
      tokens.add(parts[0]); // e.g. "mail" from mail.google.com
    }
  }
  if (obs.app) {
    const key = obs.app.toLowerCase();
    if (APP_ALIASES[key]) APP_ALIASES[key].forEach((t) => tokens.add(t));
    tokens.add(key);
  }
  return Array.from(tokens).filter((t) => t.length >= 3);
}

// Returns a confident (project, category) pick from URL/app evidence alone,
// or null if no unique match exists. Multiple matches across different
// categories → null (let the LLM decide).
function ruleBasedMatch(
  obs: ObservationRow,
  options: ClassifyOption[],
): { projectId: string; categoryId: string; reasoning: string } | null {
  const tokens = candidateTokens(obs);
  if (tokens.length === 0) return null;

  const hits: { projectId: string; categoryId: string; categoryName: string; token: string }[] = [];
  for (const p of options) {
    for (const c of p.categories) {
      const name = c.name.toLowerCase().trim();
      if (name.length < 3) continue; // ignore placeholder categories like "1", "ab"
      for (const tok of tokens) {
        if (name === tok || name.includes(tok) || tok.includes(name)) {
          hits.push({
            projectId: p.projectId,
            categoryId: c.id,
            categoryName: c.name,
            token: tok,
          });
          break;
        }
      }
    }
  }
  if (hits.length === 0) return null;

  // Require all hits to resolve to the *same* (project, category). If a token
  // matches multiple categories across different projects (e.g. "Whatsapp" in
  // two projects), defer to the LLM — only it can use surrounding context.
  const unique = new Set(hits.map((h) => `${h.projectId}|${h.categoryId}`));
  if (unique.size !== 1) return null;

  const h = hits[0];
  return {
    projectId: h.projectId,
    categoryId: h.categoryId,
    reasoning: `rule: "${h.token}" → "${h.categoryName}"`,
  };
}

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

  // The default (project, category) is the fallback target for anything the
  // rules + LLM can't confidently place. Creating it here also guarantees
  // we have somewhere to put observations even when the user hasn't set up
  // any other projects yet.
  const defaultTarget = ensureDefaultCategory(opts.userId);

  const projects = listProjects();

  const options: ClassifyOption[] = projects.map((p) => ({
    projectId: p.id,
    projectName: p.name,
    categories: listCategoriesForProject({ projectId: p.id }).map((c) => ({
      id: c.id,
      name: c.name,
    })),
  }));

  // Phase 1 — rule-based pre-pass. URL/app evidence is deterministic and
  // free; the LLM only sees what the rules can't confidently match.
  const byIndex = new Map<number, ClassifyResult>();
  const llmTargets: { absIndex: number; row: ObservationRow }[] = [];
  observations.forEach((row, i) => {
    const rule = ruleBasedMatch(row, options);
    if (rule) {
      byIndex.set(i, {
        index: i,
        projectId: rule.projectId,
        categoryId: rule.categoryId,
        confidence: RULE_MATCH_CONFIDENCE,
        reasoning: rule.reasoning,
      });
    } else {
      llmTargets.push({ absIndex: i, row });
    }
  });
  if (byIndex.size > 0) {
    console.log(`[classifier] rule pre-pass matched ${byIndex.size}/${observations.length}`);
  }

  // Phase 2 — chunked LLM call for everything left. Each chunk uses its own
  // 0-based index space; we re-key to the absolute observation index after.
  //
  // Chunk failures are isolated: one flaky LLM response (bad JSON, timeout,
  // host hiccup) used to throw out of this whole function, which rolled back
  // the entire transaction — including rule-matched rows and successful
  // earlier chunks. The observations would then sit pending forever because
  // every retry kept hitting the same bad chunk. Now we log the failure and
  // press on; the backfill below sends the chunk's rows to the default
  // category so they don't get stuck.
  for (let start = 0; start < llmTargets.length; start += LLM_CHUNK_SIZE) {
    const slice = llmTargets.slice(start, start + LLM_CHUNK_SIZE);
    const llmObservations: ClassifyObservation[] = slice.map((t, i) => ({
      index: i,
      app: t.row.app,
      windowTitle: t.row.windowTitle,
      url: t.row.url,
      durationSeconds: observationDurationSeconds(t.row),
    }));
    let chunkResults: ClassifyResult[];
    try {
      chunkResults = await opts.llm.classify({ observations: llmObservations, options });
    } catch (e) {
      console.error(
        `[classifier] LLM chunk ${start}-${start + slice.length} failed; routing to default:`,
        e instanceof Error ? e.message : e,
      );
      stats.errors += slice.length;
      continue;
    }
    for (const r of chunkResults) {
      if (r.index >= 0 && r.index < slice.length) {
        const abs = slice[r.index].absIndex;
        byIndex.set(abs, { ...r, index: abs });
      }
    }
  }

  // Backfill: any observation the rules + LLM didn't confidently place gets
  // sent to the default (Uncategorized) category. This guarantees the
  // pending queue drops to zero after a successful run and the user can
  // rename / re-categorize from the timesheet later.
  observations.forEach((row, i) => {
    const r = byIndex.get(i);
    const skipReason = explainSkip(r);
    if (skipReason) {
      logSkip(row, skipReason, r);
      byIndex.set(i, {
        index: i,
        projectId: defaultTarget.projectId,
        categoryId: defaultTarget.categoryId,
        confidence: 0,
        reasoning: `default (${skipReason})`,
      });
      stats.skipped += 1;
    }
  });

  // Within-batch grouping: fold consecutive same-(project, category)
  // observations into one block. duration is the sum of observation
  // durations — invariant: <= (block.endedAt - block.startedAt).
  const blocks: ObservationGroup[] = [];
  let current: ObservationGroup | null = null;
  observations.forEach((row, i) => {
    const r = byIndex.get(i);
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

      // No existing entry to extend → would have to create one. Skip if it
      // would round to 0 minutes — UNLESS this is the default (Uncategorized)
      // group, in which case we always create the entry so the pending count
      // can hit zero. Same-day default entries are merged together by the
      // consolidation pass at the end of this function.
      const isDefaultGroup =
        g.projectId === defaultTarget.projectId && g.categoryId === defaultTarget.categoryId;
      if (g.durationSeconds < MIN_NEW_ENTRY_SECONDS && !isDefaultGroup) {
        stats.skipped += g.observations.length;
        return;
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
