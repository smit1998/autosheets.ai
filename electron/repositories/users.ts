import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db';
import type { User } from '../../src/shared/ipc-contract';

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  is_admin: number;
  created_at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    isAdmin: r.is_admin === 1,
    createdAt: r.created_at,
  };
}

export function listUsers(): User[] {
  const rows = getDatabase()
    .prepare(`SELECT id, name, email, is_admin, created_at FROM users ORDER BY is_admin DESC, name`)
    .all() as UserRow[];
  return rows.map(rowToUser);
}

export function getUser(id: string): User | null {
  const row = getDatabase()
    .prepare(`SELECT id, name, email, is_admin, created_at FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserByEmail(email: string): User | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const row = getDatabase()
    .prepare(
      `SELECT id, name, email, is_admin, created_at FROM users WHERE LOWER(email) = ? LIMIT 1`,
    )
    .get(normalized) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function createUser({
  name,
  email,
  isAdmin,
}: {
  name: string;
  email?: string;
  isAdmin?: boolean;
}): User {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Name is required.');
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Email is required.');
  if (!EMAIL_RE.test(normalizedEmail)) throw new Error('Email is not valid.');
  if (getUserByEmail(normalizedEmail)) {
    throw new Error('A user with this email already exists.');
  }
  const id = randomUUID();
  const db = getDatabase();
  db.prepare(`INSERT INTO users (id, name, email, is_admin) VALUES (?, ?, ?, ?)`).run(
    id,
    trimmedName,
    normalizedEmail,
    isAdmin ? 1 : 0,
  );
  return getUser(id)!;
}

export function deleteUser({ id }: { id: string }): void {
  const db = getDatabase();
  const lastAdmin = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE is_admin = 1`)
    .get() as { n: number };
  const target = db.prepare(`SELECT is_admin FROM users WHERE id = ?`).get(id) as
    | { is_admin: number }
    | undefined;
  if (!target) throw new Error('User not found.');
  if (target.is_admin === 1 && lastAdmin.n <= 1) {
    throw new Error('Cannot delete the last admin user.');
  }
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}
