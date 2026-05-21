import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';

import { useT } from '../../i18n/useT';
import { PALETTE } from '../constants';
import { useCurrentUser } from '../UserContext';
import { useThemeMode, type ThemePreference } from '../ThemeModeContext';
import { useAgentStore } from '../stores/agent';
import { useNav } from '../NavContext';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');
}

export function TopBar() {
  const t = useT();
  const { current, logout } = useCurrentUser();
  const { preference, setPreference } = useThemeMode();
  const { setRoute } = useNav();
  const classifying = useAgentStore((s) => s.classifying);
  const lastClassifyResult = useAgentStore((s) => s.lastClassifyResult);
  const clearLastClassifyResult = useAgentStore((s) => s.clearLastClassifyResult);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const nextPreference: Record<ThemePreference, ThemePreference> = {
    light: 'dark',
    dark: 'system',
    system: 'light',
  };
  const ThemeIcon =
    preference === 'light'
      ? LightModeOutlinedIcon
      : preference === 'dark'
        ? DarkModeOutlinedIcon
        : SettingsBrightnessOutlinedIcon;
  const themeTooltip =
    preference === 'light'
      ? t('topbar.themeLight')
      : preference === 'dark'
        ? t('topbar.themeDark')
        : t('topbar.themeSystem');

  return (
    <Box
      component="header"
      sx={{
        height: 64,
        mt: 6, // 24px gap above the header (clears the macOS traffic lights and feels less cramped)
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
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
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        {classifying && (
          <Tooltip title={t('topbar.classifyingRunning')}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: 'center',
                px: 2,
                py: 1,
                borderRadius: 999,
                bgcolor: 'aiGlass.background',
                border: 1,
                borderColor: 'aiGlass.border',
                cursor: 'pointer',
              }}
              onClick={() => setRoute('dashboard')}
            >
              <CircularProgress size={12} thickness={5} sx={{ color: 'primary.main' }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {t('dashboard.classifying')}
              </Typography>
            </Stack>
          </Tooltip>
        )}
        {!classifying && lastClassifyResult && (
          <Tooltip title={t('topbar.classifyResultClickToDismiss')}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: 'center',
                px: 2,
                py: 1,
                borderRadius: 999,
                bgcolor: 'aiGlass.background',
                border: 1,
                borderColor: 'aiGlass.border',
                cursor: 'pointer',
              }}
              onClick={clearLastClassifyResult}
            >
              <AutoAwesomeOutlinedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                {lastClassifyResult.stats.observations === 0
                  ? t('topbar.classifyDoneEmpty')
                  : t('topbar.classifyDoneSummary', {
                      classified: lastClassifyResult.stats.classified,
                      observations: lastClassifyResult.stats.observations,
                    })}
              </Typography>
            </Stack>
          </Tooltip>
        )}
        <Tooltip title={themeTooltip}>
          <IconButton
            size="small"
            aria-label={themeTooltip}
            onClick={() => setPreference(nextPreference[preference])}
          >
            <ThemeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
