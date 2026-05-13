import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import type { ReactNode } from 'react';
import { PALETTE } from '../constants';

type Props = {
  label: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  progress?: number; // 0..1
  icon?: ReactNode;
  accent?: 'default' | 'ai';
};

export function MetricCard({ label, value, unit, hint, progress, icon, accent = 'default' }: Props) {
  return (
    <Box
      sx={{
        p: 5,
        borderRadius: 2,
        bgcolor: accent === 'ai' ? 'aiGlass.background' : PALETTE.surfaceContainerLow,
        border: 1,
        borderColor: accent === 'ai' ? 'aiGlass.border' : 'divider',
        backdropFilter: accent === 'ai' ? 'blur(12px)' : undefined,
      }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        {icon}
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline' }}>
        <Typography
          variant="h2"
          sx={{ fontFamily: '"Space Grotesk"', fontWeight: 700, fontSize: 32, lineHeight: 1 }}
          className="tnum"
        >
          {value}
        </Typography>
        {unit && (
          <Typography variant="body2" color="text.secondary">
            {unit}
          </Typography>
        )}
      </Stack>
      {progress !== undefined && (
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(1, progress)) * 100}
          sx={{
            mt: 3,
            height: 4,
            borderRadius: 999,
            bgcolor: PALETTE.surfaceContainerHigh,
            '& .MuiLinearProgress-bar': {
              background: accent === 'ai'
                ? 'linear-gradient(90deg, #b8c3ff, #2e5bff)'
                : 'linear-gradient(90deg, #2e5bff, #124af0)',
            },
          }}
        />
      )}
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}
