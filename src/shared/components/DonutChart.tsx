import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  size?: number;
  thickness?: number;
};

// Hand-rolled SVG donut so we don't pull in a chart library for one chart.
// Track ring underneath, slices on top with rounded caps and a small gap
// so each slice looks like the design.
export function DonutChart({ slices, centerLabel, centerValue, size = 220, thickness = 22 }: Props) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const gap = 2; // px gap between slices

  let offset = 0;
  const arcs = slices.map((slice) => {
    const length = (slice.value / total) * circumference - gap;
    const arc = (
      <circle
        key={slice.label}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={slice.color}
        strokeWidth={thickness}
        strokeDasharray={`${Math.max(length, 0)} ${circumference}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    );
    offset += length + gap;
    return arc;
  });

  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {arcs}
      </svg>
      <Stack
        spacing={0.5}
        sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}
      >
        <Typography
          sx={{
            fontFamily: '"Space Grotesk"',
            fontWeight: 700,
            fontSize: 32,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {centerValue}
        </Typography>
        <Typography variant="overline" color="text.secondary">
          {centerLabel}
        </Typography>
      </Stack>
    </Box>
  );
}
