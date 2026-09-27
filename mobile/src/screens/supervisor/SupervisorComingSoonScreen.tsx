import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';

type Props = { title: string; description: string; icon: keyof typeof Ionicons.glyphMap };

/** Rubrique pas encore livrée sur la tablette : renvoie vers l'espace superviseur web. */
export const SupervisorComingSoonScreen: React.FC<Props> = ({ title, description, icon }) => (
  <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>
      {title}
    </Text>
    <View style={styles.card}>
      <Ionicons name={icon} size={40} color={theme.colors.primaryDark} />
      <Text style={styles.heading}>Bientôt sur la tablette</Text>
      <Text style={styles.text}>{description}</Text>
      <Text style={styles.text}>En attendant, cette rubrique reste disponible dans l'espace superviseur web.</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 32, gap: 24 },
  title: { fontFamily: theme.fonts.display, fontSize: 32, color: theme.colors.ink },
  card: {
    backgroundColor: theme.colors.shell,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    maxWidth: 560,
    alignSelf: 'center',
    marginTop: 40,
  },
  heading: { fontFamily: theme.fonts.bodyBold, fontSize: 20, color: theme.colors.ink },
  text: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted, textAlign: 'center', lineHeight: 22 },
});
