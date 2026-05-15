import { memo, useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import { PageHeader } from '../../shared/components/PageHeader';
import { SectionCard } from '../../shared/components/SectionCard';
import { useT } from '../../i18n/useT';
import { PALETTE } from '../../shared/constants';
import { ipc } from '../../shared/ipc';
import type { Category, Project, WeekGrid, WeekGridRow } from '../../shared/ipc-contract';

// ── date helpers (all local-time, matching the backend's localtime grouping)

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Monday of the week containing `d`.
function mondayOf(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0 = Sun, 1 = Mon, …
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return isoDate(copy);
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function formatDayHeader(iso: string): { dow: string; dm: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    dow: d.toLocaleDateString(undefined, { weekday: 'short' }),
    dm: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

function isToday(iso: string): boolean {
  return iso === isoDate(new Date());
}

// ── duration formatting / parsing

function formatSeconds(seconds: number): string {
  if (seconds <= 0) return '';
  const totalMin = Math.round(seconds / 60);
  // Anything that rounds to 0 minutes is sub-minute noise — render an empty
  // cell rather than a literal "0m".
  if (totalMin === 0) return '';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatHoursTotal(seconds: number): string {
  return formatSeconds(seconds) || '0h';
}

// Accepts: "" / "0", decimal hours ("2", "2.5", ".5"), "Hh Mm" ("1h 30m",
// "1h30m", "2h"), "Mm" ("45m"), or "H:MM" ("1:30"). Returns seconds, or null
// if it can't be parsed.
function parseHoursInput(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === '' || s === '0') return 0;

  // H:MM
  const colon = /^(\d+):([0-5]?\d)$/.exec(s);
  if (colon) return Number(colon[1]) * 3600 + Number(colon[2]) * 60;

  // Hh Mm  (either part optional, but at least one present)
  const hm = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(s);
  if (hm && (hm[1] !== undefined || hm[2] !== undefined)) {
    const hours = hm[1] !== undefined ? Number(hm[1]) : 0;
    const mins = hm[2] !== undefined ? Number(hm[2]) : 0;
    if (Number.isFinite(hours) && Number.isFinite(mins)) {
      return Math.round(hours * 3600 + mins * 60);
    }
  }

  // Plain decimal hours
  const dec = /^\d*\.?\d+$/.exec(s);
  if (dec) {
    const hours = Number(s);
    if (Number.isFinite(hours)) return Math.round(hours * 3600);
  }

  return null;
}

// ── component

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_CATEGORIES: Category[] = [];

type DraftRow = { key: string; projectId: string; categoryId: string };

export function Timesheets() {
  const t = useT();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const gridQ = useQuery({
    queryKey: ['weekGrid', weekStart],
    queryFn: () => ipc('timeEntries:weekGrid', { weekStart }),
  });
  const projectsQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => ipc('projects:list', undefined),
  });
  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: () => ipc('categories:list', undefined),
  });

  const projects = projectsQ.data ?? EMPTY_PROJECTS;
  const categories = categoriesQ.data ?? EMPTY_CATEGORIES;
  const grid: WeekGrid | undefined = gridQ.data;
  const days = grid?.days ?? Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));

  const setCell = useMutation({
    mutationFn: (input: {
      projectId: string;
      categoryId: string;
      date: string;
      durationSeconds: number;
    }) => ipc('timeEntries:setCell', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['weekGrid', weekStart] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  // Real rows from the server, plus any draft rows the user added that don't
  // yet correspond to a real row (deduped by project|category).
  const realRows = grid?.rows ?? [];
  const realKeys = useMemo(
    () => new Set(realRows.map((r) => `${r.projectId}|${r.categoryId}`)),
    [realRows],
  );
  const visibleDrafts = draftRows.filter(
    (d) => !(d.projectId && d.categoryId && realKeys.has(`${d.projectId}|${d.categoryId}`)),
  );

  const dayTotals = useMemo(() => {
    const totals = Array.from({ length: 7 }, () => 0);
    for (const r of realRows) r.cells.forEach((s, i) => (totals[i] += s));
    return totals;
  }, [realRows]);
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);

  const goToWeek = useCallback((next: string) => {
    setWeekStart(next);
    setDraftRows([]);
    setError(null);
  }, []);

  const handleAddRow = useCallback(() => {
    setDraftRows((rows) => [
      ...rows,
      { key: `draft-${crypto.randomUUID()}`, projectId: '', categoryId: '' },
    ]);
  }, []);

  const updateDraft = useCallback((key: string, patch: Partial<DraftRow>) => {
    setDraftRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch, ...(patch.projectId ? { categoryId: '' } : {}) } : r)),
    );
  }, []);

  const removeDraft = useCallback((key: string) => {
    setDraftRows((rows) => rows.filter((r) => r.key !== key));
  }, []);

  const saveCell = useCallback(
    (projectId: string, categoryId: string, dayIdx: number, durationSeconds: number) => {
      if (!projectId || !categoryId) return;
      setError(null);
      setCell.mutate({ projectId, categoryId, date: days[dayIdx], durationSeconds });
    },
    [days, setCell],
  );

  // Clear a real row's whole week (set all 7 cells to 0).
  const clearRow = useCallback(
    (row: WeekGridRow) => {
      setError(null);
      row.cells.forEach((seconds, i) => {
        if (seconds > 0) {
          setCell.mutate({
            projectId: row.projectId,
            categoryId: row.categoryId,
            date: days[i],
            durationSeconds: 0,
          });
        }
      });
    },
    [days, setCell],
  );

  const noProjects = !projectsQ.isPending && projects.length === 0;
  const weekRangeLabel = t('timesheets.weekRange', {
    start: new Date(`${days[0]}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    end: new Date(`${days[6]}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  });

  return (
    <Box>
      <PageHeader
        title={t('timesheets.title')}
        subtitle={t('timesheets.subtitle')}
        action={
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => goToWeek(mondayOf(new Date()))}
              disabled={weekStart === mondayOf(new Date())}
            >
              {t('timesheets.thisWeek')}
            </Button>
            <Stack
              direction="row"
              sx={{
                alignItems: 'center',
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
                bgcolor: PALETTE.surfaceContainer,
              }}
            >
              <IconButton
                size="small"
                aria-label={t('timesheets.prevWeek')}
                onClick={() => goToWeek(addDaysIso(weekStart, -7))}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
              <Typography variant="body2" sx={{ px: 2, minWidth: 170, textAlign: 'center' }}>
                {weekRangeLabel}
              </Typography>
              <IconButton
                size="small"
                aria-label={t('timesheets.nextWeek')}
                onClick={() => goToWeek(addDaysIso(weekStart, 7))}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        }
      />

      {(error || gridQ.error) && (
        <Alert severity="error" sx={{ mb: 4 }} onClose={() => setError(null)}>
          {error ?? gridQ.error?.message}
        </Alert>
      )}

      {noProjects && (
        <Alert severity="info" sx={{ mb: 4 }}>
          {t('timesheets.noProjectsHint')}
        </Alert>
      )}

      <SectionCard sx={{ p: 0, overflowX: 'auto' }}>
        {gridQ.isPending ? (
          <Stack sx={{ alignItems: 'center', py: 10 }}>
            <CircularProgress size={20} />
          </Stack>
        ) : (
          <Box sx={{ minWidth: 920 }}>
            {/* Header */}
            <GridRow header>
              <HeadCell>{t('timesheets.columnProject')}</HeadCell>
              <HeadCell>{t('timesheets.columnCategory')}</HeadCell>
              {days.map((d) => {
                const { dow, dm } = formatDayHeader(d);
                return (
                  <HeadCell key={d} center highlight={isToday(d)}>
                    <Box sx={{ fontWeight: 700 }}>{dow}</Box>
                    <Box sx={{ fontSize: 11, opacity: 0.7 }}>{dm}</Box>
                  </HeadCell>
                );
              })}
              <HeadCell center>{t('timesheets.rowTotal')}</HeadCell>
              <Box />
            </GridRow>

            {/* Real rows */}
            {realRows.map((row) => (
              <RealRow
                key={`${row.projectId}|${row.categoryId}`}
                row={row}
                onSaveCell={(dayIdx, seconds) =>
                  saveCell(row.projectId, row.categoryId, dayIdx, seconds)
                }
                onClear={() => clearRow(row)}
              />
            ))}

            {/* Draft rows (project/category not yet committed via a cell edit) */}
            {visibleDrafts.map((draft) => (
              <DraftRowEl
                key={draft.key}
                draft={draft}
                projects={projects}
                categories={categories}
                onChangeProject={(projectId) => updateDraft(draft.key, { projectId })}
                onChangeCategory={(categoryId) => updateDraft(draft.key, { categoryId })}
                onSaveCell={(dayIdx, seconds) =>
                  saveCell(draft.projectId, draft.categoryId, dayIdx, seconds)
                }
                onRemove={() => removeDraft(draft.key)}
              />
            ))}

            {realRows.length === 0 && visibleDrafts.length === 0 && (
              <Box sx={{ px: 6, py: 6, color: 'text.secondary' }}>
                <Typography variant="body2">{t('timesheets.noRowsHint')}</Typography>
              </Box>
            )}

            {/* Footer: day totals */}
            <GridRow footer>
              <FootCell />
              <FootCell sx={{ textAlign: 'right', pr: 3, color: 'text.secondary' }}>
                {t('timesheets.dayTotal')}
              </FootCell>
              {dayTotals.map((s, i) => (
                <FootCell key={i} center>
                  {formatHoursTotal(s)}
                </FootCell>
              ))}
              <FootCell center sx={{ fontWeight: 700, color: 'primary.main' }}>
                {formatHoursTotal(weekTotal)}
              </FootCell>
              <Box />
            </GridRow>
          </Box>
        )}

        <Box sx={{ px: 6, py: 4, borderTop: 1, borderColor: 'divider' }}>
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            size="small"
            onClick={handleAddRow}
            disabled={noProjects}
          >
            {t('timesheets.addRow')}
          </Button>
          {setCell.isPending && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 3 }}>
              <CircularProgress size={10} sx={{ mr: 1 }} />
              {t('common.loading')}
            </Typography>
          )}
        </Box>
      </SectionCard>
    </Box>
  );
}

// ── layout primitives ─────────────────────────────────────────────────────

const GRID_TEMPLATE = '180px 160px repeat(7, 1fr) 96px 44px';

function GridRow({
  children,
  header,
  footer,
}: {
  children: React.ReactNode;
  header?: boolean;
  footer?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        alignItems: 'stretch',
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: header
          ? PALETTE.surfaceContainer
          : footer
            ? PALETTE.surfaceContainerLow
            : 'transparent',
        '&:hover': header || footer ? undefined : { bgcolor: 'rgba(255,255,255,0.02)' },
      }}
    >
      {children}
    </Box>
  );
}

function HeadCell({
  children,
  center,
  highlight,
}: {
  children?: React.ReactNode;
  center?: boolean;
  highlight?: boolean;
}) {
  return (
    <Box
      sx={{
        px: 3,
        py: 2.5,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: highlight ? 'primary.main' : 'text.secondary',
        textAlign: center ? 'center' : 'left',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: center ? 'center' : 'flex-start',
      }}
    >
      {children}
    </Box>
  );
}

function FootCell({
  children,
  center,
  sx,
}: {
  children?: React.ReactNode;
  center?: boolean;
  sx?: object;
}) {
  return (
    <Box
      sx={{
        px: 3,
        py: 2.5,
        fontSize: 13,
        fontWeight: 600,
        textAlign: center ? 'center' : 'left',
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: center ? 'center' : 'flex-start',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function LabelCell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        px: 3,
        py: 3,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
        {children}
      </Typography>
    </Box>
  );
}

// ── editable hours cell ────────────────────────────────────────────────────

type HoursCellProps = {
  seconds: number;
  agentSuggested?: boolean;
  disabled?: boolean;
  onCommit: (seconds: number) => void;
};

// Uncontrolled input keyed by its current value: when the grid refetches with
// a new value, React remounts the input with the fresh defaultValue. While
// the user types, the input owns its own state.
const HoursCell = memo(function HoursCell({
  seconds,
  agentSuggested,
  disabled,
  onCommit,
}: HoursCellProps) {
  const t = useT();
  const display = formatSeconds(seconds);

  function commit(el: HTMLInputElement | HTMLTextAreaElement) {
    const parsed = parseHoursInput(el.value);
    if (parsed === null) {
      // Bad input — snap back to the last good value.
      el.value = display;
      return;
    }
    if (parsed === seconds) {
      el.value = display; // normalise formatting, no write
      return;
    }
    onCommit(parsed);
  }

  return (
    <Box
      sx={{
        position: 'relative',
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: agentSuggested ? 'rgba(46, 91, 255, 0.06)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {agentSuggested && (
        <Tooltip title={t('timesheets.aiCellTooltip')}>
          <AutoAwesomeIcon
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              fontSize: 11,
              color: 'primary.main',
              opacity: 0.8,
            }}
          />
        </Tooltip>
      )}
      <InputBase
        key={`${display}`}
        defaultValue={display}
        disabled={disabled}
        placeholder={disabled ? '' : '·'}
        inputProps={{
          'aria-label': t('timesheets.cellHint'),
          style: { textAlign: 'center' },
        }}
        sx={{
          width: '100%',
          px: 2,
          py: 3,
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          color: 'text.primary',
          '& input': { textAlign: 'center' },
          '& input::placeholder': { opacity: 0.3 },
        }}
        onKeyDown={(e) => {
          const el = e.target as HTMLInputElement | HTMLTextAreaElement;
          if (e.key === 'Enter') {
            el.blur();
          } else if (e.key === 'Escape') {
            el.value = display;
            el.blur();
          }
        }}
        onBlur={(e) => commit(e.target)}
      />
    </Box>
  );
});

// ── rows ───────────────────────────────────────────────────────────────────

const RealRow = memo(function RealRow({
  row,
  onSaveCell,
  onClear,
}: {
  row: WeekGridRow;
  onSaveCell: (dayIdx: number, seconds: number) => void;
  onClear: () => void;
}) {
  const t = useT();
  const rowTotal = row.cells.reduce((a, b) => a + b, 0);
  return (
    <GridRow>
      <LabelCell>{row.projectName}</LabelCell>
      <LabelCell>{row.categoryName}</LabelCell>
      {row.cells.map((seconds, i) => (
        <HoursCell
          key={i}
          seconds={seconds}
          agentSuggested={row.agentCells[i]}
          onCommit={(s) => onSaveCell(i, s)}
        />
      ))}
      <Box
        sx={{
          px: 3,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatHoursTotal(rowTotal)}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Tooltip title={t('timesheets.removeRow')}>
          <IconButton size="small" sx={{ color: 'text.secondary' }} onClick={onClear}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </GridRow>
  );
});

function DraftRowEl({
  draft,
  projects,
  categories,
  onChangeProject,
  onChangeCategory,
  onSaveCell,
  onRemove,
}: {
  draft: DraftRow;
  projects: Project[];
  categories: Category[];
  onChangeProject: (projectId: string) => void;
  onChangeCategory: (categoryId: string) => void;
  onSaveCell: (dayIdx: number, seconds: number) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const projectCategories = categories.filter((c) => c.projectId === draft.projectId);
  const ready = Boolean(draft.projectId && draft.categoryId);
  return (
    <GridRow>
      <Box sx={{ px: 2, py: 2, borderRight: 1, borderColor: 'divider' }}>
        <TextField
          select
          size="small"
          fullWidth
          variant="standard"
          value={draft.projectId}
          onChange={(e) => onChangeProject(e.target.value)}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="" disabled>
            <Typography variant="caption" color="text.secondary">
              {t('timesheets.selectProject')}
            </Typography>
          </MenuItem>
          {projects.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ px: 2, py: 2, borderRight: 1, borderColor: 'divider' }}>
        <TextField
          select
          size="small"
          fullWidth
          variant="standard"
          value={draft.categoryId}
          disabled={!draft.projectId}
          onChange={(e) => onChangeCategory(e.target.value)}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="" disabled>
            <Typography variant="caption" color="text.secondary">
              {t('timesheets.selectCategory')}
            </Typography>
          </MenuItem>
          {projectCategories.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      {Array.from({ length: 7 }, (_, i) => (
        <HoursCell key={i} seconds={0} disabled={!ready} onCommit={(s) => onSaveCell(i, s)} />
      ))}
      <Box
        sx={{
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          color: 'text.secondary',
        }}
      >
        —
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconButton size="small" sx={{ color: 'text.secondary' }} onClick={onRemove}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>
    </GridRow>
  );
}
