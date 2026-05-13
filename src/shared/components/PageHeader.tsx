import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

type Props = {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, subtitle, action }: Props) {
  return (
    <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 8 }}>
      <Box sx={{ maxWidth: 720 }}>
        {eyebrow && <Box sx={{ mb: 2 }}>{eyebrow}</Box>}
        <Typography variant="h1" component="h1" sx={{ mb: subtitle ? 2 : 0 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body1" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}
