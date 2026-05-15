import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';

let db: Database.Database | null = null;

const DEFAULT_ADMIN_NAME = 'Admin';
const DEFAULT_ADMIN_EMAIL = 'admin@autosheets.local';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Email is the login identifier. UNIQUE allows multiple NULLs in SQLite,
-- which lets older rows that pre-date the constraint coexist; new rows are
-- validated by the repository to ensure email is set and unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_categories_project ON categories(project_id);

CREATE TABLE IF NOT EXISTS project_members (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  started_at        TEXT NOT NULL,
  ended_at          TEXT,
  app               TEXT,
  window_title      TEXT,
  url               TEXT,
  metadata          TEXT,
  classified_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_observations_started ON observations(started_at);
-- Indexes that reference user_id / classified_entry_id are created in migrate()
-- after the ALTER TABLE, so older databases (which predate those columns)
-- don't fail the SCHEMA pass.

CREATE TABLE IF NOT EXISTS time_entries (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id       TEXT NOT NULL REFERENCES projects(id),
  category_id      TEXT NOT NULL REFERENCES categories(id),
  started_at       TEXT NOT NULL,
  ended_at         TEXT NOT NULL,
  -- Actual time spent within the entry. Decoupled from (ended_at - started_at)
  -- because the same-day-same-category consolidation can merge non-adjacent
  -- sessions: started_at/ended_at then bracket the entire day but the real
  -- working time is the sum of individual session durations.
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  source           TEXT NOT NULL CHECK (source IN ('agent', 'manual')),
  confidence       REAL,
  confirmed        INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_started ON time_entries(started_at);
CREATE INDEX IF NOT EXISTS idx_entries_project ON time_entries(project_id);
`;

function migrate(d: Database.Database): void {
  // Add user_id to time_entries on databases created before that column existed.
  const teCols = d.prepare(`PRAGMA table_info(time_entries)`).all() as { name: string }[];
  if (!teCols.some((c) => c.name === 'user_id')) {
    d.exec(
      `ALTER TABLE time_entries ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL`,
    );
  }
  if (!teCols.some((c) => c.name === 'duration_seconds')) {
    d.exec(`ALTER TABLE time_entries ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0`);
    // Backfill: existing rows had no fragmented sessions, so duration is just
    // the wall-clock span.
    d.exec(
      `UPDATE time_entries
          SET duration_seconds = CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)
        WHERE duration_seconds = 0`,
    );
  }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_entries_user ON time_entries(user_id)`);

  // Add agent-related columns to observations on existing databases.
  const obsCols = d.prepare(`PRAGMA table_info(observations)`).all() as { name: string }[];
  if (!obsCols.some((c) => c.name === 'user_id')) {
    d.exec(
      `ALTER TABLE observations ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL`,
    );
  }
  if (!obsCols.some((c) => c.name === 'classified_entry_id')) {
    d.exec(
      `ALTER TABLE observations ADD COLUMN classified_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL`,
    );
  }
  // Reason the classifier deliberately skipped this row (no-fit, low
  // confidence, etc.). Lets us exclude it from the "pending" count and from
  // future classify batches without ever pointing classified_entry_id at a
  // fake entry row.
  if (!obsCols.some((c) => c.name === 'skip_reason')) {
    d.exec(`ALTER TABLE observations ADD COLUMN skip_reason TEXT`);
  }
  // Per-user theme preference. Added late, default 'system' so existing rows
  // pick up the OS setting on first paint.
  const userCols = d.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'theme_preference')) {
    d.exec(`ALTER TABLE users ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system'`);
  }

  d.exec(`CREATE INDEX IF NOT EXISTS idx_observations_user ON observations(user_id)`);
  d.exec(
    `CREATE INDEX IF NOT EXISTS idx_observations_unclassified
       ON observations(user_id, classified_entry_id) WHERE classified_entry_id IS NULL`,
  );

  // Backfill the default admin's email so they can log in. Older databases
  // seeded the admin without one.
  d.prepare(
    `UPDATE users SET email = ? WHERE name = ? AND is_admin = 1 AND (email IS NULL OR email = '')`,
  ).run(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME);
}

function seed(d: Database.Database): void {
  const userCount = (d.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
  if (userCount === 0) {
    const id = randomUUID();
    d.prepare(`INSERT INTO users (id, name, email, is_admin) VALUES (?, ?, ?, 1)`).run(
      id,
      DEFAULT_ADMIN_NAME,
      DEFAULT_ADMIN_EMAIL,
    );
  }
  // No auto-login: the app boots to the login screen until someone signs in.
  // app_settings.current_user_id is set by the auth:login handler.
}

export function initDatabase(): Database.Database {
  if (db) return db;
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'autosheets.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  seed(db);
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDatabase() first.');
  return db;
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}
