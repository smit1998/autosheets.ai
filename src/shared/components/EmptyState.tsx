import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  hint?: string;
  Icon?: React.ElementType;
  action?: ReactNode;
  dense?: boolean;
};

export function EmptyState({ title, hint, Icon = InboxOutlinedIcon, action, dense }: Props) {
  return (
    <Stack
      spacing={2}
      sx={{
        alignItems: 'center',
        textAlign: 'center',
        py: dense ? 6 : 10,
        px: 4,
        color: 'text.secondary',
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'rgba(255,255,255,0.04)',
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Icon sx={{ fontSize: 20 }} />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" sx={{ maxWidth: 320 }}>
          {hint}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Stack>
  );
}
