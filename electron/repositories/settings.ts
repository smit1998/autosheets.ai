import { getDatabase } from '../db';
import { createUser, getUser, getUserByEmail } from './users';
import type { User } from '../../src/shared/ipc-contract';

const KEY = 'current_user_id';

// Returns the logged-in user, or null if no one is signed in or the stored
// id has gone stale (user was deleted).
export function getCurrentUser(): User | null {
  const row = getDatabase()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(KEY) as { value: string } | undefined;
  if (!row?.value) return null;
  const user = getUser(row.value);
  if (!user) {
    // Heal stale setting silently.
    clearCurrentUser();
    return null;
  }
  return user;
}

// Throws if there is no logged-in user. Use from privileged repository
// operations that have no meaning without an authenticated user.
export function requireCurrentUser(): User {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in.');
  return user;
}

export function loginByEmail(email: string): User {
  const user = getUserByEmail(email);
  if (!user) throw new Error('No account found for that email.');
  const db = getDatabase();
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`).run(KEY, user.id);
  return user;
}

export function clearCurrentUser(): void {
  getDatabase().prepare(`DELETE FROM app_settings WHERE key = ?`).run(KEY);
}

// Self-service signup: creates a non-admin account and logs them in. Admins
// are only created via the seeded default or by another admin from the Team
// page — never via this flow.
export function signup({ name, email }: { name: string; email: string }): User {
  const user = createUser({ name, email, isAdmin: false });
  getDatabase()
    .prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`)
    .run(KEY, user.id);
  return user;
}

// ── Organisation name ─────────────────────────────────────────────────────

const ORG_NAME_KEY = 'org_name';

export function getOrgName(): string | null {
  const row = getDatabase()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(ORG_NAME_KEY) as { value: string } | undefined;
  return row?.value && row.value.trim() ? row.value : null;
}

// Admin-only. Trims whitespace and validates that something is left over.
// Persists into the same key/value app_settings table used for the current
// user, so no extra schema is needed.
export function setOrgName({ name }: { name: string }): { name: string } {
  const user = requireCurrentUser();
  if (!user.isAdmin) throw new Error('Only admins can rename the organisation.');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Organisation name is required.');
  if (trimmed.length > 80) throw new Error('Organisation name is too long (max 80 characters).');
  getDatabase()
    .prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`)
    .run(ORG_NAME_KEY, trimmed);
  return { name: trimmed };
}
