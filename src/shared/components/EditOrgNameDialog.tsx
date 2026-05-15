import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';

import { ipc } from '../ipc';
import { useT } from '../../i18n/useT';

type Props = {
  open: boolean;
  onClose: () => void;
  currentName: string | null;
};

export function EditOrgNameDialog({ open, onClose, currentName }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(currentName ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on each open so a previous draft / error doesn't bleed in.
  useEffect(() => {
    if (!open) return;
    setDraft(currentName ?? '');
    setConfirmOpen(false);
    setError(null);
  }, [open, currentName]);

  const save = useMutation({
    mutationFn: (name: string) => ipc('org:setName', { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['org'] });
      setConfirmOpen(false);
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const trimmed = draft.trim();
  const unchanged = trimmed === (currentName ?? '').trim();
  const canSave = trimmed.length > 0 && !unchanged && !save.isPending;

  function handleClose() {
    if (save.isPending) return;
    setConfirmOpen(false);
    onClose();
  }

  return (
    <>
      {/* Edit dialog: hidden while the confirmation modal is on top so the
          two don't overlap visually — the confirmation reads cleaner alone. */}
      <Dialog open={open && !confirmOpen} onClose={handleClose} fullWidth maxWidth="xs">
        <DialogTitle>{t('org.editDialogTitle')}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label={t('org.nameLabel')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) setConfirmOpen(true);
            }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 4 }}>
          <Button onClick={handleClose}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!canSave}
            onClick={() => setConfirmOpen(true)}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={open && confirmOpen}
        onClose={() => !save.isPending && setConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('org.confirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {currentName
              ? t('org.confirmFromTo', { from: currentName, to: trimmed })
              : t('org.confirmSet', { to: trimmed })}
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 3 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 4 }}>
          <Button onClick={() => setConfirmOpen(false)} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => save.mutate(trimmed)}
            disabled={save.isPending}
          >
            {save.isPending ? t('org.saving') : t('org.confirmAction')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
