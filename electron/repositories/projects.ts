import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db';
import { requireCurrentUser } from './settings';
import type { Project } from '../../src/shared/ipc-contract';

type ProjectRow = {
  id: string;
  name: string;
  created_at: string;
  category_count: number;
};

const ROW_FIELDS = `
    p.id,
    p.name,
    p.created_at,
    (SELECT COUNT(*) FROM categories c WHERE c.project_id = p.id) AS category_count
`;

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    categoryCount: row.category_count,
  };
}

// Admins see every project. Non-admins see only the projects they're members of.
export function listProjects(): Project[] {
  const user = requireCurrentUser();
  const db = getDatabase();
  if (user.isAdmin) {
    const rows = db
      .prepare(`SELECT ${ROW_FIELDS} FROM projects p ORDER BY p.created_at DESC`)
      .all() as ProjectRow[];
    return rows.map(rowToProject);
  }
  const rows = db
    .prepare(
      `SELECT ${ROW_FIELDS}
         FROM projects p
         JOIN project_members m ON m.project_id = p.id
         WHERE m.user_id = ?
         ORDER BY p.created_at DESC`,
    )
    .all(user.id) as ProjectRow[];
  return rows.map(rowToProject);
}

export function createProject({ name }: { name: string }): Project {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name is required.');
  const id = randomUUID();
  const db = getDatabase();
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, trimmed);
  // Auto-add the creator as a member so they can immediately see the project.
  const user = requireCurrentUser();
  db.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`).run(
    id,
    user.id,
  );
  const row = db
    .prepare(`SELECT ${ROW_FIELDS} FROM projects p WHERE p.id = ?`)
    .get(id) as ProjectRow;
  return rowToProject(row);
}

export function deleteProject({ id }: { id: string }): void {
  const db = getDatabase();
  const inUse = db
    .prepare('SELECT 1 FROM time_entries WHERE project_id = ? LIMIT 1')
    .get(id);
  if (inUse) {
    throw new Error('Cannot delete a project that has time entries.');
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}
