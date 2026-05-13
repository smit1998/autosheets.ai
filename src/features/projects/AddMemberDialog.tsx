import { useEffect, useMemo, useState } from 'react';
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
import type { ProjectMember, User } from '../../shared/ipc-contract';

type Props = {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  projectId: string;
  projectName: string;
  allUsers: User[];
  members: ProjectMember[];
};

export function AddMemberDialog({
  open,
  onClose,
  onAdded,
  projectId,
  projectName,
  allUsers,
  members,
}: Props) {
  const t = useT();
  const [userId, setUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const addable = useMemo(() => allUsers.filter((u) => !memberIds.has(u.id)), [allUsers, memberIds]);

  useEffect(() => {
    if (!open) return;
    setUserId(addable[0]?.id ?? '');
    setError(null);
    setSubmitting(false);
  }, [open, addable]);

  async function handleSubmit() {
    if (!userId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await ipc('projectMembers:add', { projectId, userId });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const noUsersToAdd = addable.length === 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('team.membersOfProject', { name: projectName })}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        {noUsersToAdd ? (
          <Alert severity="info">Everyone is already a member of this project.</Alert>
        ) : (
          <TextField
            select
            fullWidth
            label={t('team.addMember')}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            sx={{ mt: 2 }}
          >
            {addable.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
                {u.isAdmin && (
                  <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 11 }}>· admin</span>
                )}
              </MenuItem>
            ))}
          </TextField>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={noUsersToAdd || !userId || submitting}
        >
          {t('team.addMember')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
