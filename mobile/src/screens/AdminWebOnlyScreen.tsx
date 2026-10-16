import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { Button } from '@/components/ui/Button';
import { useAuthContext } from '@/context/AuthContext';

/** L'application mobile sert aux agents et aux superviseurs ; l'administration se fait sur le web. */
export default function AdminWebOnlyScreen() {
  const { logout } = useAuthContext();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Ionicons name="desktop-outline" size={44} color={theme.colors.primaryDark} />
        <Text accessibilityRole="header" style={styles.title}>
          Espace administrateur sur le web
        </Text>
        <Text style={styles.text}>
          Votre compte est un compte administrateur. L'application mobile est réservée aux agents et aux
          superviseurs : connectez-vous à l'espace web pour administrer Mady Proclean.
        </Text>
        <Button label="Se déconnecter" onPress={logout} icon="log-out-outline" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: theme.colors.shell,
    borderRadius: 20,
    padding: 32,
    gap: 16,
    alignItems: 'center',
    maxWidth: 520,
    alignSelf: 'center',
  },
  title: { fontFamily: theme.fonts.display, fontSize: 26, color: theme.colors.ink, textAlign: 'center' },
  text: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted, textAlign: 'center', lineHeight: 22 },
});
