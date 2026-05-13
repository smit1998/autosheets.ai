import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/CloseOutlined';

import { useT } from '../../i18n/useT';
import { PALETTE } from '../../shared/constants';
import type { ProjectMember } from '../../shared/ipc-contract';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

type Props = {
  members: ProjectMember[];
  onRemove: (userId: string) => void;
  canRemove: boolean;
};

export function MembersDropdown({ members, onRemove, canRemove }: Props) {
  const t = useT();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const count = members.length;
  const isEmpty = count === 0;

  return (
    <>
      <Button
        ref={anchorRef}
        size="small"
        variant="outlined"
        endIcon={<ArrowDropDownIcon />}
        onClick={() => !isEmpty && setOpen((v) => !v)}
        disabled={isEmpty}
        sx={{
          py: 1,
          fontSize: 12,
          fontWeight: 500,
          color: isEmpty ? 'text.secondary' : 'text.primary',
          borderColor: 'divider',
          textTransform: 'none',
        }}
      >
        {isEmpty
          ? t('team.noMembersYet')
          : `${count} ${count === 1 ? 'member' : 'members'}`}
      </Button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorEl={anchorRef.current}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 280,
              maxWidth: 360,
              maxHeight: 360,
              bgcolor: PALETTE.surfaceContainerLow,
              border: 1,
              borderColor: 'divider',
              overflow: 'auto',
            },
          },
        }}
      >
        <Stack divider={<Box sx={{ height: 1, bgcolor: 'divider' }} />}>
          {members.map((m) => (
            <Stack
              key={m.id}
              direction="row"
              spacing={2}
              sx={{
                alignItems: 'center',
                px: 3,
                py: 2,
                '&:hover': { bgcolor: PALETTE.surfaceContainer },
              }}
            >
              <Avatar
                sx={{
                  width: 24,
                  height: 24,
                  bgcolor: m.isAdmin ? 'primary.dark' : 'secondary.dark',
                  color: 'primary.contrastText',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {initials(m.name)}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {m.name}
                </Typography>
                {m.email && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {m.email}
                  </Typography>
                )}
              </Box>
              {m.isAdmin && (
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
              )}
              {canRemove && (
                <IconButton
                  size="small"
                  aria-label="remove member"
                  onClick={() => onRemove(m.id)}
                  sx={{ color: 'text.secondary' }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Stack>
          ))}
        </Stack>
      </Popover>
    </>
  );
}
