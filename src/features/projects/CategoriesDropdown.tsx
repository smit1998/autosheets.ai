import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/CloseOutlined';

import { useT } from '../../i18n/useT';
import { PALETTE } from '../../shared/constants';
import type { Category } from '../../shared/ipc-contract';

type Props = {
  categories: Category[];
  onDelete: (id: string) => void;
  canManage: boolean;
};

export function CategoriesDropdown({ categories, onDelete, canManage }: Props) {
  const t = useT();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const count = categories.length;
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
          ? t('dialogs.noCategoriesForProject')
          : `${count} ${count === 1 ? 'category' : 'categories'}`}
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
              p: 0,
              minWidth: 240,
              maxWidth: 360,
              maxHeight: 320,
              bgcolor: PALETTE.surfaceContainerLow,
              border: 1,
              borderColor: 'divider',
              overflow: 'auto',
            },
          },
        }}
      >
        <Stack divider={<Box sx={{ height: 1, bgcolor: 'divider' }} />}>
          {categories.map((c) => (
            <Stack
              key={c.id}
              direction="row"
              spacing={2}
              sx={{
                alignItems: 'center',
                px: 3,
                py: 2,
                '&:hover': { bgcolor: PALETTE.surfaceContainer },
              }}
            >
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {c.name}
              </Typography>
              {canManage && (
                <IconButton
                  size="small"
                  aria-label="delete category"
                  onClick={() => onDelete(c.id)}
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
