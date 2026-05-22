//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let electron = require("electron");
let node_path = require("node:path");
node_path = __toESM(node_path, 1);
let node_child_process = require("node:child_process");
let node_util = require("node:util");
let better_sqlite3 = require("better-sqlite3");
better_sqlite3 = __toESM(better_sqlite3, 1);
let node_fs = require("node:fs");
node_fs = __toESM(node_fs, 1);
let node_crypto = require("node:crypto");
//#region electron/db.ts
var db = null;
var DEFAULT_ADMIN_NAME = "Admin";
var DEFAULT_ADMIN_EMAIL = "admin@autosheets.local";
var SCHEMA = `
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
function migrate(d) {
	const teCols = d.prepare(`PRAGMA table_info(time_entries)`).all();
	if (!teCols.some((c) => c.name === "user_id")) d.exec(`ALTER TABLE time_entries ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL`);
	if (!teCols.some((c) => c.name === "duration_seconds")) {
		d.exec(`ALTER TABLE time_entries ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0`);
		d.exec(`UPDATE time_entries
          SET duration_seconds = CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)
        WHERE duration_seconds = 0`);
	}
	d.exec(`CREATE INDEX IF NOT EXISTS idx_entries_user ON time_entries(user_id)`);
	const obsCols = d.prepare(`PRAGMA table_info(observations)`).all();
	if (!obsCols.some((c) => c.name === "user_id")) d.exec(`ALTER TABLE observations ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL`);
	if (!obsCols.some((c) => c.name === "classified_entry_id")) d.exec(`ALTER TABLE observations ADD COLUMN classified_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL`);
	if (!obsCols.some((c) => c.name === "skip_reason")) d.exec(`ALTER TABLE observations ADD COLUMN skip_reason TEXT`);
	if (!d.prepare(`PRAGMA table_info(projects)`).all().some((c) => c.name === "is_default")) d.exec(`ALTER TABLE projects ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`);
	if (!d.prepare(`PRAGMA table_info(categories)`).all().some((c) => c.name === "is_default")) d.exec(`ALTER TABLE categories ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`);
	if (!d.prepare(`PRAGMA table_info(users)`).all().some((c) => c.name === "theme_preference")) d.exec(`ALTER TABLE users ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system'`);
	d.exec(`CREATE INDEX IF NOT EXISTS idx_observations_user ON observations(user_id)`);
	d.exec(`CREATE INDEX IF NOT EXISTS idx_observations_unclassified
       ON observations(user_id, classified_entry_id) WHERE classified_entry_id IS NULL`);
	d.prepare(`UPDATE users SET email = ? WHERE name = ? AND is_admin = 1 AND (email IS NULL OR email = '')`).run(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME);
}
function seed(d) {
	if (d.prepare(`SELECT COUNT(*) AS n FROM users`).get().n === 0) {
		const id = (0, node_crypto.randomUUID)();
		d.prepare(`INSERT INTO users (id, name, email, is_admin) VALUES (?, ?, ?, 1)`).run(id, DEFAULT_ADMIN_NAME, DEFAULT_ADMIN_EMAIL);
	}
}
function initDatabase() {
	if (db) return db;
	const dataDir = electron.app.getPath("userData");
	node_fs.default.mkdirSync(dataDir, { recursive: true });
	db = new better_sqlite3.default(node_path.default.join(dataDir, "autosheets.db"));
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	db.exec(SCHEMA);
	migrate(db);
	seed(db);
	return db;
}
function getDatabase() {
	if (!db) throw new Error("Database not initialized — call initDatabase() first.");
	return db;
}
function closeDatabase() {
	db?.close();
	db = null;
}
//#endregion
//#region electron/agent/idle.ts
var IDLE_APP_NAMES = [
	"loginwindow",
	"screensaverengine",
	"screensaverview",
	"lockoutagent"
];
var IDLE_SET = new Set(IDLE_APP_NAMES);
function isIdleApp(appName) {
	if (!appName) return true;
	return IDLE_SET.has(appName.trim().toLowerCase());
}
//#endregion
//#region electron/repositories/observations.ts
function toObservation(r) {
	return {
		id: r.id,
		userId: r.user_id,
		startedAt: r.started_at,
		endedAt: r.ended_at,
		app: r.app,
		windowTitle: r.window_title,
		url: r.url
	};
}
function insertObservation(input) {
	const info = getDatabase().prepare(`INSERT INTO observations (user_id, started_at, ended_at, app, window_title, url)
       VALUES (?, ?, ?, ?, ?, ?)`).run(input.userId, input.startedAt, input.endedAt, input.app, input.windowTitle, input.url);
	return Number(info.lastInsertRowid);
}
var IDLE_PLACEHOLDERS = IDLE_APP_NAMES.map(() => "?").join(",");
function listUnclassifiedForUser(userId, limit = 200) {
	return getDatabase().prepare(`SELECT id, user_id, started_at, ended_at, app, window_title, url
         FROM observations
        WHERE user_id = ?
          AND classified_entry_id IS NULL
          AND (skip_reason IS NULL OR skip_reason = '')
          AND LOWER(COALESCE(app, '')) NOT IN (${IDLE_PLACEHOLDERS})
        ORDER BY started_at
        LIMIT ?`).all(userId, ...IDLE_APP_NAMES, limit).map(toObservation);
}
function markObservationsClassified(ids, entryId) {
	if (ids.length === 0) return;
	const placeholders = ids.map(() => "?").join(",");
	getDatabase().prepare(`UPDATE observations SET classified_entry_id = ? WHERE id IN (${placeholders})`).run(entryId, ...ids);
}
//#endregion
//#region electron/agent/idleDetector.ts
var execFileP$1 = (0, node_util.promisify)(node_child_process.execFile);
var IOREG_ARGS = [
	"-c",
	"IOHIDSystem",
	"-r",
	"-d",
	"1"
];
var HID_IDLE_PATTERN = /"HIDIdleTime"\s*=\s*(\d+)/;
async function getIdleSeconds() {
	if (process.platform !== "darwin") return null;
	try {
		const { stdout } = await execFileP$1("ioreg", IOREG_ARGS, { timeout: 2e3 });
		const m = HID_IDLE_PATTERN.exec(stdout);
		if (!m) return null;
		const ns = Number(m[1]);
		if (!Number.isFinite(ns) || ns < 0) return null;
		return ns / 1e9;
	} catch {
		return null;
	}
}
//#endregion
//#region electron/agent/observer.ts
var execFileP = (0, node_util.promisify)(node_child_process.execFile);
function resolveActiveWinBinary() {
	return node_path.default.join(electron.app.getAppPath(), "node_modules", "active-win", "main");
}
async function querySwiftBinary(binary) {
	try {
		const { stdout } = await execFileP(binary, [], {
			timeout: 4e3,
			env: process.env
		});
		const trimmed = stdout.trim();
		if (!trimmed) return {
			app: null,
			title: null,
			url: null
		};
		const parsed = JSON.parse(trimmed);
		return {
			app: parsed.owner?.name ?? null,
			title: parsed.title ?? null,
			url: parsed.url ?? null
		};
	} catch (e) {
		const err = e;
		const stderr = (err.stderr ?? "").trim();
		if (stderr) throw new Error(stderr);
		throw new Error(err.message ?? String(e));
	}
}
var Observer = class {
	userId;
	intervalMs;
	minDurationSeconds;
	idleThresholdSeconds;
	onError;
	maxSampleGapMs;
	timer = null;
	active = null;
	lastObservationAt = null;
	lastSampleAt = null;
	lastError = null;
	binaryPath = null;
	constructor(cfg) {
		this.userId = cfg.userId;
		this.intervalMs = cfg.intervalMs ?? 2e4;
		this.minDurationSeconds = cfg.minDurationSeconds ?? 5;
		this.idleThresholdSeconds = cfg.idleThresholdSeconds ?? 120;
		this.maxSampleGapMs = this.intervalMs * 3;
		this.onError = cfg.onError ?? (() => {});
	}
	isRunning() {
		return this.timer !== null;
	}
	getLastObservationAt() {
		return this.lastObservationAt;
	}
	getLastError() {
		return this.lastError;
	}
	start() {
		if (this.timer) return;
		this.tick();
		this.timer = setInterval(() => void this.tick(), this.intervalMs);
	}
	async stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.flushActive(this.active?.lastSeenAt ?? /* @__PURE__ */ new Date());
	}
	flushPending() {
		this.flushActive(this.active?.lastSeenAt ?? /* @__PURE__ */ new Date());
	}
	async tick() {
		try {
			const [sample, rawIdleSeconds] = await Promise.all([this.sample(), getIdleSeconds()]);
			const now = sample.at;
			const userIdle = (rawIdleSeconds ?? 0) > this.idleThresholdSeconds;
			if (this.lastSampleAt && now.getTime() - this.lastSampleAt.getTime() > this.maxSampleGapMs && this.active) this.flushActive(this.active.lastSeenAt);
			this.lastSampleAt = now;
			if (sample.idle || userIdle) {
				if (this.active) {
					const lastInteractionMs = now.getTime() - (rawIdleSeconds !== null ? rawIdleSeconds * 1e3 : 0);
					const startMs = this.active.startedAt.getTime();
					const endMs = Math.max(startMs, Math.min(lastInteractionMs, now.getTime()));
					this.flushActive(new Date(endMs));
				}
			} else if (!sameWindow(this.active, sample)) {
				this.flushActive(now);
				this.active = {
					app: sample.app,
					windowTitle: sample.windowTitle,
					url: sample.url,
					startedAt: now,
					lastSeenAt: now
				};
			} else if (this.active) this.active.lastSeenAt = now;
			this.lastObservationAt = now;
			this.lastError = null;
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : String(e);
			this.onError(e);
		}
	}
	async sample() {
		if (!this.binaryPath) this.binaryPath = resolveActiveWinBinary();
		const win = await querySwiftBinary(this.binaryPath);
		return {
			app: win.app,
			windowTitle: win.title,
			url: win.url,
			at: /* @__PURE__ */ new Date(),
			idle: isIdleApp(win.app)
		};
	}
	flushActive(endAt) {
		const seg = this.active;
		if (!seg) return;
		const end = endAt.getTime() < seg.startedAt.getTime() ? seg.lastSeenAt : endAt;
		if ((end.getTime() - seg.startedAt.getTime()) / 1e3 >= this.minDurationSeconds) try {
			insertObservation({
				userId: this.userId,
				startedAt: seg.startedAt.toISOString(),
				endedAt: end.toISOString(),
				app: seg.app,
				windowTitle: seg.windowTitle,
				url: seg.url
			});
		} catch (e) {
			this.onError(e);
		}
		this.active = null;
	}
};
function sameWindow(active, sample) {
	if (!active) return false;
	return active.app === sample.app && active.windowTitle === sample.windowTitle;
}
//#endregion
//#region electron/repositories/users.ts
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var VALID_THEMES$1 = [
	"light",
	"dark",
	"system"
];
function normalizeTheme(v) {
	return VALID_THEMES$1.includes(v ?? "") ? v : "system";
}
function rowToUser(r) {
	return {
		id: r.id,
		name: r.name,
		email: r.email,
		isAdmin: r.is_admin === 1,
		createdAt: r.created_at,
		themePreference: normalizeTheme(r.theme_preference)
	};
}
var SELECT_COLS = `id, name, email, is_admin, created_at, theme_preference`;
function listUsers() {
	return getDatabase().prepare(`SELECT ${SELECT_COLS} FROM users ORDER BY is_admin DESC, name`).all().map(rowToUser);
}
function getUser(id) {
	const row = getDatabase().prepare(`SELECT ${SELECT_COLS} FROM users WHERE id = ?`).get(id);
	return row ? rowToUser(row) : null;
}
function getUserByEmail(email) {
	const normalized = email.trim().toLowerCase();
	if (!normalized) return null;
	const row = getDatabase().prepare(`SELECT ${SELECT_COLS} FROM users WHERE LOWER(email) = ? LIMIT 1`).get(normalized);
	return row ? rowToUser(row) : null;
}
function createUser({ name, email, isAdmin }) {
	const trimmedName = name.trim();
	if (!trimmedName) throw new Error("Name is required.");
	const normalizedEmail = email?.trim().toLowerCase();
	if (!normalizedEmail) throw new Error("Email is required.");
	if (!EMAIL_RE.test(normalizedEmail)) throw new Error("Email is not valid.");
	if (getUserByEmail(normalizedEmail)) throw new Error("A user with this email already exists.");
	const id = (0, node_crypto.randomUUID)();
	getDatabase().prepare(`INSERT INTO users (id, name, email, is_admin) VALUES (?, ?, ?, ?)`).run(id, trimmedName, normalizedEmail, isAdmin ? 1 : 0);
	return getUser(id);
}
function deleteUser({ id }) {
	const db = getDatabase();
	const lastAdmin = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE is_admin = 1`).get();
	const target = db.prepare(`SELECT is_admin FROM users WHERE id = ?`).get(id);
	if (!target) throw new Error("User not found.");
	if (target.is_admin === 1 && lastAdmin.n <= 1) throw new Error("Cannot delete the last admin user.");
	db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}
function setUserTheme(userId, theme) {
	if (!VALID_THEMES$1.includes(theme)) throw new Error("Invalid theme preference.");
	getDatabase().prepare(`UPDATE users SET theme_preference = ? WHERE id = ?`).run(theme, userId);
	const updated = getUser(userId);
	if (!updated) throw new Error("User not found.");
	return updated;
}
//#endregion
//#region electron/repositories/settings.ts
var KEY = "current_user_id";
function getCurrentUser() {
	const row = getDatabase().prepare(`SELECT value FROM app_settings WHERE key = ?`).get(KEY);
	if (!row?.value) return null;
	const user = getUser(row.value);
	if (!user) {
		clearCurrentUser();
		return null;
	}
	return user;
}
function requireCurrentUser() {
	const user = getCurrentUser();
	if (!user) throw new Error("Not signed in.");
	return user;
}
function loginByEmail(email) {
	const user = getUserByEmail(email);
	if (!user) throw new Error("No account found for that email.");
	getDatabase().prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(KEY, user.id);
	return user;
}
function clearCurrentUser() {
	getDatabase().prepare(`DELETE FROM app_settings WHERE key = ?`).run(KEY);
}
function signup({ name, email }) {
	const user = createUser({
		name,
		email,
		isAdmin: false
	});
	getDatabase().prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(KEY, user.id);
	return user;
}
var ORG_NAME_KEY = "org_name";
function getOrgName() {
	const row = getDatabase().prepare(`SELECT value FROM app_settings WHERE key = ?`).get(ORG_NAME_KEY);
	return row?.value && row.value.trim() ? row.value : null;
}
function setOrgName({ name }) {
	if (!requireCurrentUser().isAdmin) throw new Error("Only admins can rename the organisation.");
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Organisation name is required.");
	if (trimmed.length > 80) throw new Error("Organisation name is too long (max 80 characters).");
	getDatabase().prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(ORG_NAME_KEY, trimmed);
	return { name: trimmed };
}
//#endregion
//#region electron/repositories/projects.ts
var ROW_FIELDS = `
    p.id,
    p.name,
    p.created_at,
    (SELECT COUNT(*) FROM categories c WHERE c.project_id = p.id) AS category_count
`;
function rowToProject(row) {
	return {
		id: row.id,
		name: row.name,
		createdAt: row.created_at,
		categoryCount: row.category_count
	};
}
function listProjects() {
	const user = requireCurrentUser();
	const db = getDatabase();
	if (user.isAdmin) return db.prepare(`SELECT ${ROW_FIELDS} FROM projects p ORDER BY p.created_at DESC`).all().map(rowToProject);
	return db.prepare(`SELECT ${ROW_FIELDS}
         FROM projects p
         JOIN project_members m ON m.project_id = p.id
         WHERE m.user_id = ?
         ORDER BY p.created_at DESC`).all(user.id).map(rowToProject);
}
function createProject({ name }) {
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Project name is required.");
	const id = (0, node_crypto.randomUUID)();
	const db = getDatabase();
	db.prepare("INSERT INTO projects (id, name) VALUES (?, ?)").run(id, trimmed);
	const user = requireCurrentUser();
	db.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`).run(id, user.id);
	return rowToProject(db.prepare(`SELECT ${ROW_FIELDS} FROM projects p WHERE p.id = ?`).get(id));
}
function renameProject({ id, name }) {
	if (!requireCurrentUser().isAdmin) throw new Error("Only admins can manage projects.");
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Project name is required.");
	const db = getDatabase();
	if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(id)) throw new Error("Project not found.");
	db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(trimmed, id);
	return rowToProject(db.prepare(`SELECT ${ROW_FIELDS} FROM projects p WHERE p.id = ?`).get(id));
}
function deleteProject({ id }) {
	const db = getDatabase();
	if (db.prepare("SELECT is_default FROM projects WHERE id = ?").get(id)?.is_default === 1) throw new Error("Cannot delete the default project — rename it instead.");
	if (db.prepare("SELECT 1 FROM time_entries WHERE project_id = ? LIMIT 1").get(id)) throw new Error("Cannot delete a project that has time entries.");
	db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}
//#endregion
//#region electron/repositories/categories.ts
var SELECT$2 = `
  SELECT
    c.id,
    c.project_id,
    p.name AS project_name,
    c.name,
    c.created_at
  FROM categories c
  JOIN projects p ON p.id = c.project_id
`;
function rowToCategory(row) {
	return {
		id: row.id,
		projectId: row.project_id,
		projectName: row.project_name,
		name: row.name,
		createdAt: row.created_at
	};
}
function listCategories() {
	const user = requireCurrentUser();
	const db = getDatabase();
	if (user.isAdmin) return db.prepare(`${SELECT$2} ORDER BY p.name, c.created_at DESC`).all().map(rowToCategory);
	return db.prepare(`${SELECT$2}
       JOIN project_members m ON m.project_id = c.project_id
       WHERE m.user_id = ?
       ORDER BY p.name, c.created_at DESC`).all(user.id).map(rowToCategory);
}
function listCategoriesForProject({ projectId }) {
	return getDatabase().prepare(`${SELECT$2} WHERE c.project_id = ? ORDER BY c.created_at DESC`).all(projectId).map(rowToCategory);
}
function createCategory({ projectId, name }) {
	if (!requireCurrentUser().isAdmin) throw new Error("Only admins can manage categories.");
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Category name is required.");
	const db = getDatabase();
	if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) throw new Error("Project not found.");
	const id = (0, node_crypto.randomUUID)();
	db.prepare("INSERT INTO categories (id, project_id, name) VALUES (?, ?, ?)").run(id, projectId, trimmed);
	return rowToCategory(db.prepare(`${SELECT$2} WHERE c.id = ?`).get(id));
}
function renameCategory({ id, name }) {
	if (!requireCurrentUser().isAdmin) throw new Error("Only admins can manage categories.");
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Category name is required.");
	const db = getDatabase();
	if (!db.prepare("SELECT 1 FROM categories WHERE id = ?").get(id)) throw new Error("Category not found.");
	db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(trimmed, id);
	return rowToCategory(db.prepare(`${SELECT$2} WHERE c.id = ?`).get(id));
}
function deleteCategory({ id }) {
	if (!requireCurrentUser().isAdmin) throw new Error("Only admins can manage categories.");
	const db = getDatabase();
	if (db.prepare("SELECT is_default FROM categories WHERE id = ?").get(id)?.is_default === 1) throw new Error("Cannot delete the default category — rename it instead.");
	if (db.prepare("SELECT 1 FROM time_entries WHERE category_id = ? LIMIT 1").get(id)) throw new Error("Cannot delete a category that has time entries.");
	db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}
//#endregion
//#region electron/repositories/defaults.ts
var DEFAULT_PROJECT_NAME = "Uncategorized";
var DEFAULT_CATEGORY_NAME = "Uncategorized";
function ensureDefaultCategory(userId) {
	const db = getDatabase();
	let project = db.prepare(`SELECT id FROM projects WHERE is_default = 1 LIMIT 1`).get();
	if (!project) {
		const id = (0, node_crypto.randomUUID)();
		db.prepare(`INSERT INTO projects (id, name, is_default) VALUES (?, ?, 1)`).run(id, DEFAULT_PROJECT_NAME);
		project = { id };
	}
	let category = db.prepare(`SELECT id FROM categories WHERE project_id = ? AND is_default = 1 LIMIT 1`).get(project.id);
	if (!category) {
		const id = (0, node_crypto.randomUUID)();
		db.prepare(`INSERT INTO categories (id, project_id, name, is_default) VALUES (?, ?, ?, 1)`).run(id, project.id, DEFAULT_CATEGORY_NAME);
		category = { id };
	}
	db.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`).run(project.id, userId);
	return {
		projectId: project.id,
		categoryId: category.id
	};
}
//#endregion
//#region electron/agent/classifier.ts
var MIN_CONFIDENCE = .4;
var LLM_CHUNK_SIZE = 10;
var MAX_GROUP_GAP_MS = 10 * 6e4;
var MIN_NEW_ENTRY_SECONDS = 30;
var RULE_MATCH_CONFIDENCE = .95;
var HOST_ALIASES = {
	"mail.google.com": ["gmail"],
	"inbox.google.com": ["gmail"],
	"chatgpt.com": ["chatgpt", "gpt"],
	"chat.openai.com": ["chatgpt", "gpt"],
	"gemini.google.com": ["gemini"],
	"web.whatsapp.com": ["whatsapp"],
	"docs.google.com": ["gdocs", "docs"],
	"drive.google.com": ["gdrive", "drive"],
	"meet.google.com": ["meet"],
	"calendar.google.com": ["calendar"],
	"github.com": ["github"],
	"gitlab.com": ["gitlab"],
	"linkedin.com": ["linkedin"],
	"youtube.com": ["youtube"],
	"m.youtube.com": ["youtube"],
	"facebook.com": ["facebook"],
	"instagram.com": ["instagram"],
	"twitter.com": ["twitter", "x"],
	"x.com": ["twitter", "x"],
	"reddit.com": ["reddit"],
	"stackoverflow.com": ["stackoverflow", "stack overflow"]
};
var APP_ALIASES = {
	slack: ["slack"],
	"zoom.us": ["zoom"],
	zoom: ["zoom"],
	"microsoft teams": ["teams", "microsoft teams"],
	"microsoft outlook": ["outlook", "email"],
	outlook: ["outlook", "email"],
	"visual studio code": ["vscode", "code"],
	"whatsapp": ["whatsapp"]
};
function hostFromUrl(url) {
	if (!url) return null;
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return null;
	}
}
function candidateTokens(obs) {
	const tokens = /* @__PURE__ */ new Set();
	const host = hostFromUrl(obs.url);
	if (host) {
		if (HOST_ALIASES[host]) HOST_ALIASES[host].forEach((t) => tokens.add(t));
		const parts = host.split(".");
		if (parts.length >= 2) tokens.add(parts[parts.length - 2]);
		if (parts.length >= 3 && ![
			"www",
			"m",
			"mobile",
			"app"
		].includes(parts[0])) tokens.add(parts[0]);
	}
	if (obs.app) {
		const key = obs.app.toLowerCase();
		if (APP_ALIASES[key]) APP_ALIASES[key].forEach((t) => tokens.add(t));
		tokens.add(key);
	}
	return Array.from(tokens).filter((t) => t.length >= 3);
}
function ruleBasedMatch(obs, options) {
	const tokens = candidateTokens(obs);
	if (tokens.length === 0) return null;
	const hits = [];
	for (const p of options) for (const c of p.categories) {
		const name = c.name.toLowerCase().trim();
		if (name.length < 3) continue;
		for (const tok of tokens) if (name === tok || name.includes(tok) || tok.includes(name)) {
			hits.push({
				projectId: p.projectId,
				categoryId: c.id,
				categoryName: c.name,
				token: tok
			});
			break;
		}
	}
	if (hits.length === 0) return null;
	if (new Set(hits.map((h) => `${h.projectId}|${h.categoryId}`)).size !== 1) return null;
	const h = hits[0];
	return {
		projectId: h.projectId,
		categoryId: h.categoryId,
		reasoning: `rule: "${h.token}" → "${h.categoryName}"`
	};
}
async function runClassification(opts) {
	const stats = {
		observations: 0,
		classified: 0,
		skipped: 0,
		errors: 0
	};
	const observations = listUnclassifiedForUser(opts.userId, opts.maxObservations ?? 50);
	stats.observations = observations.length;
	if (observations.length === 0) {
		const merged = consolidateByDay(opts.userId);
		if (merged > 0) console.log(`[classifier] consolidation merged away ${merged} entries`);
		return stats;
	}
	const defaultTarget = ensureDefaultCategory(opts.userId);
	const options = listProjects().map((p) => ({
		projectId: p.id,
		projectName: p.name,
		categories: listCategoriesForProject({ projectId: p.id }).map((c) => ({
			id: c.id,
			name: c.name
		}))
	}));
	const byIndex = /* @__PURE__ */ new Map();
	const llmTargets = [];
	observations.forEach((row, i) => {
		const rule = ruleBasedMatch(row, options);
		if (rule) byIndex.set(i, {
			index: i,
			projectId: rule.projectId,
			categoryId: rule.categoryId,
			confidence: RULE_MATCH_CONFIDENCE,
			reasoning: rule.reasoning
		});
		else llmTargets.push({
			absIndex: i,
			row
		});
	});
	if (byIndex.size > 0) console.log(`[classifier] rule pre-pass matched ${byIndex.size}/${observations.length}`);
	for (let start = 0; start < llmTargets.length; start += LLM_CHUNK_SIZE) {
		const slice = llmTargets.slice(start, start + LLM_CHUNK_SIZE);
		const llmObservations = slice.map((t, i) => ({
			index: i,
			app: t.row.app,
			windowTitle: t.row.windowTitle,
			url: t.row.url,
			durationSeconds: observationDurationSeconds(t.row)
		}));
		let chunkResults;
		try {
			chunkResults = await opts.llm.classify({
				observations: llmObservations,
				options
			});
		} catch (e) {
			console.error(`[classifier] LLM chunk ${start}-${start + slice.length} failed; routing to default:`, e instanceof Error ? e.message : e);
			stats.errors += slice.length;
			continue;
		}
		for (const r of chunkResults) if (r.index >= 0 && r.index < slice.length) {
			const abs = slice[r.index].absIndex;
			byIndex.set(abs, {
				...r,
				index: abs
			});
		}
	}
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
				reasoning: `default (${skipReason})`
			});
			stats.skipped += 1;
		}
	});
	const blocks = [];
	let current = null;
	observations.forEach((row, i) => {
		const ok = byIndex.get(i);
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
				reasonings: ok.reasoning ? [ok.reasoning] : []
			};
			blocks.push(current);
		}
	});
	const db = getDatabase();
	const insertEntry = db.prepare(`INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confidence, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'agent', ?, 0, ?)`);
	const findRecentEntry = db.prepare(`SELECT id, ended_at AS endedAt, confidence, duration_seconds AS durationSeconds
       FROM time_entries
      WHERE user_id = ?
        AND project_id = ?
        AND category_id = ?
        AND source = 'agent'
        AND confirmed = 0
      ORDER BY ended_at DESC
      LIMIT 1`);
	const extendEntry = db.prepare(`UPDATE time_entries
        SET ended_at = ?,
            duration_seconds = duration_seconds + ?,
            confidence = ?
      WHERE id = ?`);
	db.transaction((groups) => {
		groups.forEach((g) => {
			const blockAvg = g.confidenceSum / g.observations.length;
			const existing = findRecentEntry.get(opts.userId, g.projectId, g.categoryId);
			if (existing) {
				const gap = new Date(g.startedAt).getTime() - new Date(existing.endedAt).getTime();
				if (gap >= -1e3 && gap <= MAX_GROUP_GAP_MS) {
					const merged = Math.min(existing.confidence ?? blockAvg, blockAvg);
					extendEntry.run(g.endedAt, g.durationSeconds, merged, existing.id);
					markObservationsClassified(g.observations.map((o) => o.id), existing.id);
					stats.classified += g.observations.length;
					return;
				}
			}
			const isDefaultGroup = g.projectId === defaultTarget.projectId && g.categoryId === defaultTarget.categoryId;
			if (g.durationSeconds < MIN_NEW_ENTRY_SECONDS && !isDefaultGroup) {
				stats.skipped += g.observations.length;
				return;
			}
			const entryId = (0, node_crypto.randomUUID)();
			insertEntry.run(entryId, opts.userId, g.projectId, g.categoryId, g.startedAt, g.endedAt, g.durationSeconds, blockAvg, dedupeJoin(g.reasonings));
			markObservationsClassified(g.observations.map((o) => o.id), entryId);
			stats.classified += g.observations.length;
		});
	})(blocks);
	const merged = consolidateByDay(opts.userId);
	if (merged > 0) console.log(`[classifier] consolidation merged away ${merged} entries`);
	return stats;
}
function observationDurationSeconds(o) {
	return Math.max(1, Math.round((new Date(o.endedAt).getTime() - new Date(o.startedAt).getTime()) / 1e3));
}
function explainSkip(r) {
	if (!r) return "no result for index";
	if (!r.projectId || !r.categoryId) return "no fit";
	if (r.confidence < MIN_CONFIDENCE) return `low confidence ${r.confidence.toFixed(2)} < ${MIN_CONFIDENCE}`;
	return null;
}
function canExtend(current, next, row) {
	if (current.projectId !== next.projectId || current.categoryId !== next.categoryId) return false;
	const gap = new Date(row.startedAt).getTime() - new Date(current.endedAt).getTime();
	return gap >= 0 && gap <= MAX_GROUP_GAP_MS;
}
function dedupeJoin(reasonings) {
	if (reasonings.length === 0) return null;
	const seen = /* @__PURE__ */ new Set();
	const unique = [];
	for (const r of reasonings) {
		const trimmed = r.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		unique.push(trimmed);
	}
	return unique.length === 0 ? null : unique.join(" · ");
}
function logSkip(row, reason, r) {
	const reasoning = r?.reasoning ? `; reasoning=${r.reasoning}` : "";
	console.log(`[classifier] skip obs ${row.id} (${row.app} | ${row.windowTitle}): ${reason}${reasoning}`);
}
function localDate$1(iso) {
	const d = new Date(iso);
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function consolidateByDay(userId) {
	const db = getDatabase();
	const select = db.prepare(`SELECT id, project_id, category_id, started_at, ended_at, duration_seconds, confidence
       FROM time_entries
      WHERE user_id = ? AND source = 'agent' AND confirmed = 0
      ORDER BY started_at ASC`);
	const updateEntry = db.prepare(`UPDATE time_entries
        SET started_at = ?, ended_at = ?, duration_seconds = ?, confidence = ?
      WHERE id = ?`);
	const reassignObs = db.prepare(`UPDATE observations SET classified_entry_id = ? WHERE classified_entry_id = ?`);
	const deleteEntry = db.prepare(`DELETE FROM time_entries WHERE id = ?`);
	let mergedAway = 0;
	db.transaction(() => {
		const rows = select.all(userId);
		const buckets = /* @__PURE__ */ new Map();
		for (const row of rows) {
			const key = `${localDate$1(row.started_at)}|${row.project_id}|${row.category_id}`;
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
			let minConf = target.confidence;
			for (let i = 1; i < list.length; i += 1) {
				const r = list[i];
				if (r.started_at < earliest) earliest = r.started_at;
				if (r.ended_at > latest) latest = r.ended_at;
				totalDuration += r.duration_seconds;
				if (r.confidence !== null) minConf = minConf === null ? r.confidence : Math.min(minConf, r.confidence);
			}
			updateEntry.run(earliest, latest, totalDuration, minConf, target.id);
			for (let i = 1; i < list.length; i += 1) {
				const other = list[i];
				reassignObs.run(target.id, other.id);
				deleteEntry.run(other.id);
				mergedAway += 1;
			}
		}
	})();
	return mergedAway;
}
//#endregion
//#region electron/llm/ollama.ts
var DEFAULT_OLLAMA_HOST = "http://localhost:11434";
var DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";
var OllamaClient = class {
	host;
	model;
	constructor(config = {}) {
		this.host = (config.host ?? "http://localhost:11434").replace(/\/+$/, "");
		this.model = config.model ?? "qwen2.5:7b";
	}
	async probe() {
		try {
			const res = await fetch(`${this.host}/api/tags`, { method: "GET" });
			if (!res.ok) return {
				ok: false,
				error: `Ollama returned ${res.status}`
			};
			if (!((await res.json()).models?.map((m) => m.name) ?? []).some((n) => n === this.model || n.startsWith(`${this.model}:`))) return {
				ok: false,
				error: `Model "${this.model}" is not installed. Run: ollama pull ${this.model}`
			};
			return {
				ok: true,
				model: this.model
			};
		} catch (e) {
			const cause = e?.cause;
			const detail = cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : "unknown error");
			return {
				ok: false,
				error: `Cannot reach Ollama at ${this.host}: ${detail}`
			};
		}
	}
	async classify(input) {
		if (input.observations.length === 0) return [];
		if (input.options.length === 0) return input.observations.map((o) => ({
			index: o.index,
			projectId: null,
			categoryId: null,
			confidence: 0,
			reasoning: "No projects available to assign."
		}));
		const prompt = buildPrompt(input);
		let res;
		try {
			res = await fetch(`${this.host}/api/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: this.model,
					prompt,
					stream: true,
					format: "json",
					options: { temperature: .1 }
				})
			});
		} catch (e) {
			throw wrapFetchError(e, `${this.host}/api/generate`);
		}
		if (!res.ok) throw new Error(`Ollama /api/generate returned ${res.status}: ${await res.text()}`);
		if (!res.body) throw new Error("Ollama /api/generate returned an empty body.");
		let combined = "";
		const decoder = new TextDecoder();
		let buf = "";
		try {
			const reader = res.body.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				let nl = buf.indexOf("\n");
				while (nl !== -1) {
					const line = buf.slice(0, nl).trim();
					buf = buf.slice(nl + 1);
					nl = buf.indexOf("\n");
					if (!line) continue;
					try {
						const chunk = JSON.parse(line);
						if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
						if (typeof chunk.response === "string") combined += chunk.response;
					} catch (e) {
						if (e instanceof Error && e.message.startsWith("Ollama: ")) throw e;
					}
				}
			}
		} catch (e) {
			throw wrapFetchError(e, `${this.host}/api/generate (streaming)`);
		}
		console.log("[llm] observations sent:", JSON.stringify(input.observations));
		console.log("[llm] raw response:", combined);
		return parseResponse(combined, input);
	}
};
function wrapFetchError(e, where) {
	if (!(e instanceof Error)) return /* @__PURE__ */ new Error(`fetch failed at ${where}`);
	const cause = e.cause;
	const detail = cause?.code ?? cause?.message ?? e.message;
	return /* @__PURE__ */ new Error(`Cannot reach ${where}: ${detail}`);
}
function buildPrompt(input) {
	const optionsLines = [];
	input.options.forEach((p, pi) => {
		optionsLines.push(`Project ${pi + 1} ("${p.projectName}"):`);
		if (p.categories.length === 0) optionsLines.push(`  (no categories defined)`);
		else p.categories.forEach((c, ci) => {
			optionsLines.push(`  Category ${ci + 1}: ${c.name}`);
		});
	});
	const observationLines = input.observations.map((o) => {
		const fields = [`app=${JSON.stringify(o.app ?? "")}`, `windowTitle=${JSON.stringify(o.windowTitle ?? "")}`];
		if (o.url) fields.push(`url=${JSON.stringify(o.url)}`);
		fields.push(`durationSec=${o.durationSeconds}`);
		return `  Observation ${o.index}: ${fields.join(", ")}`;
	});
	return [
		"You are a timesheet classification assistant.",
		"",
		"For each observation, pick the best matching project and category from the numbered options below. If no option is a clearly good fit, set projectIndex and categoryIndex to 0 — do not guess.",
		"",
		"Available options (categoryIndex is numbered within each project, starting at 1):",
		...optionsLines,
		"",
		"Observations:",
		...observationLines,
		"",
		"Respond ONLY with JSON of this exact shape:",
		"{ \"results\": [ { \"obsIndex\": <integer>, \"projectIndex\": <integer 0 or 1+>, \"categoryIndex\": <integer 0 or 1+>, \"confidence\": <number between 0 and 1>, \"reasoning\": \"<short string>\" } ] }",
		"",
		"Rules:",
		"- projectIndex and categoryIndex MUST be plain integers (e.g. 1, 2, 3). Never use decimals like 1.1.",
		"- categoryIndex is the 1-based position within the chosen project (or 0 if projectIndex is 0).",
		"- Include exactly one entry per observation, preserving order.",
		"- Use confidence < 0.5 for guesses.",
		"- Match window titles to category names by intent (e.g. a YouTube tab → a \"Youtube\" category if available)."
	].join("\n");
}
function parseResponse(text, input) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
	}
	const root = parsed;
	if (!root || !Array.isArray(root.results)) throw new Error(`LLM response missing "results" array.`);
	const out = [];
	for (const raw of root.results) {
		const r = raw;
		if (typeof r.obsIndex !== "number") continue;
		const projectIdx = sanitizeIndex(r.projectIndex);
		const categoryIdx = sanitizeIndex(r.categoryIndex);
		const confidence = typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : 0;
		const reasoning = typeof r.reasoning === "string" ? r.reasoning : void 0;
		let projectId = null;
		let categoryId = null;
		if (projectIdx >= 1 && projectIdx <= input.options.length) {
			const project = input.options[projectIdx - 1];
			if (project) {
				projectId = project.projectId;
				if (categoryIdx >= 1 && categoryIdx <= project.categories.length) {
					const cat = project.categories[categoryIdx - 1];
					if (cat) categoryId = cat.id;
				}
			}
		}
		if (projectId && !categoryId) projectId = null;
		out.push({
			index: r.obsIndex,
			projectId,
			categoryId,
			confidence,
			reasoning
		});
	}
	return out;
}
function sanitizeIndex(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	const floored = Math.floor(value);
	return floored >= 0 ? floored : 0;
}
//#endregion
//#region electron/agent.ts
var observer = null;
var startedAt = null;
var classifyTimer = null;
var inFlightClassification = null;
var lastSweepAt = 0;
var llm = new OllamaClient({
	host: DEFAULT_OLLAMA_HOST,
	model: DEFAULT_OLLAMA_MODEL
});
var AUTO_CHECK_INTERVAL_MS = 6e4;
var AUTO_CLASSIFY_THRESHOLD = 10;
var AUTO_SWEEP_INTERVAL_MS = 10 * 6e4;
var AUTO_PASS_MAX_OBSERVATIONS = 200;
function pendingObservationCount(userId) {
	if (!userId) return 0;
	const placeholders = IDLE_APP_NAMES.map(() => "?").join(",");
	return getDatabase().prepare(`SELECT COUNT(*) AS n FROM observations
        WHERE user_id = ?
          AND classified_entry_id IS NULL
          AND (skip_reason IS NULL OR skip_reason = '')
          AND LOWER(COALESCE(app, '')) NOT IN (${placeholders})`).get(userId, ...IDLE_APP_NAMES).n;
}
function agentState() {
	const running = observer?.isRunning() ?? false;
	const user = getCurrentUser();
	return {
		running,
		startedAt,
		lastObservationAt: observer?.getLastObservationAt()?.toISOString() ?? null,
		pendingObservations: pendingObservationCount(user?.id ?? null),
		lastError: observer?.getLastError() ?? null
	};
}
function startAgent() {
	const user = getCurrentUser();
	if (!user) throw new Error("Sign in before starting the agent.");
	if (observer?.isRunning()) return agentState();
	observer = new Observer({
		userId: user.id,
		onError: (err) => {
			console.error("[agent] observation error:", err);
		}
	});
	observer.start();
	startedAt = (/* @__PURE__ */ new Date()).toISOString();
	startAutoClassify();
	return agentState();
}
async function stopAgent() {
	stopAutoClassify();
	if (observer) {
		await observer.stop();
		observer = null;
	}
	startedAt = null;
	return agentState();
}
async function classifyNow() {
	const user = getCurrentUser();
	if (!user) throw new Error("Sign in before running classification.");
	observer?.flushPending();
	return runClassificationGuarded(user.id, AUTO_PASS_MAX_OBSERVATIONS);
}
function startAutoClassify() {
	if (classifyTimer) return;
	lastSweepAt = Date.now();
	classifyTimer = setInterval(() => {
		runAutoTick();
	}, AUTO_CHECK_INTERVAL_MS);
	runAutoTick();
}
function stopAutoClassify() {
	if (classifyTimer) {
		clearInterval(classifyTimer);
		classifyTimer = null;
	}
}
async function runAutoTick() {
	const user = getCurrentUser();
	if (!user) return;
	if (inFlightClassification) return;
	const pending = pendingObservationCount(user.id);
	const sweepDue = Date.now() - lastSweepAt >= AUTO_SWEEP_INTERVAL_MS;
	if (pending < AUTO_CLASSIFY_THRESHOLD && !sweepDue) return;
	observer?.flushPending();
	lastSweepAt = Date.now();
	try {
		const stats = await runClassificationGuarded(user.id, AUTO_PASS_MAX_OBSERVATIONS);
		if (stats.observations > 0) console.log(`[agent] auto-classify (pending=${pending}): classified ${stats.classified}/${stats.observations}, skipped ${stats.skipped}`);
	} catch (e) {
		console.error("[agent] auto-classify failed:", e);
	}
}
async function runClassificationGuarded(userId, maxObservations) {
	if (inFlightClassification) return inFlightClassification;
	inFlightClassification = (async () => {
		try {
			return await runClassification({
				userId,
				llm,
				maxObservations
			});
		} finally {
			inFlightClassification = null;
		}
	})();
	return inFlightClassification;
}
async function probeLLM() {
	return llm.probe();
}
//#endregion
//#region electron/repositories/timeEntries.ts
var SELECT$1 = `
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
function rowToEntry$1(row) {
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
		createdAt: row.created_at
	};
}
function listTimeEntriesForDate({ date }) {
	const user = requireCurrentUser();
	const start = `${date}T00:00:00.000Z`;
	const end = `${date}T23:59:59.999Z`;
	return getDatabase().prepare(`${SELECT$1}
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at <= ?
       ORDER BY e.started_at`).all(user.id, start, end).map(rowToEntry$1);
}
function createTimeEntry(input) {
	const startMs = new Date(input.startedAt).getTime();
	const endMs = new Date(input.endedAt).getTime();
	if (endMs <= startMs) throw new Error("End time must be after start time.");
	const user = requireCurrentUser();
	const db = getDatabase();
	const category = db.prepare("SELECT project_id FROM categories WHERE id = ?").get(input.categoryId);
	if (!category) throw new Error("Category not found.");
	if (category.project_id !== input.projectId) throw new Error("Selected category does not belong to the selected project.");
	if (!user.isAdmin) {
		if (!db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(input.projectId, user.id)) throw new Error("You are not a member of this project.");
	}
	const id = (0, node_crypto.randomUUID)();
	const durationSeconds = Math.round((endMs - startMs) / 1e3);
	db.prepare(`INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?)`).run(id, user.id, input.projectId, input.categoryId, input.startedAt, input.endedAt, durationSeconds, input.note ?? null);
	return rowToEntry$1(db.prepare(`${SELECT$1} WHERE e.id = ?`).get(id));
}
function confirmTimeEntry({ id }) {
	const user = requireCurrentUser();
	const db = getDatabase();
	const owner = db.prepare(`SELECT user_id FROM time_entries WHERE id = ?`).get(id);
	if (!owner) throw new Error("Entry not found.");
	if (!user.isAdmin && owner.user_id !== user.id) throw new Error("You can only confirm your own entries.");
	db.prepare(`UPDATE time_entries SET confirmed = 1 WHERE id = ?`).run(id);
	return rowToEntry$1(db.prepare(`${SELECT$1} WHERE e.id = ?`).get(id));
}
function deleteTimeEntry({ id }) {
	const user = requireCurrentUser();
	const db = getDatabase();
	const owner = db.prepare(`SELECT user_id FROM time_entries WHERE id = ?`).get(id);
	if (!owner) return;
	if (!user.isAdmin && owner.user_id !== user.id) throw new Error("You can only delete your own entries.");
	db.prepare("DELETE FROM time_entries WHERE id = ?").run(id);
}
function localDate(iso) {
	const d = new Date(iso);
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(isoDate, n) {
	const d = /* @__PURE__ */ new Date(`${isoDate}T00:00:00`);
	d.setDate(d.getDate() + n);
	const pad = (x) => String(x).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function getWeekGrid({ weekStart }) {
	const user = requireCurrentUser();
	const db = getDatabase();
	const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
	const rows = db.prepare(`SELECT
         e.project_id, p.name AS project_name,
         e.category_id, c.name AS category_name,
         e.started_at, e.duration_seconds, e.source, e.confirmed
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       JOIN categories c ON c.id = e.category_id
       WHERE e.user_id = ?
         AND date(e.started_at, 'localtime') >= ?
         AND date(e.started_at, 'localtime') <= ?`).all(user.id, days[0], days[6]);
	const dayIndex = new Map(days.map((d, i) => [d, i]));
	const grid = /* @__PURE__ */ new Map();
	for (const r of rows) {
		const idx = dayIndex.get(localDate(r.started_at));
		if (idx === void 0) continue;
		const key = `${r.project_id}|${r.category_id}`;
		let row = grid.get(key);
		if (!row) {
			row = {
				projectId: r.project_id,
				projectName: r.project_name,
				categoryId: r.category_id,
				categoryName: r.category_name,
				cells: Array.from({ length: 7 }, () => 0),
				agentCells: Array.from({ length: 7 }, () => false)
			};
			grid.set(key, row);
		}
		row.cells[idx] += r.duration_seconds;
		if (r.source === "agent" && r.confirmed === 0) row.agentCells[idx] = true;
	}
	return {
		weekStart,
		days,
		rows: Array.from(grid.values()).sort((a, b) => a.projectName.localeCompare(b.projectName) || a.categoryName.localeCompare(b.categoryName))
	};
}
function setWeekCell(input) {
	const user = requireCurrentUser();
	const db = getDatabase();
	const category = db.prepare("SELECT project_id FROM categories WHERE id = ?").get(input.categoryId);
	if (!category) throw new Error("Category not found.");
	if (category.project_id !== input.projectId) throw new Error("Selected category does not belong to the selected project.");
	if (!user.isAdmin) {
		if (!db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(input.projectId, user.id)) throw new Error("You are not a member of this project.");
	}
	const seconds = Math.max(0, Math.round(input.durationSeconds));
	const remove = db.prepare(`DELETE FROM time_entries
       WHERE user_id = ? AND project_id = ? AND category_id = ?
         AND date(started_at, 'localtime') = ?`);
	const insert = db.prepare(`INSERT INTO time_entries
       (id, user_id, project_id, category_id, started_at, ended_at, duration_seconds, source, confidence, confirmed, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', NULL, 1, NULL)`);
	db.transaction(() => {
		remove.run(user.id, input.projectId, input.categoryId, input.date);
		if (seconds > 0) {
			const startedAt = (/* @__PURE__ */ new Date(`${input.date}T12:00:00`)).toISOString();
			const endedAt = new Date(new Date(startedAt).getTime() + seconds * 1e3).toISOString();
			insert.run((0, node_crypto.randomUUID)(), user.id, input.projectId, input.categoryId, startedAt, endedAt, seconds);
		}
	})();
}
//#endregion
//#region electron/repositories/dashboard.ts
var RECENT_LIMIT = 8;
function rowToEntry(r) {
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
		createdAt: r.created_at
	};
}
function monthBounds(month) {
	let year;
	let m;
	if (month && /^\d{4}-\d{2}$/.test(month)) [year, m] = month.split("-").map(Number);
	else {
		const now = /* @__PURE__ */ new Date();
		year = now.getFullYear();
		m = now.getMonth() + 1;
	}
	return {
		start: new Date(year, m - 1, 1, 0, 0, 0, 0).toISOString(),
		end: new Date(year, m, 0, 23, 59, 59, 999).toISOString()
	};
}
function getDashboardSummary(input) {
	const user = requireCurrentUser();
	const db = getDatabase();
	const { start, end } = monthBounds(input?.month);
	const byProject = db.prepare(`SELECT
         e.project_id,
         p.name AS project_name,
         CAST(SUM(e.duration_seconds) / 60 AS INTEGER) AS minutes
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at <= ?
       GROUP BY e.project_id
       ORDER BY minutes DESC`).all(user.id, start, end).map((r) => ({
		projectId: r.project_id,
		projectName: r.project_name,
		minutes: r.minutes ?? 0
	}));
	const totalMinutes = byProject.reduce((s, p) => s + p.minutes, 0);
	const recentEntries = db.prepare(`SELECT
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
       LIMIT ?`).all(user.id, start, end, RECENT_LIMIT).map(rowToEntry);
	const counts = db.prepare(`SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN source = 'agent' THEN 1 ELSE 0 END) AS agent_total,
         SUM(CASE WHEN source = 'manual' THEN 1 ELSE 0 END) AS manual_total,
         SUM(CASE WHEN source = 'agent' AND confirmed = 0 THEN 1 ELSE 0 END) AS unconfirmed,
         AVG(CASE WHEN source = 'agent' THEN confidence ELSE NULL END) AS avg_agent_conf
       FROM time_entries
       WHERE user_id = ? AND started_at >= ? AND started_at <= ?`).get(user.id, start, end);
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
		averageAgentConfidence: counts.avg_agent_conf
	};
}
//#endregion
//#region electron/repositories/analytics.ts
function rangeDays(range) {
	switch (range) {
		case "last7": return 7;
		case "last90": return 90;
		default: return 30;
	}
}
function pad(n) {
	return String(n).padStart(2, "0");
}
function isoLocal(d) {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDaysIso(iso, n) {
	const d = /* @__PURE__ */ new Date(`${iso}T00:00:00`);
	d.setDate(d.getDate() + n);
	return isoLocal(d);
}
function getAnalyticsOverview({ range, userId }) {
	const user = requireCurrentUser();
	const db = getDatabase();
	const scopedUserId = user.isAdmin && userId ? userId : user.isAdmin ? null : user.id;
	const teamWide = scopedUserId === null;
	const days = rangeDays(range);
	const today = /* @__PURE__ */ new Date();
	const endDate = isoLocal(today);
	const startDate = isoLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)));
	const where = `date(e.started_at, 'localtime') >= @start AND date(e.started_at, 'localtime') <= @end${teamWide ? "" : " AND e.user_id = @uid"}`;
	const params = teamWide ? {
		start: startDate,
		end: endDate
	} : {
		start: startDate,
		end: endDate,
		uid: scopedUserId
	};
	const totals = db.prepare(`SELECT COALESCE(SUM(e.duration_seconds), 0) AS s, COUNT(*) AS n FROM time_entries e WHERE ${where}`).get(params);
	const projectsCount = db.prepare(`SELECT COUNT(DISTINCT e.project_id) AS n FROM time_entries e WHERE ${where}`).get(params);
	const bySourceRows = db.prepare(`SELECT e.source AS src, COALESCE(SUM(e.duration_seconds), 0) AS s FROM time_entries e WHERE ${where} GROUP BY e.source`).all(params);
	const agentSeconds = bySourceRows.find((r) => r.src === "agent")?.s ?? 0;
	const manualSeconds = bySourceRows.find((r) => r.src === "manual")?.s ?? 0;
	const dailyRows = db.prepare(`SELECT date(e.started_at, 'localtime') AS d, COALESCE(SUM(e.duration_seconds), 0) AS s FROM time_entries e WHERE ${where} GROUP BY d`).all(params);
	const dailyMap = new Map(dailyRows.map((r) => [r.d, r.s]));
	const daily = [];
	for (let i = 0; i < days; i += 1) {
		const date = addDaysIso(startDate, i);
		daily.push({
			date,
			seconds: dailyMap.get(date) ?? 0
		});
	}
	const byProject = db.prepare(`SELECT e.project_id AS id, p.name AS label, COALESCE(SUM(e.duration_seconds), 0) AS s
           FROM time_entries e JOIN projects p ON p.id = e.project_id
          WHERE ${where}
          GROUP BY e.project_id
          ORDER BY s DESC`).all(params).map((r) => ({
		id: r.id,
		label: r.label,
		seconds: r.s
	}));
	const byCategory = db.prepare(`SELECT e.category_id AS id, c.name AS label, p.name AS sublabel, COALESCE(SUM(e.duration_seconds), 0) AS s
           FROM time_entries e
           JOIN categories c ON c.id = e.category_id
           JOIN projects p ON p.id = e.project_id
          WHERE ${where}
          GROUP BY e.category_id
          ORDER BY s DESC`).all(params).map((r) => ({
		id: r.id,
		label: r.label,
		sublabel: r.sublabel,
		seconds: r.s
	}));
	const byUser = teamWide ? db.prepare(`SELECT e.user_id AS id, u.name AS label, COALESCE(SUM(e.duration_seconds), 0) AS s
               FROM time_entries e JOIN users u ON u.id = e.user_id
              WHERE ${where}
              GROUP BY e.user_id
              ORDER BY s DESC`).all(params).map((r) => ({
		id: r.id,
		label: r.label,
		seconds: r.s
	})) : [];
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
		teamWide
	};
}
//#endregion
//#region electron/repositories/projectMembers.ts
var VALID_THEMES = [
	"light",
	"dark",
	"system"
];
function rowToMember(r) {
	const theme = VALID_THEMES.includes(r.theme_preference ?? "") ? r.theme_preference : "system";
	return {
		id: r.id,
		name: r.name,
		email: r.email,
		isAdmin: r.is_admin === 1,
		createdAt: r.created_at,
		themePreference: theme,
		addedAt: r.added_at
	};
}
var SELECT = `
  SELECT u.id, u.name, u.email, u.is_admin, u.created_at, u.theme_preference, m.added_at
  FROM project_members m
  JOIN users u ON u.id = m.user_id
`;
function listProjectMembers({ projectId }) {
	return getDatabase().prepare(`${SELECT} WHERE m.project_id = ? ORDER BY u.name`).all(projectId).map(rowToMember);
}
function addProjectMember({ projectId, userId }) {
	const db = getDatabase();
	if (!db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(projectId)) throw new Error("Project not found.");
	if (!db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(userId)) throw new Error("User not found.");
	db.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`).run(projectId, userId);
	return rowToMember(db.prepare(`${SELECT} WHERE m.project_id = ? AND m.user_id = ?`).get(projectId, userId));
}
function removeProjectMember({ projectId, userId }) {
	getDatabase().prepare(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`).run(projectId, userId);
}
//#endregion
//#region electron/ipc/handlers.ts
var handlers = {
	"app:info": () => ({
		version: electron.app.getVersion(),
		platform: process.platform,
		dataDir: electron.app.getPath("userData")
	}),
	"agent:status": () => agentState(),
	"agent:start": () => startAgent(),
	"agent:stop": () => stopAgent(),
	"agent:classifyNow": () => classifyNow(),
	"agent:llmHealth": () => probeLLM(),
	"users:list": () => listUsers(),
	"users:create": (payload) => createUser(payload),
	"users:delete": (payload) => deleteUser(payload),
	"users:current": () => getCurrentUser(),
	"users:setTheme": ({ theme }) => setUserTheme(requireCurrentUser().id, theme),
	"auth:login": ({ email }) => loginByEmail(email),
	"auth:logout": () => {
		clearCurrentUser();
	},
	"auth:signup": (payload) => signup(payload),
	"org:get": () => ({ name: getOrgName() }),
	"org:setName": (payload) => setOrgName(payload),
	"projects:list": () => listProjects(),
	"projects:create": (payload) => createProject(payload),
	"projects:rename": (payload) => renameProject(payload),
	"projects:delete": (payload) => deleteProject(payload),
	"projectMembers:list": (payload) => listProjectMembers(payload),
	"projectMembers:add": (payload) => addProjectMember(payload),
	"projectMembers:remove": (payload) => removeProjectMember(payload),
	"categories:list": () => listCategories(),
	"categories:listForProject": (payload) => listCategoriesForProject(payload),
	"categories:create": (payload) => createCategory(payload),
	"categories:rename": (payload) => renameCategory(payload),
	"categories:delete": (payload) => deleteCategory(payload),
	"dashboard:summary": (payload) => getDashboardSummary(payload || void 0),
	"analytics:overview": (payload) => getAnalyticsOverview(payload),
	"timeEntries:listForDate": (payload) => listTimeEntriesForDate(payload),
	"timeEntries:confirm": (payload) => confirmTimeEntry(payload),
	"timeEntries:create": (payload) => createTimeEntry(payload),
	"timeEntries:delete": (payload) => deleteTimeEntry(payload),
	"timeEntries:weekGrid": (payload) => getWeekGrid(payload),
	"timeEntries:setCell": (payload) => setWeekCell(payload)
};
function registerIpcHandlers(ipcMain) {
	Object.keys(handlers).forEach((channel) => {
		ipcMain.handle(channel, (_event, payload) => handlers[channel](payload));
	});
}
//#endregion
//#region electron/main.ts
process.env.APP_ROOT = node_path.default.join(__dirname, "..");
var VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
var RENDERER_DIST = node_path.default.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? node_path.default.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
var mainWindow = null;
function createWindow() {
	mainWindow = new electron.BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1024,
		minHeight: 640,
		backgroundColor: "#0b1326",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
		webPreferences: {
			preload: node_path.default.join(__dirname, "preload.mjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		}
	});
	if (VITE_DEV_SERVER_URL) mainWindow.loadURL(VITE_DEV_SERVER_URL);
	else mainWindow.loadFile(node_path.default.join(RENDERER_DIST, "index.html"));
}
electron.app.whenReady().then(() => {
	initDatabase();
	registerIpcHandlers(electron.ipcMain);
	createWindow();
	electron.app.on("activate", () => {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		closeDatabase();
		electron.app.quit();
		mainWindow = null;
	}
});
electron.app.on("before-quit", () => {
	closeDatabase();
});
//#endregion
