import { useI18n } from '@/i18n';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';

export type ClockCardState = 'in-progress' | 'upcoming' | 'empty';

type ClockCardProps = {
  state: ClockCardState;
  /** Libellé au-dessus de l'horloge, ex. "Mission en cours" / "Prochaine mission · dans 25 min". */
  statusLabel?: string;
  siteName?: string;
  /** Libellé secondaire, ex. "09:00 – 11:00". */
  timeRange?: string;
  ctaLabel?: string;
  onPress?: () => void;
  emptyText?: string;
};

/**
 * Carte horloge/statut façon Crewly, purement visuelle — résume la mission en
 * cours ou à venir. Le geste de pointage réel reste dans AgentInterventionScreen.
 */
export const ClockCard: React.FC<ClockCardProps> = ({
  state,
  statusLabel,
  siteName,
  timeRange,
  ctaLabel,
  onPress,
  emptyText,
}) => {
  const { t } = useI18n();
  ctaLabel = ctaLabel ?? t('home.openJob');
  emptyText = emptyText ?? t('home.noJob');
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
    if (state === 'empty') return undefined;
    const interval = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(interval);
  }, [state]);

  if (state === 'empty') {
    return (
      <View style={[styles.card, styles.cardEmpty]}>
        <Ionicons name="checkmark-done-circle-outline" size={28} color={theme.colors.primary} style={styles.emptyIcon} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  const clockLabel = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <Pressable
      style={({ pressed }) => [styles.card, state === 'in-progress' && styles.cardActive, pressed && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.header}>
        {state === 'in-progress' && <View style={styles.livedDot} />}
        <Text style={styles.statusLabel}>{statusLabel}</Text>
      </View>
      <Text style={styles.clock}>{clockLabel}</Text>
      {siteName && <Text style={styles.site}>{siteName}</Text>}
      {timeRange && <Text style={styles.timeRange}>{timeRange}</Text>}
      {onPress && (
        <View style={styles.cta}>
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.shell} />
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.xs,
  },
  cardActive: {
    backgroundColor: theme.colors.ink,
  },
  cardEmpty: {
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  pressed: {
    opacity: 0.9,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  livedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.badge.green,
  },
  statusLabel: {
    fontSize: 13,
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.badge.blueSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  clock: {
    fontSize: 40,
    fontFamily: theme.fonts.display,
    color: theme.colors.shell,
  },
  site: {
    fontSize: 16,
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.shell,
  },
  timeRange: {
    fontSize: 13,
    color: theme.colors.badge.blueSoft,
  },
  cta: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ctaLabel: {
    fontSize: 13,
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.shell,
  },
  emptyIcon: {},
  emptyText: {
    fontSize: 14,
    color: theme.colors.ink,
    textAlign: 'center',
  },
});
