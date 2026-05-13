import { getDatabase } from '../db';
import type { ProjectMember } from '../../src/shared/ipc-contract';

type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  is_admin: number;
  created_at: string;
  added_at: string;
};

function rowToMember(r: MemberRow): ProjectMember {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    isAdmin: r.is_admin === 1,
    createdAt: r.created_at,
    addedAt: r.added_at,
  };
}

const SELECT = `
  SELECT u.id, u.name, u.email, u.is_admin, u.created_at, m.added_at
  FROM project_members m
  JOIN users u ON u.id = m.user_id
`;

export function listProjectMembers({ projectId }: { projectId: string }): ProjectMember[] {
  const rows = getDatabase()
    .prepare(`${SELECT} WHERE m.project_id = ? ORDER BY u.name`)
    .all(projectId) as MemberRow[];
  return rows.map(rowToMember);
}

export function addProjectMember({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}): ProjectMember {
  const db = getDatabase();
  const project = db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(projectId);
  if (!project) throw new Error('Project not found.');
  const user = db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(userId);
  if (!user) throw new Error('User not found.');
  db.prepare(`INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)`).run(
    projectId,
    userId,
  );
  const row = db
    .prepare(`${SELECT} WHERE m.project_id = ? AND m.user_id = ?`)
    .get(projectId, userId) as MemberRow;
  return rowToMember(row);
}

export function removeProjectMember({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}): void {
  getDatabase()
    .prepare(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`)
    .run(projectId, userId);
}
