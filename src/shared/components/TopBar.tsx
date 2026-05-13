import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import InputBase from '@mui/material/InputBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import SearchIcon from '@mui/icons-material/Search';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';

import { useT } from '../../i18n/useT';
import { PALETTE } from '../constants';
import { useCurrentUser } from '../UserContext';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

export function TopBar({
  searchPlaceholderKey,
}: {
  searchPlaceholderKey?: 'topbar.searchActivities' | 'topbar.searchLogs';
}) {
  const t = useT();
  const { current, logout } = useCurrentUser();
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Box
      component="header"
      sx={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        // Leave room on macOS for the traffic-light buttons (hiddenInset).
        pl: { xs: 6, md: 22 },
        pr: 6,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: PALETTE.background,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        // Make the bar a window-drag handle. Interactive children below
        // opt out via WebkitAppRegion: 'no-drag' so they stay clickable.
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        '& input, & button, & .MuiIconButton-root, & .MuiInputBase-root, & .MuiAvatar-root': {
          WebkitAppRegion: 'no-drag',
        },
      }}
    >
      <Box sx={{ flex: 1, maxWidth: 480 }}>
        {searchPlaceholderKey ? (
          <Stack
            direction="row"
            spacing={2}
            sx={{
              alignItems: 'center',
              px: 3,
              py: 2,
              borderRadius: 1,
              bgcolor: PALETTE.surfaceContainerLow,
              border: 1,
              borderColor: 'divider',
            }}
          >
            <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <InputBase
              placeholder={t(searchPlaceholderKey)}
              sx={{ flex: 1, fontSize: 14, color: 'text.primary' }}
            />
          </Stack>
        ) : (
          <Box />
        )}
      </Box>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <IconButton size="small" aria-label={t('topbar.notifications')}>
          <NotificationsNoneOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={t('topbar.settings')}>
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={t('topbar.help')}>
          <HelpOutlineOutlinedIcon fontSize="small" />
        </IconButton>

        <IconButton
          ref={avatarRef}
          onClick={() => setMenuOpen((v) => !v)}
          sx={{ p: 0 }}
          aria-label={current?.name ?? ''}
        >
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: 'primary.dark',
              color: 'primary.contrastText',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {current ? initials(current.name) : '?'}
          </Avatar>
        </IconButton>
      </Stack>

      <Menu
        open={menuOpen}
        anchorEl={avatarRef.current}
        onClose={() => setMenuOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 240,
              bgcolor: PALETTE.surfaceContainerLow,
              border: 1,
              borderColor: 'divider',
            },
          },
        }}
      >
        {current && (
          <Box sx={{ px: 3, py: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {current.name}
              </Typography>
              {current.isAdmin && (
                <Chip
                  label={t('team.adminBadge')}
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
            </Stack>
            {current.email && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {current.email}
              </Typography>
            )}
          </Box>
        )}
        <Divider />
        <MenuItem
          onClick={async () => {
            setMenuOpen(false);
            await logout();
          }}
          sx={{ py: 1.5 }}
        >
          <LogoutOutlinedIcon sx={{ fontSize: 18, mr: 2, color: 'text.secondary' }} />
          <Typography variant="body2">{t('auth.logout')}</Typography>
        </MenuItem>
      </Menu>
    </Box>
  );
}
