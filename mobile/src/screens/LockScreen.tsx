import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useI18n } from '@/i18n';

/** Application verrouillée : déverrouillage par empreinte ou visage, ou déconnexion. */
export default function LockScreen() {
  const { user, unlock, logout } = useAuthContext();
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  const tryUnlock = async () => {
    setFailed(false);
    const ok = await unlock();
    if (!ok) setFailed(true);
  };

  useEffect(() => {
    tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      <Ionicons name="finger-print-outline" size={72} color={theme.colors.primary} />
      <Text style={styles.title}>{t('lock.title')}</Text>
      <Text style={styles.text}>{t('lock.hello', { name: user?.name?.split(' ')[0] ?? '' })}</Text>
      {failed ? <Text style={styles.error}>{t('lock.failed')}</Text> : null}
      <Pressable accessibilityRole="button" onPress={tryUnlock} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}>
        <Text style={styles.primaryText}>{t('lock.unlock')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={logout} style={styles.ghost}>
        <Text style={styles.ghostText}>{t('lock.logout')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.ink },
  text: { fontSize: 16, color: theme.colors.muted, textAlign: 'center' },
  error: { fontSize: 15, color: theme.colors.status.absent, textAlign: 'center' },
  primary: { minHeight: 52, paddingHorizontal: 28, borderRadius: 16, backgroundColor: theme.colors.primary, justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  ghost: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20 },
  ghostText: { color: theme.colors.primaryDark, fontSize: 16, fontWeight: '600' },
});
