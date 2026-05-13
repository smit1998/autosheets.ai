import { useState } from 'react';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import { useT } from '../../i18n/useT';
import { useCurrentUser } from '../../shared/UserContext';

export function SignUp({ onToggle }: { onToggle: () => void }) {
  const t = useT();
  const { signup } = useCurrentUser();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signup({ name: name.trim(), email: email.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <Stack spacing={4}>
        <Box>
          <Typography variant="h2" component="h1" sx={{ mb: 2 }}>
            {t('auth.signUpTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('auth.signUpSubtitle')}
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          autoFocus
          required
          fullWidth
          autoComplete="name"
          label={t('auth.nameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />

        <TextField
          required
          fullWidth
          type="email"
          autoComplete="email"
          label={t('auth.emailLabel')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
          disabled={!name.trim() || !email.trim() || submitting}
          sx={{ py: 2.5 }}
        >
          {t('auth.createAccountButton')}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {t('auth.haveAccount')}{' '}
          <Typography
            component="span"
            variant="caption"
            sx={{ color: 'primary.main', fontWeight: 600, cursor: 'pointer' }}
            onClick={onToggle}
          >
            {t('auth.signInLink')}
          </Typography>
        </Typography>
      </Stack>
    </Box>
  );
}
