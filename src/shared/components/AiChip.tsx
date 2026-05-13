import Chip from '@mui/material/Chip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { keyframes } from '@mui/material/styles';

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(46, 91, 255, 0.45); }
  50%      { box-shadow: 0 0 0 6px rgba(46, 91, 255, 0); }
`;

type Props = {
  label: string;
  pulsing?: boolean;
  size?: 'small' | 'medium';
};

// Glass-morphic chip used throughout the app to mark AI-driven content
// (auto-mapped entries, suggestion badges, agent status). One source of
// truth so the look stays consistent.
export function AiChip({ label, pulsing, size = 'small' }: Props) {
  return (
    <Chip
      icon={<AutoAwesomeIcon sx={{ fontSize: size === 'small' ? 12 : 14 }} />}
      label={label}
      size={size}
      sx={{
        bgcolor: 'aiGlass.background',
        border: 1,
        borderColor: 'aiGlass.border',
        backdropFilter: 'blur(12px)',
        color: 'primary.main',
        fontWeight: 500,
        ...(pulsing && {
          animation: `${pulse} 2.4s ease-out infinite`,
        }),
      }}
    />
  );
}
