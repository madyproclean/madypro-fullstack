import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { agentCache } from '@/services/agentCache';
import { getMyLeaveBalance, getMyMonthSummary, LeaveBalance, MonthSummary } from '@/services/api/agentSelf.api';

/** Mes heures du mois et mes congés restants (gardés sur le téléphone pour rester visibles hors ligne). */
export const MonthSummaryCard: React.FC = () => {
  const { token, user } = useAuthContext();
  const { t } = useI18n();
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [leave, setLeave] = useState<LeaveBalance | null>(null);

  useEffect(() => {
    if (!token || !user) return;
    agentCache
      .loadWithCache(user.id, 'month-summary', () => getMyMonthSummary(token), (cached) => setSummary(cached.value))
      .then((r) => setSummary(r.value))
      .catch(() => undefined);
    agentCache
      .loadWithCache(user.id, 'leave-balance', () => getMyLeaveBalance(token, user.id))
      .then((r) => setLeave(r.value))
      .catch(() => undefined);
  }, [token, user]);

  if (!summary) return null;
  const ratio = summary.plannedHours ? Math.min(1, summary.workedHours / summary.plannedHours) : 0;
  return (
    <View style={styles.card} accessible accessibilityLabel={t('hours.title')}>
      <View style={styles.head}>
        <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.title}>{t('hours.title')}</Text>
      </View>
      <Text style={styles.big}>{t('hours.worked', { worked: summary.workedHours, planned: summary.plannedHours })}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
      <Text style={styles.meta}>{t('hours.missions', { done: summary.missionsDone, upcoming: summary.missionsUpcoming })}</Text>
      {summary.late ? <Text style={styles.meta}>{t('hours.late', { late: summary.late })}</Text> : null}
      {leave ? <Text style={styles.meta}>{t('hours.leave', { days: leave.remaining })}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: theme.radii.lg, padding: theme.spacing.xl, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: theme.colors.ink },
  big: { fontSize: 17, fontWeight: '600', color: theme.colors.ink },
  meta: { color: theme.colors.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: theme.colors.primarySoft, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: theme.colors.primary },
});
