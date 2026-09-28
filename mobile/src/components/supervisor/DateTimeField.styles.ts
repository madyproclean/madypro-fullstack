import { StyleSheet } from 'react-native';
import { theme } from '@/config/theme';

export const fieldStyles = StyleSheet.create({
  field: { gap: 6, flex: 1, minWidth: 180 },
  label: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontFamily: theme.fonts.bodyMedium, fontSize: 16, color: theme.colors.ink },
});
