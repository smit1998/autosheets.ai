import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';

import { PageHeader } from '../../shared/components/PageHeader';
import { SectionCard } from '../../shared/components/SectionCard';
import { EmptyState } from '../../shared/components/EmptyState';
import { useT } from '../../i18n/useT';
import { PALETTE } from '../../shared/constants';
import { ipc } from '../../shared/ipc';
import type { Category, Project } from '../../shared/ipc-contract';

import { useCurrentUser } from '../../shared/UserContext';
import type { User } from '../../shared/ipc-contract';

import { NewProjectDialog } from './NewProjectDialog';
import { NewCategoryDialog } from './NewCategoryDialog';
import { CategoriesDropdown } from './CategoriesDropdown';
import { MembersDropdown } from './MembersDropdown';
import { AddMemberDialog } from './AddMemberDialog';
import type { ProjectMember } from '../../shared/ipc-contract';

// Stable empty references so `query.data ?? FALLBACK` doesn't produce a new
// array on each render and bust downstream useMemo dependencies.
const EMPTY_PROJECTS: Project[] = [];
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_USERS: User[] = [];

const STATIC_AGENT_METRICS = {
  unmappedSignal: null as { activityCount: number; sourceLabel: string; suggestedEpic: string } | null,
  connectedSourceCount: null as number | null,
  aiMappingAccuracy: null as number | null,
  unmappedMinutes: null as number | null,
};

export function Projects() {
  const t = useT();
  const [filter, setFilter] = useState('');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDefaultProjectId, setCategoryDefaultProjectId] = useState<string | undefined>();
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { current } = useCurrentUser();
  const isAdmin = current?.isAdmin ?? false;

  // Server state goes through TanStack Query: shared cache across components,
  // automatic refetch on mutation invalidation, and a single source of truth
  // per query key.
  const queryClient = useQueryClient();
  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => ipc('projects:list', undefined),
  });
  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: () => ipc('categories:list', undefined),
  });
  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: () => ipc('users:list', undefined),
  });

  const projects = projectsQ.data ?? EMPTY_PROJECTS;
  const categories = categoriesQ.data ?? EMPTY_CATEGORIES;
  const allUsers = usersQ.data ?? EMPTY_USERS;

  const filteredProjects = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, filter]);

  // Two delete mutations sharing the same error handling + invalidation
  // pattern. invalidateQueries triggers any active query with that key to
  // refetch — no manual refetch plumbing.
  const deleteCategory = useMutation({
    mutationFn: (id: string) => ipc('categories:delete', { id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : String(e)),
  });
  const deleteProject = useMutation({
    mutationFn: (id: string) => ipc('projects:delete', { id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : String(e)),
  });
  const renameCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      ipc('categories:rename', { id, name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : String(e)),
  });
  const renameProject = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      ipc('projects:rename', { id, name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e) => setMutationError(e instanceof Error ? e.message : String(e)),
  });

  // Dialogs may create new projects / categories / members. They take an
  // onCreated callback — point it at our invalidator so the table refreshes.
  const onProjectsChanged = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
  }, [queryClient]);
  const onCategoriesChanged = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
  }, [queryClient]);

  const handleCreateProject = useCallback(() => setProjectDialogOpen(true), []);
  const handleCreateCategory = useCallback((projectId?: string) => {
    setCategoryDefaultProjectId(projectId);
    setCategoryDialogOpen(true);
  }, []);

  const handleDeleteCategory = useCallback(
    (id: string) => {
      setMutationError(null);
      deleteCategory.mutate(id);
    },
    [deleteCategory],
  );
  const handleDeleteProject = useCallback(
    (id: string) => {
      setMutationError(null);
      deleteProject.mutate(id);
    },
    [deleteProject],
  );
  const handleRenameCategory = useCallback(
    (id: string, name: string) => {
      setMutationError(null);
      renameCategory.mutate({ id, name });
    },
    [renameCategory],
  );
  const handleRenameProject = useCallback(
    (id: string, name: string) => {
      setMutationError(null);
      renameProject.mutate({ id, name });
    },
    [renameProject],
  );

  return (
    <Box>
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.subtitle')}
        action={
          <Chip
            icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />}
            label={t('common.aiEngineActive')}
            sx={{
              bgcolor: PALETTE.surfaceContainer,
              border: 1,
              borderColor: 'divider',
              color: 'text.primary',
              fontWeight: 600,
            }}
          />
        }
      />

      {(projectsQ.error || categoriesQ.error || mutationError) && (
        <Alert severity="error" sx={{ mb: 4 }} onClose={() => setMutationError(null)}>
          {mutationError ?? projectsQ.error?.message ?? categoriesQ.error?.message}
        </Alert>
      )}

      <SectionCard variant="ai" sx={{ mb: 6 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
          <AutoAwesomeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography variant="overline" color="primary.main">
            {t('projects.agentIntelligence')}
          </Typography>
        </Stack>
        <Typography variant="h4" sx={{ mb: 3 }}>
          {STATIC_AGENT_METRICS.unmappedSignal === null
            ? t('empty.noUnmappedSignals')
            : t('projects.unmappedSignal')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('empty.startTrackingHint')}
        </Typography>
      </SectionCard>

      <SectionCard
        title={t('projects.activeProjectInventory')}
        action={
          <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
            <Stack
              direction="row"
              spacing={2}
              sx={{
                alignItems: 'center',
                px: 3,
                py: 1.5,
                borderRadius: 1,
                bgcolor: PALETTE.surfaceContainer,
                border: 1,
                borderColor: 'divider',
                minWidth: 280,
              }}
            >
              <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <InputBase
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('projects.filterPlaceholder')}
                sx={{ flex: 1, fontSize: 13 }}
              />
            </Stack>
            <Button startIcon={<FilterListIcon />} variant="outlined" sx={{ py: 1.5 }} disabled>
              {t('common.filter')}
            </Button>
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              color="primary"
              sx={{ py: 1.5 }}
              onClick={handleCreateProject}
            >
              {t('common.newProject')}
            </Button>
          </Stack>
        }
      >
        {projectsQ.isPending ? (
          <LoadingBlock />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            Icon={FolderOutlinedIcon}
            title={
              projects.length === 0
                ? t('empty.noProjectsYet')
                : t('empty.noProjectsYet')
            }
            hint={t('empty.addFirstProject')}
            action={
              <Button startIcon={<AddIcon />} variant="contained" color="primary" onClick={handleCreateProject}>
                {t('common.newProject')}
              </Button>
            }
          />
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('projects.columnProjectName')}</TableCell>
                <TableCell>{t('projects.columnStatus')}</TableCell>
                <TableCell>Members</TableCell>
                <TableCell>Categories</TableCell>
                <TableCell align="right">{t('projects.columnActions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProjects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  categories={categories.filter((c) => c.projectId === p.id)}
                  allUsers={allUsers}
                  canManageMembers={isAdmin}
                  canManageCategories={isAdmin}
                  onAddCategory={() => handleCreateCategory(p.id)}
                  onDeleteCategory={handleDeleteCategory}
                  onRenameCategory={handleRenameCategory}
                  onRenameProject={handleRenameProject}
                  onDelete={() => handleDeleteProject(p.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <Box
        sx={{
          display: 'grid',
          gap: 6,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          mt: 6,
        }}
      >
        <BottomStat
          Icon={HubOutlinedIcon}
          label={t('projects.connectedSources')}
          value={
            STATIC_AGENT_METRICS.connectedSourceCount === null
              ? t('empty.noValue')
              : STATIC_AGENT_METRICS.connectedSourceCount.toString()
          }
        />
        <BottomStat
          Icon={PsychologyOutlinedIcon}
          label={t('projects.aiMappingAccuracy')}
          value={
            STATIC_AGENT_METRICS.aiMappingAccuracy === null
              ? t('empty.noValue')
              : `${STATIC_AGENT_METRICS.aiMappingAccuracy.toFixed(1)}%`
          }
          hint={t('projects.highConfidenceThreshold')}
        />
        <BottomStat
          Icon={WarningAmberOutlinedIcon}
          label={t('projects.unmappedActivity')}
          value={
            STATIC_AGENT_METRICS.unmappedMinutes === null
              ? t('empty.noValue')
              : STATIC_AGENT_METRICS.unmappedMinutes.toLocaleString()
          }
        />
      </Box>

      <NewProjectDialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        onCreated={onProjectsChanged}
      />
      <NewCategoryDialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        onCreated={onCategoriesChanged}
        projects={projects}
        defaultProjectId={categoryDefaultProjectId}
      />
    </Box>
  );
}

function ProjectRow({
  project,
  categories,
  allUsers,
  canManageMembers,
  canManageCategories,
  onAddCategory,
  onDeleteCategory,
  onRenameCategory,
  onRenameProject,
  onDelete,
}: {
  project: Project;
  categories: Category[];
  allUsers: User[];
  canManageMembers: boolean;
  canManageCategories: boolean;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);

  function commitProjectRename() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== project.name) onRenameProject(project.id, trimmed);
    setEditingName(false);
  }

  const loadMembers = useCallback(async () => {
    try {
      const list = await ipc('projectMembers:list', { projectId: project.id });
      setMembers(list);
    } catch {
      // Surface errors at the page level — keep row resilient.
    }
  }, [project.id]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function handleRemoveMember(userId: string) {
    try {
      await ipc('projectMembers:remove', { projectId: project.id, userId });
      await loadMembers();
    } catch {
      /* swallow — page-level alert covers most flows */
    }
  }

  return (
    <TableRow>
      <TableCell sx={{ py: 4 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#3ddc97', mt: 1.5 }} />
          <Box>
            {editingName ? (
              <InputBase
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitProjectRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitProjectRename();
                  if (e.key === 'Escape') {
                    setNameDraft(project.name);
                    setEditingName(false);
                  }
                }}
                sx={{ fontSize: 14, fontWeight: 600 }}
              />
            ) : (
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  cursor: canManageCategories ? 'pointer' : 'default',
                  '&:hover': canManageCategories
                    ? { color: 'primary.main' }
                    : undefined,
                }}
                onClick={() => {
                  if (canManageCategories) {
                    setNameDraft(project.name);
                    setEditingName(true);
                  }
                }}
                title={canManageCategories ? 'Click to rename' : undefined}
              >
                {project.name}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              Created {new Date(project.createdAt).toLocaleDateString()}
            </Typography>
          </Box>
        </Stack>
      </TableCell>
      <TableCell>
        <Chip
          label={t('common.active').toUpperCase()}
          size="small"
          sx={{
            bgcolor: 'rgba(61, 220, 151, 0.12)',
            color: '#3ddc97',
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: '0.05em',
            borderRadius: 0.5,
          }}
        />
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <MembersDropdown
            members={members}
            onRemove={handleRemoveMember}
            canRemove={canManageMembers}
          />
          {canManageMembers && (
            <IconButton
              size="small"
              aria-label={t('team.addMember')}
              onClick={() => setMemberDialogOpen(true)}
              sx={{
                color: 'text.secondary',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <CategoriesDropdown
            categories={categories}
            onDelete={onDeleteCategory}
            onRename={onRenameCategory}
            canManage={canManageCategories}
          />
          {canManageCategories && (
            <IconButton
              size="small"
              aria-label={t('projects.addCategory')}
              onClick={onAddCategory}
              sx={{
                color: 'text.secondary',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </TableCell>
      <TableCell align="right">
        <IconButton size="small" sx={{ color: 'text.secondary' }} onClick={onDelete}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </TableCell>

      <AddMemberDialog
        open={memberDialogOpen}
        onClose={() => setMemberDialogOpen(false)}
        onAdded={loadMembers}
        projectId={project.id}
        projectName={project.name}
        allUsers={allUsers}
        members={members}
      />
    </TableRow>
  );
}

function BottomStat({
  Icon,
  label,
  value,
  hint,
}: {
  Icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <SectionCard sx={{ p: 5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3, color: 'text.secondary' }}>
        <Icon sx={{ fontSize: 18 }} />
        <Typography variant="overline">{label}</Typography>
      </Stack>
      <Typography
        sx={{ fontFamily: '"Space Grotesk"', fontWeight: 700, fontSize: 36, lineHeight: 1 }}
        className="tnum"
      >
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          {hint}
        </Typography>
      )}
    </SectionCard>
  );
}

function LoadingBlock() {
  return (
    <Stack sx={{ alignItems: 'center', py: 10 }}>
      <CircularProgress size={20} />
    </Stack>
  );
}
