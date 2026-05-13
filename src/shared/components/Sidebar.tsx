import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import HistoryIcon from '@mui/icons-material/History';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import AddIcon from '@mui/icons-material/Add';

import { useNav, type Route } from '../NavContext';
import { useT } from '../../i18n/useT';
import { PALETTE, PRIMARY_GRADIENT } from '../constants';

const SIDEBAR_WIDTH = 240;

type Item = { route: Route; labelKey: Parameters<ReturnType<typeof useT>>[0]; Icon: React.ElementType };

const NAV_ITEMS: Item[] = [
  { route: 'dashboard', labelKey: 'nav.dashboard', Icon: DashboardOutlinedIcon },
  { route: 'projects', labelKey: 'nav.projects', Icon: FolderOutlinedIcon },
  { route: 'timesheets', labelKey: 'nav.timesheets', Icon: HistoryIcon },
  { route: 'team', labelKey: 'nav.team', Icon: GroupOutlinedIcon },
  { route: 'analytics', labelKey: 'nav.analytics', Icon: BarChartOutlinedIcon },
];

export function Sidebar() {
  const { route, setRoute } = useNav();
  const t = useT();

  return (
    <Box
      component="aside"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        bgcolor: PALETTE.surfaceContainerLowest,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <Box sx={{ px: 6, py: 6 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>
          {t('app.name').toUpperCase()}
        </Typography>
      </Box>

      <Box sx={{ px: 4 }}>
        <Stack
          direction="row"
          spacing={3}
          sx={{
            alignItems: 'center',
            p: 3,
            borderRadius: 2,
            bgcolor: PALETTE.surfaceContainer,
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              background: PRIMARY_GRADIENT,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <CloudOutlinedIcon sx={{ fontSize: 20, color: '#fff' }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }} noWrap>
              {t('app.orgPlaceholder')}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Stack component="nav" spacing={1} sx={{ p: 4, mt: 2, flex: 1 }}>
        {NAV_ITEMS.map(({ route: r, labelKey, Icon }) => {
          const active = route === r;
          return (
            <Box
              key={r}
              onClick={() => setRoute(r)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                px: 3,
                py: 2.5,
                borderRadius: 1,
                cursor: 'pointer',
                color: active ? 'primary.main' : 'text.secondary',
                bgcolor: active ? PALETTE.surfaceContainer : 'transparent',
                border: 1,
                borderColor: active ? 'divider' : 'transparent',
                transition: 'background-color 120ms ease, color 120ms ease',
                '&:hover': {
                  bgcolor: PALETTE.surfaceContainerLow,
                  color: 'text.primary',
                },
              }}
            >
              <Icon sx={{ fontSize: 20 }} />
              <Typography variant="body2" sx={{ fontWeight: active ? 600 : 500 }}>
                {t(labelKey)}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      <Box sx={{ p: 4 }}>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setRoute('timesheets')}
          sx={{ py: 2.5 }}
        >
          {t('nav.logActivity')}
        </Button>
      </Box>

      <Divider />

      <Stack spacing={1} sx={{ p: 4 }}>
        <FooterLink Icon={DescriptionOutlinedIcon} label={t('nav.documentation')} />
        <FooterLink Icon={HelpOutlineOutlinedIcon} label={t('nav.support')} />
      </Stack>
    </Box>
  );
}

function FooterLink({ Icon, label }: { Icon: React.ElementType; label: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        px: 3,
        py: 2,
        borderRadius: 1,
        color: 'text.secondary',
        cursor: 'pointer',
        '&:hover': { color: 'text.primary' },
      }}
    >
      <Icon sx={{ fontSize: 18 }} />
      <Typography variant="body2">{label}</Typography>
    </Box>
  );
}

export const SIDEBAR_PX = SIDEBAR_WIDTH;
