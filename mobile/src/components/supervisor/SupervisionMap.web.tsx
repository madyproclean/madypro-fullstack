import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import type { SupervisionMapProps } from './SupervisionMap';

/**
 * Prévisualisation web (développement uniquement) : react-native-maps n'a pas de rendu web.
 * La liste des agents à côté reste fonctionnelle ; la carte s'affiche sur la tablette.
 */
export const SupervisionMap: React.FC<SupervisionMapProps> = ({ sites, agents }) => (
  <View style={styles.container}>
    <Ionicons name="map-outline" size={40} color={theme.colors.primaryDark} />
    <Text style={styles.title}>Carte disponible sur la tablette</Text>
    <Text style={styles.text}>
      {sites.length} site{sites.length > 1 ? 's' : ''} · {agents.length} agent{agents.length > 1 ? 's' : ''} en mission
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#EAF0F5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: { fontFamily: theme.fonts.bodyBold, fontSize: 18, color: theme.colors.ink },
  text: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
});
