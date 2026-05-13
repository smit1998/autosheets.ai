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
