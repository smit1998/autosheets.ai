import Box from '@mui/material/Box';
import type { BoxProps } from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { PALETTE } from '../constants';

type Props = BoxProps & {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  variant?: 'default' | 'ai';
};

export function SectionCard({ title, action, children, variant = 'default', sx, ...rest }: Props) {
  const isAi = variant === 'ai';
  return (
    <Box
      {...rest}
      sx={{
        p: 6,
        borderRadius: 2,
        bgcolor: isAi ? 'aiGlass.background' : PALETTE.surfaceContainerLow,
        border: 1,
        borderColor: isAi ? 'aiGlass.border' : 'divider',
        backdropFilter: isAi ? 'blur(12px)' : undefined,
        ...sx,
      }}
    >
      {(title || action) && (
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 5 }}>
          {typeof title === 'string' ? <Typography variant="h4">{title}</Typography> : title}
          {action}
        </Stack>
      )}
      {children}
    </Box>
  );
}
