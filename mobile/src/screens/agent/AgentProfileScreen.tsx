import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { theme } from '@/config/theme';
import { HeaderLayout } from '@/components/layout/HeaderLayout';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AgentStackParamList } from '@/navigation/types';
import { LANG_LABELS, Lang, useI18n } from '@/i18n';
import { biometricLock } from '@/services/biometricLock';
import { MonthSummaryCard } from '@/components/agent/MonthSummaryCard';
import { Pressable } from 'react-native';

export default function AgentProfileScreen() {
  const { user, logout } = useAuthContext();
  const { showToast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<AgentStackParamList>>();
  const { t, lang, setLang } = useI18n();
  const [biometricAvailable, setBiometricAvailable] = React.useState(false);
  const [biometricEnabled, setBiometricEnabled] = React.useState(false);

  React.useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotificationsEnabled(status === 'granted');
    });
    biometricLock.isAvailable().then(setBiometricAvailable);
    biometricLock.isEnabled().then(setBiometricEnabled);
  }, []);

  const toggleBiometric = async (value: boolean) => {
    if (value) {
      // On vérifie d'abord que l'empreinte ou le visage fonctionne, pour ne pas bloquer l'agent.
      const ok = await biometricLock.authenticate(t('profile.biometric'));
      if (!ok) return;
    }
    await biometricLock.setEnabled(value);
    setBiometricEnabled(value);
  };

  const toggleNotifications = async (value: boolean) => {
    if (!value) {
      setNotificationsEnabled(false);
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      showToast('Permission requise', 'Activez les notifications dans les réglages système.', 'error');
      setNotificationsEnabled(false);
      return;
    }
    setNotificationsEnabled(true);
  };

  return (
    <HeaderLayout
      title={t('profile.title')}
      subtitle={t('profile.subtitle')}
      accent="Compte"
      contentStyle={styles.profileContent}
      trailing={<Ionicons name="person-circle-outline" size={32} color={theme.colors.primary} />}
    >
      <MonthSummaryCard />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.personal')}</Text>
        <InfoRow label={t('profile.name')} value={user?.name ?? 'Agent'} />
        <InfoRow label={t('profile.email')} value={user?.email ?? '—'} />
        <InfoRow label={t('profile.phone')} value={user?.phone ?? t('profile.notSet')} />
        <InfoRow label={t('profile.role')} value={user?.role ?? 'Agent'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
        <View style={styles.langRow}>
          {(Object.keys(LANG_LABELS) as Lang[]).map((code) => (
            <Pressable
              key={code}
              accessibilityRole="radio"
              accessibilityState={{ checked: lang === code }}
              onPress={() => setLang(code)}
              style={[styles.langChip, lang === code && styles.langChipOn]}
            >
              <Text style={[styles.langText, lang === code && styles.langTextOn]}>{LANG_LABELS[code]}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.settings')}</Text>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>{t('profile.push')}</Text>
            <Text style={styles.meta}>{t('profile.pushHint')}</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ false: '#d0c7be', true: theme.colors.primarySoft }}
            thumbColor={notificationsEnabled ? theme.colors.primary : '#f4f3f4'}
          />
        </View>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>{t('profile.biometric')}</Text>
            <Text style={styles.meta}>{biometricAvailable ? t('profile.biometricHint') : t('profile.biometricMissing')}</Text>
          </View>
          <Switch
            value={biometricEnabled}
            disabled={!biometricAvailable}
            onValueChange={toggleBiometric}
            trackColor={{ false: '#d0c7be', true: theme.colors.primarySoft }}
            thumbColor={biometricEnabled ? theme.colors.primary : '#f4f3f4'}
          />
        </View>
        <Button
          title={t('profile.syncQueue')}
          variant="ghost"
          icon="chevron-forward"
          iconPosition="right"
          onPress={() => navigation.navigate('AgentSyncQueue')}
        />
        <Button
          title={t('profile.availability')}
          variant="ghost"
          icon="chevron-forward"
          iconPosition="right"
          onPress={() => navigation.navigate('AgentAvailability')}
        />
        <Button
          title={t('profile.chat')}
          variant="ghost"
          icon="chevron-forward"
          iconPosition="right"
          onPress={() => navigation.navigate('AgentChat')}
        />
        <Button
          title={t('profile.inventory')}
          variant="ghost"
          icon="chevron-forward"
          iconPosition="right"
          onPress={() => navigation.navigate('AgentInventoryScanner')}
        />
        <Button
          title={t('profile.password')}
          variant="ghost"
          icon="chevron-forward"
          iconPosition="right"
          onPress={() => navigation.navigate('AgentChangePassword')}
        />
      </View>

      <Button
        title={t('profile.logout')}
        icon="log-out-outline"
        onPress={() => {
          logout();
        }}
      />
    </HeaderLayout>
  );
}

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  profileContent: {
    flexGrow: 1,
    gap: theme.spacing.lg,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  infoValue: {
    color: theme.colors.ink,
    fontWeight: '600',
  },
  meta: {
    color: theme.colors.muted,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  settingLabel: {
    fontWeight: '600',
  },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
  },
  langChipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  langText: { color: theme.colors.ink, fontWeight: '600' },
  langTextOn: { color: '#fff' },
});
