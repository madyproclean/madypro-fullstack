import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/config/theme';

type Props = {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress: () => void;
  /** Élément à gauche (avatar, pastille). */
  leading?: React.ReactNode;
  /** Élément à droite (statut, compteur). */
  trailing?: React.ReactNode;
  /** Élément sous le texte (statut long qui écraserait le titre s'il était à droite). */
  below?: React.ReactNode;
  accessibilityHint?: string;
};

/** Ligne de liste sélectionnable (zone tactile ≥ 76 points), surlignée quand son détail est ouvert. */
export const ListRow: React.FC<Props> = ({ title, subtitle, selected, onPress, leading, trailing, below, accessibilityHint }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: !!selected }}
    accessibilityHint={accessibilityHint}
    onPress={onPress}
    style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
  >
    {leading}
    <View style={styles.text}>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={2} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {below ? <View style={styles.below}>{below}</View> : null}
    </View>
    {trailing}
  </Pressable>
);

export const Initials: React.FC<{ name: string; size?: number }> = ({ name, size = 44 }) => (
  <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
    <Text style={styles.avatarText}>
      {name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('')}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
  },
  selected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  pressed: { opacity: 0.8 },
  text: { flex: 1, gap: 4 },
  title: { fontFamily: theme.fonts.bodySemiBold, fontSize: 17, color: theme.colors.ink },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  below: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  avatar: {
    backgroundColor: theme.colors.cream,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: theme.fonts.bodyBold, fontSize: 15, color: theme.colors.ink },
});
