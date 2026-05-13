import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';

import { ipc } from '../../shared/ipc';
import { useT } from '../../i18n/useT';
import type { Project } from '../../shared/ipc-contract';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  projects: Project[];
  defaultProjectId?: string;
};

export function NewCategoryDialog({ open, onClose, onCreated, projects, defaultProjectId }: Props) {
  const t = useT();
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(defaultProjectId ?? projects[0]?.id ?? '');
    setName('');
    setError(null);
    setSubmitting(false);
  }, [open, defaultProjectId, projects]);

  async function handleSubmit() {
    if (!projectId || !name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await ipc('categories:create', { projectId, name: name.trim() });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const noProjects = projects.length === 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('dialogs.newCategoryTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        {noProjects ? (
          <Alert severity="info">{t('dialogs.noProjectsToCategorize')}</Alert>
        ) : (
          <>
            <TextField
              select
              fullWidth
              label={t('common.selectProject')}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              sx={{ mt: 2 }}
            >
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              autoFocus
              fullWidth
              label={t('dialogs.newCategoryName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              sx={{ mt: 4 }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={noProjects || !projectId || !name.trim() || submitting}
        >
          {t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
