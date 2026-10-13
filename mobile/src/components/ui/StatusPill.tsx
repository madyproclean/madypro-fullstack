import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const TONE_STYLES: Record<StatusTone, { color: string; background: string }> = {
  success: { color: theme.colors.status.onTime, background: theme.colors.status.onTimeSoft },
  warning: { color: theme.colors.status.late, background: theme.colors.status.lateSoft },
  danger: { color: theme.colors.status.absent, background: theme.colors.status.absentSoft },
  neutral: { color: theme.colors.status.pending, background: theme.colors.status.pendingSoft },
  info: { color: theme.colors.primary, background: theme.colors.primarySoft },
};

/**
 * Texte plus foncé (contraste ≥ 5:1 sur le fond de l'étiquette), pour une lecture en extérieur
 * sur la tablette superviseur ; les couleurs d'origine restent celles de l'app agent.
 */
const STRONG_TEXT: Record<StatusTone, string> = {
  success: '#257147',
  warning: '#885916',
  danger: '#A13D33',
  neutral: '#5B635F',
  info: '#0A6BA6',
};

const TONE_ICONS: Record<StatusTone, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  warning: 'alert-circle-outline',
  danger: 'close-circle',
  neutral: 'ellipse-outline',
  info: 'information-circle-outline',
};

type StatusPillProps = {
  label: string;
  tone: StatusTone;
  /** Masque l'icône (rare — préférer la garder pour la cohérence visuelle). */
  hideIcon?: boolean;
  /** Texte plus foncé et un peu plus grand (espace superviseur). */
  strong?: boolean;
};

export const StatusPill: React.FC<StatusPillProps> = ({ label, tone, hideIcon, strong }) => {
  const toneStyle = strong ? { ...TONE_STYLES[tone], color: STRONG_TEXT[tone] } : TONE_STYLES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: toneStyle.background }]}>
      {!hideIcon && <Ionicons name={TONE_ICONS[tone]} size={strong ? 14 : 12} color={toneStyle.color} style={styles.icon} />}
      <Text style={[styles.label, strong && styles.labelStrong, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: theme.fonts.bodySemiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  labelStrong: { fontSize: 13, fontFamily: theme.fonts.bodyBold, letterSpacing: 0.6 },
});
