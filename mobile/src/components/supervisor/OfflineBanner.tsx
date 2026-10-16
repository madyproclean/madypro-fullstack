import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useOnline } from '@/hooks/useOnline';

/** Bandeau affiché tant que la tablette est sans réseau : lecture seule, actions refusées. */
export const OfflineBanner: React.FC = () => {
  const online = useOnline();
  if (online) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={22} color={theme.colors.ink} />
      <Text style={styles.text}>
        Hors ligne : vous voyez les dernières informations enregistrées. Validations, demandes et messages
        seront possibles au retour du réseau.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: theme.colors.status.lateSoft,
  },
  text: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 16, color: theme.colors.ink, lineHeight: 22 },
});
