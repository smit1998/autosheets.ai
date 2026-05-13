import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

type Props = {
  value: number; // 0..1
  size?: number;
  thickness?: number;
};

export function CircularGauge({ value, size = 96, thickness = 8 }: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = clamped * circumference;

  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#2e5bff"
          strokeWidth={thickness}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Typography
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontFamily: '"Space Grotesk"',
          fontWeight: 700,
          fontSize: 20,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {Math.round(clamped * 100)}%
      </Typography>
    </Box>
  );
}
