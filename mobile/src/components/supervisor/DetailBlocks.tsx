import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';

/** Section d'une fiche : petit titre gris puis contenu. */
export const DetailSection: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({
  title,
  children,
  right,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {right}
    </View>
    {children}
  </View>
);

type ActionProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** Bouton d'action d'une fiche (zone tactile ≥ 48 points). */
export const ActionButton: React.FC<ActionProps> = ({ label, icon, onPress, primary, disabled, accessibilityLabel }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      primary && styles.buttonPrimary,
      disabled && styles.buttonDisabled,
      pressed && { opacity: 0.75 },
    ]}
  >
    <Ionicons name={icon} size={20} color={primary ? '#fff' : theme.colors.ink} />
    <Text style={[styles.buttonLabel, primary && { color: '#fff' }]}>{label}</Text>
  </Pressable>
);

/** Ligne libellé / valeur (contact, accès). */
export const InfoLine: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; value: string; strong?: boolean }> = ({
  icon,
  label,
  value,
  strong,
}) => (
  <View style={styles.info}>
    <Ionicons name={icon} size={20} color={theme.colors.muted} />
    <View style={styles.infoText}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={[styles.infoValue, strong && styles.infoStrong]}>
        {value}
      </Text>
    </View>
  </View>
);

export const detailStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.shell,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  content: { padding: 20, gap: 22 },
  title: { fontFamily: theme.fonts.display, fontSize: 26, color: theme.colors.ink },
  muted: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  text: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.ink, lineHeight: 22 },
  bold: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowText: { flex: 1, gap: 2 },
  errorText: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    padding: 24,
  },
});

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonPrimary: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoText: { flex: 1, gap: 2 },
  infoLabel: { fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted },
  infoValue: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.ink, lineHeight: 22 },
  infoStrong: { fontFamily: theme.fonts.bodyBold, fontSize: 20, letterSpacing: 1 },
});
