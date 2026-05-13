import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useNav } from '../NavContext';
import { useCurrentUser } from '../UserContext';
import { useT } from '../../i18n/useT';

import { Dashboard } from '../../features/dashboard/Dashboard';
import { Projects } from '../../features/projects/Projects';
import { Timesheets } from '../../features/timesheets/Timesheets';
import { Team } from '../../features/team/Team';
import { AuthScreen } from '../../features/auth/AuthScreen';
import { Placeholder } from './Placeholder';

export function AppLayout() {
  const { route } = useNav();
  const { current, loading } = useCurrentUser();
  const t = useT();

  if (loading && !current) {
    return (
      <Stack
        sx={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}
        spacing={3}
      >
        <CircularProgress size={20} />
        <Typography variant="caption" color="text.secondary">
          {t('auth.loadingSession')}
        </Typography>
      </Stack>
    );
  }

  if (!current) {
    return <AuthScreen />;
  }

  const searchKey =
    route === 'dashboard'
      ? ('topbar.searchActivities' as const)
      : route === 'timesheets'
        ? ('topbar.searchLogs' as const)
        : undefined;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar searchPlaceholderKey={searchKey} />
        <Box
          component="main"
          // Remount on user change so every page refetches its scoped data.
          key={current.id}
          sx={{ flex: 1, p: 8, overflowX: 'auto' }}
        >
          {route === 'dashboard' && <Dashboard />}
          {route === 'projects' && <Projects />}
          {route === 'timesheets' && <Timesheets />}
          {route === 'team' && <Team />}
          {route === 'analytics' && <Placeholder titleKey="nav.analytics" />}
        </Box>
      </Box>
    </Box>
  );
}
