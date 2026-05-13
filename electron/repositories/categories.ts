import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db';
import { requireCurrentUser } from './settings';
import type { Category } from '../../src/shared/ipc-contract';

type CategoryRow = {
  id: string;
  project_id: string;
  project_name: string;
  name: string;
  created_at: string;
};

const SELECT = `
  SELECT
    c.id,
    c.project_id,
    p.name AS project_name,
    c.name,
    c.created_at
  FROM categories c
  JOIN projects p ON p.id = c.project_id
`;

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    name: row.name,
    createdAt: row.created_at,
  };
}

// Restricts to categories of projects the current user can see.
export function listCategories(): Category[] {
  const user = requireCurrentUser();
  const db = getDatabase();
  if (user.isAdmin) {
    const rows = db
      .prepare(`${SELECT} ORDER BY p.name, c.created_at DESC`)
      .all() as CategoryRow[];
    return rows.map(rowToCategory);
  }
  const rows = db
    .prepare(
      `${SELECT}
       JOIN project_members m ON m.project_id = c.project_id
       WHERE m.user_id = ?
       ORDER BY p.name, c.created_at DESC`,
    )
    .all(user.id) as CategoryRow[];
  return rows.map(rowToCategory);
}

export function listCategoriesForProject({ projectId }: { projectId: string }): Category[] {
  const rows = getDatabase()
    .prepare(`${SELECT} WHERE c.project_id = ? ORDER BY c.created_at DESC`)
    .all(projectId) as CategoryRow[];
  return rows.map(rowToCategory);
}

export function createCategory({
  projectId,
  name,
}: {
  projectId: string;
  name: string;
}): Category {
  const user = requireCurrentUser();
  if (!user.isAdmin) throw new Error('Only admins can manage categories.');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required.');
  const db = getDatabase();
  const project = db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId);
  if (!project) throw new Error('Project not found.');
  const id = randomUUID();
  db.prepare('INSERT INTO categories (id, project_id, name) VALUES (?, ?, ?)').run(
    id,
    projectId,
    trimmed,
  );
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as CategoryRow;
  return rowToCategory(row);
}

export function deleteCategory({ id }: { id: string }): void {
  const user = requireCurrentUser();
  if (!user.isAdmin) throw new Error('Only admins can manage categories.');
  const db = getDatabase();
  const inUse = db
    .prepare('SELECT 1 FROM time_entries WHERE category_id = ? LIMIT 1')
    .get(id);
  if (inUse) {
    throw new Error('Cannot delete a category that has time entries.');
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}
