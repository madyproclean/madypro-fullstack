import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useFocusPolling } from '@/hooks/useFocusPolling';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { formatSavedAt, loadWithCache } from '@/services/supervisorCache';
import { StatusPill } from '@/components/ui/StatusPill';
import { ScreenHeader } from '@/components/supervisor/ScreenHeader';
import { ListRow } from '@/components/supervisor/ListRow';
import { Segmented } from '@/components/supervisor/Segmented';
import { SplitView } from '@/components/supervisor/SplitView';
import { MissionDetail } from '@/components/supervisor/MissionDetail';
import { MissionRequestSheet } from '@/components/supervisor/MissionRequestSheet';
import { addDays, formatDayLong, missionStatus, toISODate } from '@/components/supervisor/format';
import { fetchInterventions } from '@/services/api/interventions.api';
import { Intervention } from '@/types/intervention';
import { SupervisorTabParamList } from '@/navigation/types';

type Props = BottomTabScreenProps<SupervisorTabParamList, 'SupervisorMissions'>;
type Range = 'day' | 'week';

/** Ordre dans une journée : ce qui demande une action d'abord, puis par heure. */
const STATUS_ORDER: Record<string, number> = {
  NEEDS_REVIEW: 0,
  IN_PROGRESS: 1,
  PLANNED: 2,
  NO_SHOW: 3,
  COMPLETED: 4,
  CANCELLED: 5,
};

const RowGap = () => <View style={{ height: 10 }} />;

export default function SupervisorMissionsScreen({ route, navigation }: Props) {
  const { token, user } = useAuthContext();
  const [range, setRange] = useState<Range>('day');
  const [missions, setMissions] = useState<Intervention[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const inFlight = useRef(false);

  // Ouverture directe d'une mission (depuis « Aujourd'hui », la carte ou une notification).
  const requestedId = route.params?.interventionId;
  useEffect(() => {
    if (requestedId) {
      setSelectedId(requestedId);
      navigation.setParams({ interventionId: undefined });
    }
  }, [requestedId, navigation]);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    const today = new Date();
    const startDate = toISODate(today);
    const endDate = toISODate(range === 'day' ? today : addDays(today, 6));
    const show = (list: Intervention[]) => setMissions(list.filter((m) => m.status !== 'CANCELLED'));
    try {
      // La date fait partie de la clé : jamais les missions d'hier présentées comme celles du jour.
      const result = await loadWithCache(
        user?.id,
        `missions:${startDate}:${endDate}`,
        () => fetchInterventions(token, { startDate, endDate, pageSize: 500 }),
        (cached) => show(cached.value),
      );
      show(result.value);
      setUpdatedAt(formatSavedAt(result.savedAt));
      setError(result.fromCache ? 'Hors ligne' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les missions.');
    } finally {
      inFlight.current = false;
    }
  }, [token, range, user?.id]);

  useFocusPolling(load);
  const refreshControl = usePullToRefresh(load);

  const groups = useMemo(() => {
    const byDate = new Map<string, Intervention[]>();
    [...missions]
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
          a.startTime.localeCompare(b.startTime),
      )
      .forEach((m) => {
        const day = byDate.get(m.date);
        if (day) day.push(m);
        else byDate.set(m.date, [m]);
      });
    return [...byDate.entries()].map(([date, data]) => ({ date, data }));
  }, [missions]);

  const toValidate = missions.filter((m) => m.status === 'NEEDS_REVIEW').length;
  const selected = missions.find((m) => m.id === selectedId);

  // Liste virtualisée : une semaine peut compter des centaines de missions sur une tablette modeste.
  const list = (
    <SectionList
      sections={groups}
      keyExtractor={(mission) => mission.id}
      contentContainerStyle={styles.list}
      refreshControl={refreshControl}
      stickySectionHeadersEnabled={false}
      initialNumToRender={12}
      windowSize={7}
      ListHeaderComponent={
        <>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {updatedAt ? 'Mise à jour impossible : liste de la dernière mise à jour.' : error}
            </Text>
          ) : null}
          {groups.length === 0 && !error ? (
            <Text style={styles.empty}>
              {range === 'day' ? "Aucune mission aujourd'hui sur vos sites." : 'Aucune mission cette semaine sur vos sites.'}
            </Text>
          ) : null}
        </>
      }
      renderSectionHeader={({ section }) =>
        range === 'week' ? (
          <Text accessibilityRole="header" style={styles.groupTitle}>
            {formatDayLong(section.date)}
          </Text>
        ) : null
      }
      ItemSeparatorComponent={RowGap}
      renderItem={({ item: mission }) => {
        const status = missionStatus(mission);
        const agentCount = mission.agents.length;
        return (
          <ListRow
            title={mission.siteName}
            subtitle={`${mission.startTime} – ${mission.endTime} · ${
              agentCount ? `${agentCount} agent${agentCount > 1 ? 's' : ''}` : 'aucun agent'
            }`}
            selected={mission.id === selectedId}
            onPress={() => setSelectedId(mission.id)}
            trailing={<StatusPill strong label={status.label} tone={status.tone} />}
          />
        );
      }}
    />
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Missions"
        subtitle={
          toValidate
            ? `Missions de vos sites · ${toValidate} à valider`
            : 'Missions de vos sites'
        }
        updatedAt={updatedAt}
        onRefresh={load}
        right={
          <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCreating(true)}
            style={({ pressed }) => [styles.newButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.newButtonLabel}>Nouvelle mission</Text>
          </Pressable>
          <Segmented
            accessibilityLabel="Période"
            value={range}
            onChange={(next) => {
              setRange(next);
              setMissions([]);
            }}
            options={[
              { value: 'day', label: 'Jour' },
              { value: 'week', label: 'Semaine' },
            ]}
          />
          </>
        }
      />
      <MissionRequestSheet kind={creating ? 'create' : null} onClose={() => setCreating(false)} />
      <SplitView
        list={list}
        detail={selectedId ? <MissionDetail interventionId={selectedId} onChanged={load} /> : null}
        detailTitle={selected?.siteName}
        onCloseDetail={() => setSelectedId(null)}
        emptyDetail={
          <View style={styles.placeholder}>
            <Ionicons name="list-outline" size={36} color={theme.colors.muted} />
            <Text style={styles.empty}>Choisissez une mission pour voir ses pointages et la valider.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 32, gap: 20, backgroundColor: theme.colors.cream },
  list: { paddingBottom: 16 },
  groupTitle: { fontFamily: theme.fonts.bodyBold, fontSize: 16, color: theme.colors.ink, marginTop: 16, marginBottom: 10 },
  empty: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted, textAlign: 'center' },
  error: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
  newButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newButtonLabel: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: '#fff' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    padding: 24,
  },
});
