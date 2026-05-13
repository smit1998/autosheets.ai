import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';

import { ipc } from '../../shared/ipc';
import { useT } from '../../i18n/useT';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function NewEmployeeDialog({ open, onClose, onCreated }: Props) {
  const t = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setEmail('');
    setIsAdmin(false);
    setError(null);
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await ipc('users:create', {
        name: name.trim(),
        email: email.trim(),
        isAdmin,
      });
      reset();
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>{t('dialogs.newEmployeeTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          label={t('dialogs.employeeName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          sx={{ mt: 2 }}
        />
        <TextField
          required
          fullWidth
          type="email"
          label={t('dialogs.employeeEmail')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mt: 4 }}
        />
        <FormControlLabel
          control={<Switch checked={isAdmin} onChange={(_, v) => setIsAdmin(v)} />}
          label={t('dialogs.isAdmin')}
          sx={{ mt: 3 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={!name.trim() || !email.trim() || submitting}
        >
          {t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
