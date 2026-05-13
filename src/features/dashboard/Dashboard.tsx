import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import PieChartOutlinedIcon from '@mui/icons-material/PieChartOutlined';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import StreamOutlinedIcon from '@mui/icons-material/StreamOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import { PageHeader } from '../../shared/components/PageHeader';
import { SectionCard } from '../../shared/components/SectionCard';
import { DonutChart, type DonutSlice } from '../../shared/components/DonutChart';
import { AiChip } from '../../shared/components/AiChip';
import { EmptyState } from '../../shared/components/EmptyState';
import { useT } from '../../i18n/useT';
import { PALETTE } from '../../shared/constants';
import { ipc } from '../../shared/ipc';
import { useAsyncData } from '../../shared/hooks';
import { useAgentStore } from '../../shared/stores/agent';
import type { TimeEntry } from '../../shared/ipc-contract';

// Stable color palette for donut/velocity slices, rotated by index. Keeps
// the same project the same color across renders.
const SLICE_COLORS = ['#2e5bff', '#c0c1ff', '#0074a6', '#89ceff', '#3131c0', '#3ddc97', '#ffb74d', '#434656'];

function formatMinutes(min: number): string {
  if (min <= 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatHoursDecimal(min: number): string {
  return (min / 60).toFixed(1);
}

export function Dashboard() {
  const t = useT();
  const summaryQ = useAsyncData(() => ipc('dashboard:summary', undefined), []);

  // Read individual slices from the agent store rather than the whole
  // object so unrelated changes (e.g. lastClassifyMessage updating) don't
  // re-render the rest of the Dashboard tree.
  const status = useAgentStore((s) => s.status);
  const llmHealth = useAgentStore((s) => s.llmHealth);
  const classifying = useAgentStore((s) => s.classifying);
  const agentError = useAgentStore((s) => s.error);

  // View-local: a transient "Classified N of M" / "nothing to classify"
  // notice. Kept out of the global store so it doesn't reappear stale when
  // you navigate away and back.
  const [classifyMessage, setClassifyMessage] = useState<string | null>(null);

  // Actions are stable references inside the store, so grabbing them is
  // cheap and doesn't subscribe us to state changes.
  const refreshLlmHealth = useAgentStore((s) => s.refreshLlmHealth);
  const startAgent = useAgentStore((s) => s.start);
  const stopAgent = useAgentStore((s) => s.stop);
  const classifyNow = useAgentStore((s) => s.classifyNow);
  const startStatusPolling = useAgentStore((s) => s.startStatusPolling);
  const stopStatusPolling = useAgentStore((s) => s.stopStatusPolling);
  const clearError = useAgentStore((s) => s.clearError);

  // The store owns its own status polling; we just opt in / opt out.
  useEffect(() => {
    startStatusPolling();
    void refreshLlmHealth();
    return () => stopStatusPolling();
  }, [startStatusPolling, stopStatusPolling, refreshLlmHealth]);

  const agentOn = status?.running ?? false;
  const pendingObs = status?.pendingObservations ?? 0;
  const observerError = status?.lastError ?? null;

  const toggleAgent = useCallback(
    async (next: boolean) => {
      // A stale "nothing to classify" notice shouldn't survive the agent
      // being turned on.
      setClassifyMessage(null);
      if (next) await startAgent();
      else await stopAgent();
    },
    [startAgent, stopAgent],
  );

  const handleClassifyNow = useCallback(async () => {
    setClassifyMessage(null);
    try {
      const stats = await classifyNow();
      if (stats.observations === 0) {
        setClassifyMessage(t('dashboard.noObservationsToClassify'));
      } else {
        setClassifyMessage(
          t('dashboard.classifiedSummary', {
            classified: stats.classified,
            observations: stats.observations,
            skipped: stats.skipped,
          }),
        );
        summaryQ.refetch();
      }
    } catch {
      // Error is surfaced via the store's `error` state / the alert below.
    }
  }, [classifyNow, summaryQ, t]);

  const retryProbe = useCallback(() => {
    void refreshLlmHealth();
  }, [refreshLlmHealth]);

  const summary = summaryQ.data;
  const slices: DonutSlice[] = useMemo(() => {
    if (!summary) return [];
    return summary.byProject.map((p, i) => ({
      label: p.projectName,
      value: p.minutes,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    }));
  }, [summary]);

  return (
    <Box>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        action={
          <SectionCard sx={{ p: 4, minWidth: 260 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t('dashboard.aiClassificationEngine')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, color: agentOn ? 'primary.main' : 'text.secondary' }}>
                  {agentOn ? t('dashboard.statusActiveTracking') : t('dashboard.statusPaused')}
                </Typography>
              </Box>
              <Switch
                checked={agentOn}
                disabled={llmHealth !== null && !llmHealth.ok}
                onChange={(_, v) => void toggleAgent(v)}
                slotProps={{ input: { 'aria-label': t('dashboard.aiClassificationEngine') } }}
              />
            </Stack>
          </SectionCard>
        }
      />

      {llmHealth && !llmHealth.ok && (
        <Alert
          severity="warning"
          sx={{ mb: 4 }}
          action={
            <Button size="small" onClick={retryProbe}>
              {t('dashboard.llmSetupRetry')}
            </Button>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            {t('dashboard.llmSetupTitle')}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t('dashboard.llmSetupBody')}
          </Typography>
          <Box
            component="pre"
            sx={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              m: 0,
              mt: 1,
              p: 2,
              borderRadius: 1,
              bgcolor: 'rgba(0,0,0,0.25)',
            }}
          >
            {`${t('dashboard.llmSetupInstall')}\n${t('dashboard.llmSetupPull')}`}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {llmHealth.error}
          </Typography>
        </Alert>
      )}

      {llmHealth?.ok && (
        <Stack direction="row" spacing={3} sx={{ alignItems: 'center', mb: 4, flexWrap: 'wrap' }}>
          <AiChip label={t('dashboard.llmReadyHint', { model: llmHealth.model })} />
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={
              classifying ? (
                <CircularProgress size={14} sx={{ color: 'inherit' }} />
              ) : (
                <AutoAwesomeIcon sx={{ fontSize: 14 }} />
              )
            }
            disabled={classifying}
            onClick={() => void handleClassifyNow()}
          >
            {classifying ? t('dashboard.classifying') : t('dashboard.classifyNow')}
          </Button>
          {agentOn && (
            <Typography variant="caption" color="text.secondary">
              {pendingObs} pending observation{pendingObs === 1 ? '' : 's'}
            </Typography>
          )}
          {classifyMessage && (
            <Typography variant="caption" color="text.secondary">
              {classifyMessage}
            </Typography>
          )}
        </Stack>
      )}

      {observerError && agentOn && (
        <Alert severity="warning" sx={{ mb: 4 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Observer can&apos;t read window activity
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
            {observerError}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            On macOS, grant Accessibility to Electron in System Settings → Privacy &amp; Security →
            Accessibility, then quit and reopen the app.
          </Typography>
        </Alert>
      )}

      {agentError && (
        <Alert severity="error" sx={{ mb: 4 }} onClose={clearError}>
          {agentError}
        </Alert>
      )}

      {summaryQ.error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {summaryQ.error.message}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 6,
          gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
        }}
      >
        <SectionCard
          title={t('dashboard.projectDistribution')}
          action={<PieChartOutlinedIcon sx={{ color: 'text.secondary' }} />}
        >
          {summaryQ.loading ? (
            <Loader />
          ) : slices.length === 0 ? (
            <EmptyState
              Icon={PieChartOutlinedIcon}
              title={t('empty.noActivitiesYet')}
              hint={t('empty.startTrackingHint')}
            />
          ) : (
            <ProjectDistribution slices={slices} totalMinutes={summary?.totalMinutes ?? 0} />
          )}
        </SectionCard>

        <SectionCard
          title={t('dashboard.mappingAccuracy')}
          action={<PrecisionManufacturingOutlinedIcon sx={{ color: 'text.secondary' }} />}
        >
          <MappingAccuracy summary={summary ?? null} loading={summaryQ.loading} />
        </SectionCard>

        <SectionCard
          title={t('dashboard.recentClassifications')}
          action={<AiChip label={t('dashboard.realTimeStream')} pulsing={agentOn} />}
        >
          {summaryQ.loading ? (
            <Loader />
          ) : (summary?.recentEntries.length ?? 0) === 0 ? (
            <EmptyState
              Icon={StreamOutlinedIcon}
              title={t('empty.noClassificationsYet')}
              hint={t('empty.startTrackingHint')}
            />
          ) : (
            <RecentList entries={summary!.recentEntries} />
          )}
        </SectionCard>

        <SectionCard title={t('dashboard.projectVelocity')}>
          {summaryQ.loading ? (
            <Loader />
          ) : slices.length === 0 ? (
            <EmptyState
              Icon={RocketLaunchOutlinedIcon}
              title={t('empty.noVelocityYet')}
              hint={t('empty.addFirstProject')}
            />
          ) : (
            <ProjectShareList slices={slices} totalMinutes={summary?.totalMinutes ?? 0} />
          )}
        </SectionCard>
      </Box>
    </Box>
  );
}

function ProjectDistribution({ slices, totalMinutes }: { slices: DonutSlice[]; totalMinutes: number }) {
  const t = useT();
  const top = slices.slice(0, 5);
  const restMinutes = slices.slice(5).reduce((s, x) => s + x.value, 0);
  const display: DonutSlice[] = restMinutes > 0
    ? [...top, { label: 'Other', value: restMinutes, color: SLICE_COLORS[7] }]
    : top;

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={8} sx={{ alignItems: 'center' }}>
      <DonutChart
        slices={display}
        centerLabel={t('dashboard.totalTime')}
        centerValue={formatMinutes(totalMinutes)}
      />
      <Stack spacing={3} sx={{ flex: 1, alignSelf: 'stretch' }}>
        {display.map((s) => {
          const total = totalMinutes || 1;
          const pct = Math.round((s.value / total) * 100);
          return (
            <Stack key={s.label} direction="row" sx={{ alignItems: 'center', gap: 3 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
              <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                {s.label}
              </Typography>
              <Typography variant="body2" className="tnum" color="text.secondary">
                {formatHoursDecimal(s.value)}h ({pct}%)
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}

function MappingAccuracy({
  summary,
  loading,
}: {
  summary:
    | (NonNullable<Awaited<ReturnType<typeof ipc<'dashboard:summary'>>>>)
    | null;
  loading: boolean;
}) {
  const t = useT();
  const accuracyPct =
    summary && summary.averageAgentConfidence !== null
      ? summary.averageAgentConfidence * 100
      : null;

  return (
    <>
      <Typography
        sx={{ fontFamily: '"Space Grotesk"', fontWeight: 700, fontSize: 56, lineHeight: 1, mt: 2 }}
        className="tnum"
      >
        {loading ? '…' : accuracyPct === null ? t('empty.noValue') : `${accuracyPct.toFixed(1)}%`}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {accuracyPct === null ? t('dashboard.noAgentDataYet') : t('dashboard.fromLastWeek')}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={accuracyPct ?? 0}
        sx={{
          mt: 4,
          height: 4,
          borderRadius: 999,
          bgcolor: PALETTE.surfaceContainerHigh,
          '& .MuiLinearProgress-bar': {
            background: 'linear-gradient(90deg, #b8c3ff, #2e5bff)',
          },
        }}
      />

      <Stack direction="row" spacing={3} sx={{ mt: 5 }}>
        <MiniStat
          label={t('dashboard.classified')}
          value={loading ? '…' : (summary?.totalEntries ?? 0).toLocaleString()}
          hint={t('dashboard.tasks')}
        />
        <MiniStat
          label={t('dashboard.manualReview')}
          value={loading ? '…' : (summary?.unconfirmedAgentEntries ?? 0).toLocaleString()}
          hint={t('dashboard.tasks')}
        />
      </Stack>
    </>
  );
}

function RecentList({ entries }: { entries: TimeEntry[] }) {
  const t = useT();
  return (
    <Stack divider={<Box sx={{ height: 1, bgcolor: 'divider' }} />}>
      {entries.map((e) => {
        const isAi = e.source === 'agent';
        return (
          <Stack
            key={e.id}
            direction="row"
            spacing={4}
            sx={{
              alignItems: 'center',
              py: 4,
              position: 'relative',
              pl: isAi ? 4 : 0,
              '&::before': isAi
                ? {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 16,
                    bottom: 16,
                    width: 3,
                    borderRadius: 2,
                    bgcolor: 'primary.main',
                  }
                : undefined,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                bgcolor: PALETTE.surfaceContainer,
                border: 1,
                borderColor: 'divider',
                color: 'text.secondary',
              }}
            >
              {isAi ? <LabelOutlinedIcon fontSize="small" /> : <EditNoteOutlinedIcon fontSize="small" />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {e.note ?? e.categoryName}
                </Typography>
                {isAi ? <AiChip label={t('common.autoMapped')} /> : null}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {new Date(e.startedAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {isAi ? t('dashboard.agentLabel') : t('dashboard.manualLabel')}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {e.projectName}
              </Typography>
              <Typography variant="overline" color="text.secondary">
                {t('dashboard.epic')}: {e.categoryName}
              </Typography>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}

function ProjectShareList({ slices, totalMinutes }: { slices: DonutSlice[]; totalMinutes: number }) {
  const t = useT();
  return (
    <Stack spacing={5}>
      {slices.slice(0, 6).map((s) => {
        const pct = totalMinutes ? (s.value / totalMinutes) * 100 : 0;
        return (
          <Box key={s.label}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="overline" color="text.secondary" noWrap>
                {s.label}
              </Typography>
              <Typography variant="overline" color="text.primary" className="tnum">
                {formatHoursDecimal(s.value)}h · {Math.round(pct)}% {t('dashboard.share')}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{
                height: 4,
                borderRadius: 999,
                bgcolor: PALETTE.surfaceContainerHigh,
                '& .MuiLinearProgress-bar': {
                  backgroundColor: s.color,
                },
              }}
            />
          </Box>
        );
      })}
    </Stack>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Box
      sx={{
        flex: 1,
        p: 3,
        borderRadius: 1.5,
        bgcolor: PALETTE.surfaceContainer,
        border: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
        <span className="tnum">{value}</span> <span style={{ opacity: 0.6 }}>{hint}</span>
      </Typography>
    </Box>
  );
}

function Loader() {
  return (
    <Stack sx={{ alignItems: 'center', py: 10 }}>
      <CircularProgress size={20} />
    </Stack>
  );
}
