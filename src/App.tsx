import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './shared/queryClient';
import { NavProvider } from './shared/NavContext';
import { UserProvider } from './shared/UserContext';
import { ThemeModeProvider } from './shared/ThemeModeContext';
import { AppLayout } from './shared/components/AppLayout';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <ThemeModeProvider>
          <NavProvider>
            <AppLayout />
          </NavProvider>
        </ThemeModeProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}

export default App;
