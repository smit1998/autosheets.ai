import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useT, type TKey } from '../../i18n/useT';

export function Placeholder({ titleKey }: { titleKey: TKey }) {
  const t = useT();
  return (
    <Box sx={{ py: 12 }}>
      <Typography variant="h2">{t(titleKey)}</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
        Coming soon.
      </Typography>
    </Box>
  );
}
