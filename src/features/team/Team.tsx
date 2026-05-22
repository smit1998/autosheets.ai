import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';

import { PageHeader } from '../../shared/components/PageHeader';
import { SectionCard } from '../../shared/components/SectionCard';
import { EmptyState } from '../../shared/components/EmptyState';
import { useT } from '../../i18n/useT';
import { ipc } from '../../shared/ipc';
import { useAsyncData } from '../../shared/hooks';
import { useCurrentUser } from '../../shared/UserContext';
import { useNav } from '../../shared/NavContext';

import { NewMemberDialog } from './NewMemberDialog';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

export function Team() {
  const t = useT();
  const { current, refresh: refreshCurrent } = useCurrentUser();
  const { setRoute } = useNav();
  const usersQ = useAsyncData(() => ipc('users:list', undefined), []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const users = usersQ.data ?? [];
  const isAdmin = current?.isAdmin ?? false;

  function viewMemberAnalytics(id: string, name: string) {
    setRoute('analytics', { memberId: id, memberName: name });
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await ipc('users:delete', { id });
      usersQ.refetch();
      // If we deleted ourselves the seed will rotate current user — refresh.
      await refreshCurrent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Box>
      <PageHeader
        title={t('team.title')}
        subtitle={t('team.subtitle')}
        action={
          isAdmin && (
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              color="primary"
              onClick={() => setDialogOpen(true)}
            >
              {t('team.newMember')}
            </Button>
          )
        }
      />

      {!isAdmin && (
        <Alert severity="info" sx={{ mb: 4 }}>
          {t('team.inviteAdminOnly')}
        </Alert>
      )}

      {(usersQ.error || error) && (
        <Alert severity="error" sx={{ mb: 4 }} onClose={() => setError(null)}>
          {error ?? usersQ.error?.message}
        </Alert>
      )}

      <SectionCard>
        {usersQ.loading ? (
          <Stack sx={{ alignItems: 'center', py: 10 }}>
            <CircularProgress size={20} />
          </Stack>
        ) : users.length === 0 ? (
          <EmptyState Icon={GroupOutlinedIcon} title="No team members yet" />
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Joined</TableCell>
                {isAdmin && <TableCell align="right" />}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow
                  key={u.id}
                  hover={isAdmin}
                  onClick={() => isAdmin && viewMemberAnalytics(u.id, u.name)}
                  sx={{ cursor: isAdmin ? 'pointer' : 'default' }}
                >
                  <TableCell sx={{ py: 4 }}>
                    <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: u.isAdmin ? 'primary.dark' : 'secondary.dark',
                          color: 'primary.contrastText',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {initials(u.name)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {u.name}
                          {u.id === current?.id && (
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                              sx={{ ml: 2 }}
                            >
                              (you)
                            </Typography>
                          )}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {u.email ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {u.isAdmin ? (
                      <Chip
                        label={t('team.adminBadge').toUpperCase()}
                        size="small"
                        sx={{
                          bgcolor: 'rgba(184, 195, 255, 0.12)',
                          color: 'primary.main',
                          fontWeight: 600,
                          fontSize: 10,
                          letterSpacing: '0.05em',
                          borderRadius: 0.5,
                        }}
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t('team.memberRole')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  {isAdmin && (
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        sx={{ color: 'text.secondary' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(u.id);
                        }}
                        disabled={u.id === current?.id}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <NewMemberDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => usersQ.refetch()}
      />
    </Box>
  );
}
