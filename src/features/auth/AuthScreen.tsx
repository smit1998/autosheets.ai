import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';

import { Login } from './Login';
import { SignUp } from './SignUp';
import { PALETTE, PRIMARY_GRADIENT } from '../../shared/constants';

type Mode = 'login' | 'signup';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 4,
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 400,
          p: 8,
          borderRadius: 2,
          bgcolor: PALETTE.surfaceContainerLow,
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Stack spacing={6}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 1.5,
              background: PRIMARY_GRADIENT,
              display: 'grid',
              placeItems: 'center',
              alignSelf: 'flex-start',
            }}
          >
            <CloudOutlinedIcon sx={{ fontSize: 24, color: '#fff' }} />
          </Box>

          {mode === 'login' ? (
            <Login onToggle={() => setMode('signup')} />
          ) : (
            <SignUp onToggle={() => setMode('login')} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}
