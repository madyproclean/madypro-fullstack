import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useLayout } from '@/hooks/useLayout';

type Props = {
  title: string;
  subtitle?: string;
  /** Heure de dernière mise à jour affichée à droite ("HH:mm"). */
  updatedAt?: string | null;
  onRefresh?: () => void;
  /** Contrôles supplémentaires à droite (filtres, sélecteur jour/semaine). */
  right?: React.ReactNode;
};

/** En-tête commun des rubriques superviseur : titre, sous-titre, heure de mise à jour, actualiser. */
export const ScreenHeader: React.FC<Props> = ({ title, subtitle, updatedAt, onRefresh, right }) => {
  const { isWide } = useLayout();
  return (
    <View style={[styles.header, !isWide && styles.stacked]}>
      <View style={styles.text}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actions}>
        {right}
        {updatedAt ? <Text style={styles.updated}>Mis à jour à {updatedAt}</Text> : null}
        {onRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualiser"
            onPress={onRefresh}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="refresh" size={20} color={theme.colors.ink} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  text: { gap: 4, flexShrink: 1 },
  title: { fontFamily: theme.fonts.display, fontSize: 32, color: theme.colors.ink },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  updated: { fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
