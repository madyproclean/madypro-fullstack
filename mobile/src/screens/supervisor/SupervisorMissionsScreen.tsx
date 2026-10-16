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
import { PlannedMissionDetail } from '@/components/supervisor/PlannedMissionDetail';
import { TemplateEditorSheet } from '@/components/supervisor/TemplateEditorSheet';
import { addDays, formatDayLong, missionStatus, toISODate } from '@/components/supervisor/format';
import { fetchInterventions } from '@/services/api/interventions.api';
import { getPlanning, validateMissions } from '@/services/api/supervision.api';
import { useToast } from '@/context/ToastContext';
import { PlanningOccurrence } from '@/types/supervision';
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

/** Ligne du planning : mission déjà créée, ou mission prévue par le gabarit (pas encore créée). */
type Row =
  | { key: string; kind: 'real'; date: string; startTime: string; mission: Intervention }
  | { key: string; kind: 'planned'; date: string; startTime: string; occurrence: PlanningOccurrence };

const plannedKey = (o: PlanningOccurrence) => `planned:${o.date}:${o.stopId}`;

export default function SupervisorMissionsScreen({ route, navigation }: Props) {
  const { token, user } = useAuthContext();
  const [range, setRange] = useState<Range>('day');
  const [missions, setMissions] = useState<Intervention[]>([]);
  const [planned, setPlanned] = useState<PlanningOccurrence[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const { showToast } = useToast();
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
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
    const show = ([list, plan]: [Intervention[], PlanningOccurrence[]]) => {
      setMissions(list.filter((m) => m.status !== 'CANCELLED'));
      // Les occurrences déjà créées figurent dans `list` ; on n'ajoute que celles à venir.
      setPlanned(plan.filter((o) => o.source === 'projected'));
    };
    try {
      // La date fait partie de la clé : jamais les missions d'hier présentées comme celles du jour.
      const result = await loadWithCache(
        user?.id,
        `planning:${startDate}:${endDate}`,
        () =>
          Promise.all([
            fetchInterventions(token, { startDate, endDate, pageSize: 500 }),
            getPlanning(token, startDate, endDate),
          ]),
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
    const rows: Row[] = [
      ...missions.map((m) => ({ key: m.id, kind: 'real' as const, date: m.date, startTime: m.startTime, mission: m })),
      ...planned.map((o) => ({ key: plannedKey(o), kind: 'planned' as const, date: o.date, startTime: o.startTime, occurrence: o })),
    ];
    const rank = (r: Row) => (r.kind === 'real' ? STATUS_ORDER[r.mission.status] ?? 9 : STATUS_ORDER.PLANNED);
    rows.sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b) || a.startTime.localeCompare(b.startTime));
    const byDate = new Map<string, Row[]>();
    rows.forEach((r) => {
      const day = byDate.get(r.date);
      if (day) day.push(r);
      else byDate.set(r.date, [r]);
    });
    return [...byDate.entries()].map(([date, data]) => ({ date, data }));
  }, [missions, planned]);

  const toValidateIds = missions.filter((m) => m.status === 'NEEDS_REVIEW').map((m) => m.id);
  const toValidate = toValidateIds.length;

  // Validation groupée : seules les missions en ordre passent ; les autres restent, avec la raison.
  const validateAll = async () => {
    if (!token || !toValidateIds.length) return;
    setBatchBusy(true);
    try {
      const result = await validateMissions(token, toValidateIds);
      const refused = result.refused.map((r) => `${r.siteName ?? 'Mission'} : ${r.reason}`).join(' · ');
      showToast(
        `${result.validated.length} mission(s) validée(s)`,
        refused ? `À revoir : ${refused}` : 'Toutes les missions sélectionnées sont validées.',
        refused ? 'info' : 'success',
      );
      setConfirmBatch(false);
      load();
    } catch (err) {
      showToast('Validation impossible', err instanceof Error ? err.message : 'Réessayez.', 'error');
    } finally {
      setBatchBusy(false);
    }
  };
  const selected = missions.find((m) => m.id === selectedId);
  const selectedPlanned = planned.find((o) => plannedKey(o) === selectedId);

  // Liste virtualisée : une semaine peut compter des centaines de missions sur une tablette modeste.
  const list = (
    <SectionList
      sections={groups}
      keyExtractor={(row) => row.key}
      contentContainerStyle={styles.list}
      refreshControl={refreshControl}
      stickySectionHeadersEnabled={false}
      initialNumToRender={12}
      windowSize={7}
      ListHeaderComponent={
        <>
          {toValidate > 1 ? (
            <View style={styles.batch}>
              <Ionicons name="checkmark-done-outline" size={22} color={theme.colors.primaryDark} />
              <Text style={[styles.batchText, { flex: 1 }]}>
                {confirmBatch
                  ? `Valider les ${toValidate} missions à valider ? Celles avec une anomalie ou un pointage incomplet resteront à revoir.`
                  : `${toValidate} missions à valider`}
              </Text>
              {confirmBatch ? (
                <Pressable accessibilityRole="button" onPress={() => setConfirmBatch(false)} style={styles.batchGhost}>
                  <Text style={styles.batchText}>Annuler</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={batchBusy}
                onPress={() => (confirmBatch ? validateAll() : setConfirmBatch(true))}
                style={({ pressed }) => [styles.newButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.newButtonLabel}>{batchBusy ? 'Validation…' : confirmBatch ? 'Confirmer' : 'Tout valider'}</Text>
              </Pressable>
            </View>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {updatedAt ? 'Mise à jour impossible : liste de la dernière mise à jour.' : error}
            </Text>
          ) : null}
          {groups.length === 0 && !error ? (
            <Text style={styles.empty}>
              {range === 'day'
                ? "Aucune mission aujourd'hui sur vos sites. Les missions découlent des gabarits des sites."
                : 'Aucune mission cette semaine sur vos sites. Les missions découlent des gabarits des sites.'}
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
      renderItem={({ item: row }) => {
        if (row.kind === 'planned') {
          const o = row.occurrence;
          const who = o.agents.length ? o.agents.map((x) => x.name.split(' ')[0]).join(', ') : 'aucun agent';
          return (
            <ListRow
              title={o.siteName}
              subtitle={`${o.startTime} – ${o.endTime} · ${o.categoryLabel ? `${o.categoryLabel} · ` : ''}${who}`}
              selected={row.key === selectedId}
              onPress={() => setSelectedId(row.key)}
              trailing={<StatusPill strong label="Prévue" tone="neutral" />}
            />
          );
        }
        const mission = row.mission;
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
            accessibilityHint="Ajouter, déplacer ou modifier les créneaux d'un site"
            onPress={() => setEditingTemplate(true)}
            style={({ pressed }) => [styles.newButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="git-branch-outline" size={20} color="#fff" />
            <Text style={styles.newButtonLabel}>Modifier un gabarit</Text>
          </Pressable>
          <Segmented
            accessibilityLabel="Période"
            value={range}
            onChange={(next) => {
              setRange(next);
              setMissions([]);
              setPlanned([]);
            }}
            options={[
              { value: 'day', label: 'Jour' },
              { value: 'week', label: 'Semaine' },
            ]}
          />
          </>
        }
      />
      <TemplateEditorSheet visible={editingTemplate} onClose={() => setEditingTemplate(false)} onSaved={load} />
      <SplitView
        list={list}
        detail={
          selectedPlanned ? (
            <PlannedMissionDetail occurrence={selectedPlanned} onChanged={load} />
          ) : selectedId ? (
            <MissionDetail interventionId={selectedId} onChanged={load} />
          ) : null
        }
        detailTitle={selectedPlanned?.siteName ?? selected?.siteName}
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
  batch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
  },
  batchText: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.ink },
  batchGhost: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' },
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
