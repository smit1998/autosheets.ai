import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

// AI confidence indicator. Greens at high confidence, amber mid, red low.
// Returned color also semantic — consumers can read the bucket from the value.
function colorFor(value: number): string {
  if (value >= 0.85) return '#3ddc97';
  if (value >= 0.5) return '#b8c3ff';
  return '#ffb4ab';
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = colorFor(value);
  return (
    <Stack direction="row" spacing={3} sx={{ alignItems: 'center', minWidth: 140 }}>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          flex: 1,
          height: 4,
          borderRadius: 999,
          bgcolor: 'rgba(255,255,255,0.06)',
          '& .MuiLinearProgress-bar': { backgroundColor: color },
        }}
      />
      <Typography
        variant="body2"
        sx={{ minWidth: 36, color, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
      >
        {pct}%
      </Typography>
    </Stack>
  );
}
