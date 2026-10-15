import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useFocusPolling } from '@/hooks/useFocusPolling';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { formatSavedAt, loadWithCache } from '@/services/supervisorCache';
import { StatusPill, StatusTone } from '@/components/ui/StatusPill';
import { ScreenHeader } from '@/components/supervisor/ScreenHeader';
import { Initials, ListRow } from '@/components/supervisor/ListRow';
import { Segmented } from '@/components/supervisor/Segmented';
import { SplitView } from '@/components/supervisor/SplitView';
import { ABSENCE_LABELS, AbsenceDetail, absenceStatus } from '@/components/supervisor/AbsenceDetail';
import { APPROVAL_ACTION_LABELS, formatClock, formatDayShort, toISODate } from '@/components/supervisor/format';
import { listMyRequests, listTeamAbsences } from '@/services/api/supervision.api';
import { ApprovalRequest, TeamAbsence } from '@/types/supervision';
import { SupervisorTabParamList } from '@/navigation/types';

type Props = BottomTabScreenProps<SupervisorTabParamList, 'SupervisorValidations'>;
type Tab = 'absences' | 'requests';

const REQUEST_STATUS: Record<ApprovalRequest['status'], { label: string; tone: StatusTone }> = {
  PENDING: { label: 'En attente', tone: 'warning' },
  APPROVED: { label: 'Approuvée', tone: 'success' },
  REJECTED: { label: 'Refusée', tone: 'danger' },
  SUPERSEDED: { label: 'Remplacée', tone: 'neutral' },
};

// Jour pris à l'heure locale, comme l'heure (iso.slice(0, 10) donnerait le jour UTC).
const formatDateTime = (iso: string) => `${formatDayShort(toISODate(new Date(iso)))} à ${formatClock(iso)}`;

export default function SupervisorValidationsScreen({ route, navigation }: Props) {
  const { token, user } = useAuthContext();
  const [tab, setTab] = useState<Tab>('absences');
  const [absences, setAbsences] = useState<TeamAbsence[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Ouverture directe d'une absence (depuis « Aujourd'hui » ou une notification).
  const requestedId = route.params?.absenceId;
  useEffect(() => {
    if (requestedId) {
      setTab('absences');
      setSelectedId(requestedId);
      navigation.setParams({ absenceId: undefined });
    }
  }, [requestedId, navigation]);

  // Décision de l'administrateur sur une demande (notification) : ouvre « Mes demandes ».
  const requestedTab = route.params?.tab;
  useEffect(() => {
    if (requestedTab === 'requests') {
      setTab('requests');
      navigation.setParams({ tab: undefined });
    }
  }, [requestedTab, navigation]);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    try {
      const fetchAll = () => Promise.all([listTeamAbsences(token, 'PENDING'), listMyRequests(token)]);
      const apply = ([nextAbsences, nextRequests]: Awaited<ReturnType<typeof fetchAll>>) => {
        setAbsences(nextAbsences);
        setRequests(nextRequests);
      };
      const result = await loadWithCache(user?.id, 'validations', fetchAll, (cached) => apply(cached.value));
      apply(result.value);
      setUpdatedAt(formatSavedAt(result.savedAt));
      setError(result.fromCache ? 'Hors ligne' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les validations.');
    } finally {
      inFlight.current = false;
    }
  }, [token, user?.id]);

  useFocusPolling(load);
  const refreshControl = usePullToRefresh(load);

  // À traiter d'abord : celles qui attendent encore l'accord du superviseur.
  const toHandle = absences.filter((a) => !(a.requiresSecondApproval && a.level1ApprovedBy));
  const pendingRequests = requests.filter((r) => r.status === 'PENDING').length;
  const selected = absences.find((a) => a.id === selectedId);

  const absencesList = (
    <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl}>
      {absences.length === 0 ? <Text style={styles.empty}>Aucune absence en attente dans votre équipe.</Text> : null}
      {[...absences]
        .sort((a, b) => Number(toHandle.includes(b)) - Number(toHandle.includes(a)) || a.from.localeCompare(b.from))
        .map((absence) => {
          const status = absenceStatus(absence);
          return (
            <ListRow
              key={absence.id}
              title={absence.agent.name}
              subtitle={`${ABSENCE_LABELS[absence.type] ?? 'Absence'} · ${formatDayShort(absence.from.slice(0, 10))} au ${formatDayShort(
                absence.to.slice(0, 10),
              )}`}
              selected={absence.id === selectedId}
              onPress={() => setSelectedId(absence.id)}
              leading={<Initials name={absence.agent.name} />}
              below={<StatusPill strong label={status.label} tone={status.tone} />}
            />
          );
        })}
    </ScrollView>
  );

  const requestsList = (
    <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl}>
      {requests.length === 0 ? (
        <Text style={styles.empty}>
          Vous n'avez envoyé aucune demande. Déplacer, réaffecter ou annuler une mission se fait depuis Missions.
        </Text>
      ) : null}
      {requests.map((request) => {
        const status = REQUEST_STATUS[request.status] ?? REQUEST_STATUS.PENDING;
        return (
          <View key={request.id} style={styles.request}>
            <View style={styles.requestText}>
              <Text style={styles.requestTitle}>{APPROVAL_ACTION_LABELS[request.actionType] ?? 'Demande'}</Text>
              {request.summary ? <Text style={styles.muted}>{request.summary}</Text> : null}
              <Text style={styles.muted}>
                Envoyée le {formatDateTime(request.createdAt)}
                {request.reviewedAt ? ` · traitée le ${formatDateTime(request.reviewedAt)}` : ''}
                {request.reviewedByName ? ` par ${request.reviewedByName}` : ''}
              </Text>
              {request.status === 'REJECTED' && request.reviewComment ? (
                <Text style={styles.rejection}>Motif : {request.reviewComment}</Text>
              ) : null}
            </View>
            <StatusPill strong label={status.label} tone={status.tone} />
          </View>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Validations"
        subtitle="Absences de votre équipe et suivi de vos demandes"
        updatedAt={updatedAt}
        onRefresh={load}
        right={
          <Segmented
            accessibilityLabel="Rubrique"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'absences', label: `Absences (${toHandle.length})` },
              { value: 'requests', label: `Mes demandes (${pendingRequests})` },
            ]}
          />
        }
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {updatedAt ? 'Mise à jour impossible : liste de la dernière mise à jour.' : error}
        </Text>
      ) : null}
      {tab === 'absences' ? (
        <SplitView
          list={absencesList}
          detail={selectedId ? <AbsenceDetail absenceId={selectedId} initial={selected} onChanged={load} /> : null}
          detailTitle={selected?.agent.name}
          onCloseDetail={() => setSelectedId(null)}
          emptyDetail={
            <View style={styles.placeholder}>
              <Ionicons name="checkmark-done-outline" size={36} color={theme.colors.muted} />
              <Text style={styles.empty}>Choisissez une absence pour l'examiner.</Text>
            </View>
          }
        />
      ) : (
        requestsList
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 32, gap: 20, backgroundColor: theme.colors.cream },
  list: { gap: 10, paddingBottom: 16 },
  empty: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted, textAlign: 'center', paddingVertical: 12 },
  error: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
  muted: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  request: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
  },
  requestText: { flex: 1, gap: 4 },
  requestTitle: { fontFamily: theme.fonts.bodySemiBold, fontSize: 17, color: theme.colors.ink },
  rejection: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
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
