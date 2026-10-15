import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useLayout } from '@/hooks/useLayout';
import { StatusPill, StatusTone } from '@/components/ui/StatusPill';
import { getSupervisorToday } from '@/services/api/supervision.api';
import { formatSavedAt, loadWithCache } from '@/services/supervisorCache';
import { OfflineBanner } from '@/components/supervisor/OfflineBanner';
import { DaySummarySheet } from '@/components/supervisor/DaySummarySheet';
import { SupervisorToday, TodayTask } from '@/types/supervision';
import { SupervisorTabParamList } from '@/navigation/types';

type Props = BottomTabScreenProps<SupervisorTabParamList, 'SupervisorToday'>;

/** Même rythme que la supervision web. */
const REFRESH_MS = 30_000;

const ABSENCE_LABELS: Record<string, string> = {
  SICK: 'Arrêt maladie',
  PAID_LEAVE: 'Congé payé',
  UNPAID: 'Congé sans solde',
  OTHER: 'Autre absence',
};

const TASK_META: Record<TodayTask['kind'], { label: string; tone: StatusTone }> = {
  UNCOVERED: { label: 'Mission sans agent', tone: 'danger' },
  LATE: { label: 'Retard', tone: 'warning' },
  TO_VALIDATE: { label: 'À valider', tone: 'info' },
  ABSENCE: { label: 'Absence', tone: 'neutral' },
};

const formatDay = (isoDate: string) => {
  const label = new Date(`${isoDate}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const formatShortDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export default function SupervisorTodayScreen({ navigation }: Props) {
  const { token, user } = useAuthContext();
  const { isWide } = useLayout();
  const [data, setData] = useState<SupervisorToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(
    async (manual = false) => {
      if (!token || inFlight.current) return;
      inFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const result = await loadWithCache(user?.id, 'today', () => getSupervisorToday(token), (cached) =>
          setData((current) => current ?? cached.value),
        );
        setData(result.value);
        setError(result.fromCache ? 'Hors ligne' : null);
      } catch (err) {
        // On garde la dernière situation affichée : l'heure de mise à jour indique son âge.
        setError(err instanceof Error ? err.message : 'Impossible de charger la situation du jour.');
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [token, user?.id],
  );

  // Rafraîchissement régulier tant que l'écran est affiché et l'app au premier plan.
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') load();
      }, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && navigation.isFocused()) load();
    });
    return () => sub.remove();
  }, [load, navigation]);

  const callAgent = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => setError("Impossible de lancer l'appel sur cet appareil."));
  };

  if (!data && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  const tasks = data?.tasks ?? [];

  const renderTaskActions = (task: TodayTask) => {
    switch (task.kind) {
      case 'LATE':
        return (
          <>
            {task.agentPhone ? (
              <ActionButton icon="call-outline" label={`Appeler ${task.agentName}`} iconOnly onPress={() => callAgent(task.agentPhone!)} />
            ) : null}
            <ActionButton
              label="Écrire"
              onPress={() => navigation.navigate('SupervisorMessages', { threadUserId: task.agentId })}
            />
          </>
        );
      case 'TO_VALIDATE':
        return (
          <ActionButton
            label="Ouvrir"
            primary
            onPress={() => navigation.navigate('SupervisorMissions', { interventionId: task.interventionId })}
          />
        );
      case 'ABSENCE':
        return (
          <ActionButton
            label="Examiner"
            onPress={() => navigation.navigate('SupervisorValidations', { absenceId: task.absenceId })}
          />
        );
      case 'UNCOVERED':
        return (
          <ActionButton
            label="Voir"
            onPress={() => navigation.navigate('SupervisorMissions', { interventionId: task.interventionId })}
          />
        );
    }
  };

  const taskText = (task: TodayTask) => {
    switch (task.kind) {
      case 'LATE':
        return { title: `${task.agentName} n'a pas démarré`, sub: `${task.siteName} · prévu à ${task.startTime}` };
      case 'TO_VALIDATE':
        return {
          title: 'Mission terminée à valider',
          sub: `${task.siteName} · ${task.startTime} – ${task.endTime} · ${task.agentCount} agent${task.agentCount > 1 ? 's' : ''}`,
        };
      case 'ABSENCE':
        return {
          title: `${task.agentName} · ${ABSENCE_LABELS[task.type] ?? 'Absence'}`,
          sub: task.from === task.to ? formatShortDate(task.from) : `Du ${formatShortDate(task.from)} au ${formatShortDate(task.to)}`,
        };
      case 'UNCOVERED':
        return { title: `${task.siteName} sans agent disponible`, sub: `Prévu à ${task.startTime} · remplaçant à trouver` };
    }
  };

  const missionRows: Array<{ label: string; value: number; tone: StatusTone }> = data
    ? [
        { label: 'En cours', value: data.missions.inProgress, tone: 'info' },
        { label: 'À venir', value: data.missions.planned, tone: 'neutral' },
        { label: 'Terminées', value: data.missions.completed, tone: 'success' },
        { label: 'À valider', value: data.missions.toValidate, tone: 'warning' },
        { label: 'Non démarrées', value: data.missions.notStarted, tone: 'danger' },
      ]
    : [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />}
    >
      <View style={[styles.header, !isWide && styles.headerStacked]}>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={styles.title}>
            Aujourd'hui
          </Text>
          {data ? (
            <Text style={styles.subtitle}>
              {formatDay(data.date)} · {data.siteCount} site{data.siteCount > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          {data ? <Text style={styles.updated}>Mis à jour à {formatSavedAt(data.generatedAt)}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowSummary(true)}
            style={({ pressed }) => [styles.summaryButton, pressed && styles.pressed]}
          >
            <Ionicons name="stats-chart-outline" size={20} color="#fff" />
            <Text style={styles.summaryLabel}>Bilan du jour</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualiser"
            onPress={() => load(true)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="refresh" size={20} color={theme.colors.ink} />
          </Pressable>
        </View>
      </View>

      <OfflineBanner />
      <DaySummarySheet
        visible={showSummary}
        onClose={() => setShowSummary(false)}
        onOpenMission={(id) => {
          setShowSummary(false);
          navigation.navigate('SupervisorMissions', { interventionId: id });
        }}
      />
      {error ? (
        <View accessibilityRole="alert" style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.status.absent} />
          <Text style={styles.errorText}>
            {data ? 'Mise à jour impossible : la situation affichée date de la dernière mise à jour.' : error}
          </Text>
          <ActionButton label="Réessayer" onPress={() => load(true)} />
        </View>
      ) : null}

      {data && data.siteCount === 0 ? (
        <View style={styles.noSites}>
          <Ionicons name="business-outline" size={22} color={theme.colors.primaryDark} />
          <Text style={styles.errorText}>
            Aucun site ne vous est encore confié : vos agents et vos missions apparaîtront ici dès que l'administrateur
            vous aura rattaché à vos sites.
          </Text>
        </View>
      ) : null}

      {data ? (
        <>
          <View style={[styles.kpis, !isWide && styles.kpisWrap]}>
            <Kpi label="Agents présents" value={data.agents.present} sub={`sur ${data.agents.expected} attendus`} color={theme.colors.status.onTime} />
            <Kpi label="En retard" value={data.agents.late} sub="non pointés après l'heure" color={theme.colors.status.late} />
            <Kpi label="Absents" value={data.agents.absent} sub="absence validée" color={theme.colors.status.absent} />
            <Kpi
              label="Missions du jour"
              value={data.missions.total}
              sub={`${data.missions.completed} terminées · ${data.missions.inProgress} en cours`}
              color={theme.colors.primaryDark}
            />
          </View>

          <View style={[styles.columns, !isWide && styles.columnsStacked]}>
            <View style={[styles.card, isWide && { flex: 3 }]}>
              <View style={styles.cardHeader}>
                <Text accessibilityRole="header" style={styles.cardTitle}>
                  À traiter
                </Text>
                {tasks.length ? <StatusPill strong label={String(tasks.length)} tone="danger" hideIcon /> : null}
              </View>
              {tasks.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="checkmark-circle-outline" size={32} color={theme.colors.status.onTime} />
                  <Text style={styles.emptyText}>Rien à traiter pour le moment.</Text>
                </View>
              ) : (
                tasks.map((task) => {
                  const meta = TASK_META[task.kind];
                  const text = taskText(task);
                  const key = task.kind === 'ABSENCE' ? task.absenceId : `${task.kind}-${task.interventionId}-${task.kind === 'LATE' ? task.agentId : ''}`;
                  return (
                    <View key={key} style={styles.task}>
                      <View style={styles.taskText}>
                        <StatusPill strong label={meta.label} tone={meta.tone} />
                        <Text style={styles.taskTitle}>{text.title}</Text>
                        <Text style={styles.taskSub}>{text.sub}</Text>
                      </View>
                      <View style={styles.taskActions}>{renderTaskActions(task)}</View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={[styles.card, isWide && { flex: 2 }]}>
              <Text accessibilityRole="header" style={styles.cardTitle}>
                Missions par statut
              </Text>
              {missionRows.map((row) => (
                <View key={row.label} style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{row.label}</Text>
                  {/* StatusPill s'aligne en haut par défaut : on la centre dans la ligne. */}
                  <View style={styles.statusValue}>
                    <StatusPill strong label={String(row.value)} tone={row.tone} hideIcon />
                  </View>
                </View>
              ))}
              <Pressable
                accessibilityRole="link"
                onPress={() => navigation.navigate('SupervisorMissions', undefined)}
                style={({ pressed }) => [styles.link, pressed && styles.pressed]}
              >
                <Text style={styles.linkText}>Voir toutes les missions</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const Kpi: React.FC<{ label: string; value: number; sub: string; color: string }> = ({ label, value, sub, color }) => (
  <View style={styles.kpi} accessible accessibilityLabel={`${label} : ${value}, ${sub}`}>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text style={[styles.kpiValue, { color }]}>{value}</Text>
    <Text style={styles.kpiSub}>{sub}</Text>
  </View>
);

const ActionButton: React.FC<{
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconOnly?: boolean;
  primary?: boolean;
}> = ({ label, onPress, icon, iconOnly, primary }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [
      styles.action,
      iconOnly && styles.actionIcon,
      primary && styles.actionPrimary,
      pressed && styles.pressed,
    ]}
  >
    {icon ? <Ionicons name={icon} size={20} color={primary ? '#fff' : theme.colors.ink} /> : null}
    {!iconOnly ? <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.cream },
  content: { padding: 32, gap: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.cream },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  headerStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  headerText: { gap: 4 },
  title: { fontFamily: theme.fonts.display, fontSize: 32, color: theme.colors.ink },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: '#fff' },
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
  pressed: { opacity: 0.7 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.status.absentSoft,
  },
  errorText: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.ink },
  noSites: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
  },
  kpis: { flexDirection: 'row', gap: 14 },
  kpisWrap: { flexWrap: 'wrap' },
  kpi: {
    flexGrow: 1,
    flexBasis: 200,
    backgroundColor: theme.colors.shell,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 6,
  },
  kpiLabel: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  kpiValue: { fontFamily: theme.fonts.display, fontSize: 40, lineHeight: 46 },
  kpiSub: { fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted },
  columns: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  columnsStacked: { flexDirection: 'column', alignItems: 'stretch' },
  card: {
    backgroundColor: theme.colors.shell,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: theme.fonts.bodyBold, fontSize: 19, color: theme.colors.ink },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
  },
  taskText: { flex: 1, gap: 6 },
  taskTitle: { fontFamily: theme.fonts.bodySemiBold, fontSize: 17, color: theme.colors.ink },
  taskSub: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  taskActions: { flexDirection: 'row', gap: 8 },
  action: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionIcon: { width: 48, paddingHorizontal: 0 },
  actionPrimary: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  actionLabel: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
  actionLabelPrimary: { color: '#fff' },
  statusRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  statusValue: { justifyContent: 'center' },
  statusLabel: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.ink },
  link: { minHeight: 48, justifyContent: 'center' },
  linkText: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.primaryDark },
});
