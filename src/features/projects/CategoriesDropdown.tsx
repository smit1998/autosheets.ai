import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import { useT } from '../../i18n/useT';
import { PALETTE } from '../../shared/constants';
import type { Category } from '../../shared/ipc-contract';

type Props = {
  categories: Category[];
  onDelete: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  canManage: boolean;
};

export function CategoriesDropdown({ categories, onDelete, onRename, canManage }: Props) {
  const t = useT();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!open) setEditingId(null);
  }, [open]);

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setDraft(name);
  }

  function commitEdit() {
    if (!editingId) return;
    const trimmed = draft.trim();
    const original = categories.find((c) => c.id === editingId)?.name ?? '';
    if (trimmed && trimmed !== original) onRename?.(editingId, trimmed);
    setEditingId(null);
  }

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
              {editingId === c.id ? (
                <TextField
                  size="small"
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  sx={{ flex: 1, minWidth: 0 }}
                />
              ) : (
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {c.name}
                </Typography>
              )}
              {canManage && editingId !== c.id && onRename && (
                <IconButton
                  size="small"
                  aria-label="rename category"
                  onClick={() => startEdit(c.id, c.name)}
                  sx={{ color: 'text.secondary' }}
                >
                  <EditOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
              {canManage && editingId !== c.id && (
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
