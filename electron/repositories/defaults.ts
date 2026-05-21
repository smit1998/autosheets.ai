import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db';

// Catches every observation the classifier couldn't confidently place. There
// is exactly one default project and one default category in the database
// (org-wide). They're auto-created on first use, can be renamed at any time
// by the user, and the repository layer refuses to delete them.

const DEFAULT_PROJECT_NAME = 'Uncategorized';
const DEFAULT_CATEGORY_NAME = 'Uncategorized';

type DefaultTarget = {
  projectId: string;
  categoryId: string;
};

// Ensures the (default project, default category) pair exists and that the
// given user is a member of the default project, then returns their ids.
export function ensureDefaultCategory(userId: string): DefaultTarget {
  const db = getDatabase();

  let project = db
    .prepare(`SELECT id FROM projects WHERE is_default = 1 LIMIT 1`)
    .get() as { id: string } | undefined;

  if (!project) {
    const id = randomUUID();
    db.prepare(`INSERT INTO projects (id, name, is_default) VALUES (?, ?, 1)`).run(
      id,
      DEFAULT_PROJECT_NAME,
    );
    project = { id };
  }

  let category = db
    .prepare(`SELECT id FROM categories WHERE project_id = ? AND is_default = 1 LIMIT 1`)
    .get(project.id) as { id: string } | undefined;

  if (!category) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO categories (id, project_id, name, is_default) VALUES (?, ?, ?, 1)`,
    ).run(id, project.id, DEFAULT_CATEGORY_NAME);
    category = { id };
  }

  // Make sure the user can see entries in the default project.
  db.prepare(
    `INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`,
  ).run(project.id, userId);

  return { projectId: project.id, categoryId: category.id };
}

export function isDefaultProject(id: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT is_default FROM projects WHERE id = ?`)
    .get(id) as { is_default: number } | undefined;
  return row?.is_default === 1;
}

export function isDefaultCategory(id: string): boolean {
  const row = getDatabase()
    .prepare(`SELECT is_default FROM categories WHERE id = ?`)
    .get(id) as { is_default: number } | undefined;
  return row?.is_default === 1;
}
