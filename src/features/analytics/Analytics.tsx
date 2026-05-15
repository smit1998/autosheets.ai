import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';

import { PageHeader } from '../../shared/components/PageHeader';
import { SectionCard } from '../../shared/components/SectionCard';
import { MetricCard } from '../../shared/components/MetricCard';
import { EmptyState } from '../../shared/components/EmptyState';
import { AiChip } from '../../shared/components/AiChip';
import { useT } from '../../i18n/useT';
import { PALETTE } from '../../shared/constants';
import { ipc } from '../../shared/ipc';
import type { AnalyticsBreakdownItem, AnalyticsRange } from '../../shared/ipc-contract';

const RANGES: { value: AnalyticsRange; labelKey: 'analytics.range7' | 'analytics.range30' | 'analytics.range90' }[] = [
  { value: 'last7', labelKey: 'analytics.range7' },
  { value: 'last30', labelKey: 'analytics.range30' },
  { value: 'last90', labelKey: 'analytics.range90' },
];

// Stable palette so the same project/category keeps its color within a view.
const COLORS = ['#2e5bff', '#c0c1ff', '#0074a6', '#89ceff', '#3131c0', '#3ddc97', '#ffb74d', '#434656'];

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0h';
  const totalMin = Math.round(seconds / 60);
  // Sub-minute amounts read as "0m" which is misleading — collapse to "0h"
  // so totals are honest and per-row durations only appear when there's a
  // real minute to show.
  if (totalMin === 0) return '0h';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;
}

export function Analytics() {
  const t = useT();
  const [range, setRange] = useState<AnalyticsRange>('last30');

  const overviewQ = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => ipc('analytics:overview', { range }),
  });
  const data = overviewQ.data;

  const hasData = (data?.totalSeconds ?? 0) > 0;
  const aiShare = data && data.totalSeconds > 0 ? data.agentSeconds / data.totalSeconds : 0;

  const dailyMax = useMemo(() => {
    if (!data) return 0;
    return data.daily.reduce((m, d) => Math.max(m, d.seconds), 0);
  }, [data]);

  return (
    <Box>
      <PageHeader
        eyebrow={
          data ? (
            <Typography variant="overline" color="text.secondary">
              {data.teamWide ? t('analytics.teamScope') : t('analytics.personalScope')}
            </Typography>
          ) : undefined
        }
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
        action={
          <ButtonGroup size="small" variant="outlined">
            {RANGES.map((r) => (
              <Button
                key={r.value}
                onClick={() => setRange(r.value)}
                variant={range === r.value ? 'contained' : 'outlined'}
                color={range === r.value ? 'primary' : 'inherit'}
              >
                {t(r.labelKey)}
              </Button>
            ))}
          </ButtonGroup>
        }
      />

      {overviewQ.error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {overviewQ.error.message}
        </Alert>
      )}

      {overviewQ.isPending ? (
        <Stack sx={{ alignItems: 'center', py: 12 }}>
          <CircularProgress size={20} />
        </Stack>
      ) : !hasData ? (
        <SectionCard>
          <EmptyState
            Icon={BarChartOutlinedIcon}
            title={t('analytics.noData')}
            hint={t('analytics.noDataHint')}
          />
        </SectionCard>
      ) : (
        data && (
          <>
            <Box
              sx={{
                display: 'grid',
                gap: 6,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
                mb: 6,
              }}
            >
              <MetricCard label={t('analytics.totalTime')} value={formatDuration(data.totalSeconds)} />
              <MetricCard label={t('analytics.entriesLogged')} value={data.entryCount.toLocaleString()} />
              <MetricCard label={t('analytics.activeProjects')} value={data.activeProjectCount.toString()} />
              <MetricCard
                accent="ai"
                label={t('analytics.aiClassified')}
                value={`${Math.round(aiShare * 100)}%`}
                hint={`${formatDuration(data.agentSeconds)} ${t('analytics.ofTotal')}`}
                progress={aiShare}
              />
            </Box>

            <SectionCard
              title={t('analytics.timePerDay')}
              action={
                <Typography variant="caption" color="text.secondary">
                  {formatDateRange(data.startDate, data.endDate)}
                </Typography>
              }
              sx={{ mb: 6 }}
            >
              <DailyBars
                daily={data.daily}
                max={dailyMax}
                emptyHint={
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <TimelineOutlinedIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">{t('analytics.noData')}</Typography>
                  </Stack>
                }
              />
            </SectionCard>

            <Box
              sx={{
                display: 'grid',
                gap: 6,
                gridTemplateColumns: { xs: '1fr', md: data.teamWide ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)' },
              }}
            >
              <SectionCard title={t('analytics.byProject')}>
                <BarList
                  items={data.byProject}
                  emptyLabel={t('analytics.noProjects')}
                  Icon={FolderOutlinedIcon}
                />
              </SectionCard>
              <SectionCard title={t('analytics.byCategory')}>
                <BarList
                  items={data.byCategory}
                  emptyLabel={t('analytics.noCategories')}
                  Icon={LabelOutlinedIcon}
                />
              </SectionCard>
              {data.teamWide && (
                <SectionCard
                  title={t('analytics.byTeamMember')}
                  action={<AiChip label={t('analytics.teamScope')} />}
                >
                  <BarList
                    items={data.byUser}
                    emptyLabel={t('analytics.noMembers')}
                    Icon={GroupOutlinedIcon}
                  />
                </SectionCard>
              )}
            </Box>
          </>
        )
      )}
    </Box>
  );
}

// ── daily bar chart ───────────────────────────────────────────────────────

function DailyBars({
  daily,
  max,
  emptyHint,
}: {
  daily: { date: string; seconds: number }[];
  max: number;
  emptyHint: React.ReactNode;
}) {
  if (max <= 0) {
    return <Box sx={{ py: 4 }}>{emptyHint}</Box>;
  }
  // Show a label only every Nth bar so 30/90-day ranges don't get cramped.
  const labelEvery = daily.length <= 10 ? 1 : daily.length <= 35 ? 5 : 14;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 0.75,
          height: 180,
          minWidth: daily.length * 14,
          pt: 2,
        }}
      >
        {daily.map((d, i) => {
          const pct = max > 0 ? Math.max(d.seconds / max, d.seconds > 0 ? 0.04 : 0) : 0;
          return (
            <Tooltip key={d.date} title={`${formatDayLabel(d.date)} · ${formatDuration(d.seconds)}`}>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end',
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    height: `${pct * 100}%`,
                    minHeight: d.seconds > 0 ? 4 : 0,
                    borderRadius: 0.5,
                    background: d.seconds > 0 ? 'linear-gradient(180deg, #2e5bff, #124af0)' : 'transparent',
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{ fontSize: 9, color: 'text.secondary', whiteSpace: 'nowrap', height: 12 }}
                >
                  {i % labelEvery === 0 ? formatDayLabel(d.date) : ''}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}

// ── horizontal bar list ───────────────────────────────────────────────────

function BarList({
  items,
  emptyLabel,
  Icon,
}: {
  items: AnalyticsBreakdownItem[];
  emptyLabel: string;
  Icon: React.ElementType;
}) {
  if (items.length === 0) {
    return <EmptyState Icon={Icon} title={emptyLabel} dense />;
  }
  const max = items.reduce((m, it) => Math.max(m, it.seconds), 0) || 1;
  return (
    <Stack spacing={4}>
      {items.map((it, i) => {
        const pct = (it.seconds / max) * 100;
        const color = COLORS[i % COLORS.length];
        return (
          <Box key={it.id}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {it.label}
                </Typography>
                {it.sublabel && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {it.sublabel}
                  </Typography>
                )}
              </Box>
              <Typography variant="body2" className="tnum" color="text.secondary" sx={{ flexShrink: 0, ml: 3 }}>
                {formatDuration(it.seconds)}
              </Typography>
            </Stack>
            <Box sx={{ height: 6, borderRadius: 999, bgcolor: PALETTE.surfaceContainerHigh, overflow: 'hidden' }}>
              <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color }} />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
