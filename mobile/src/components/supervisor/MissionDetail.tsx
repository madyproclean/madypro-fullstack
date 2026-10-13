import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchInterventionById, InterventionChecklistItem, listInterventionChecklist, updateInterventionStatus } from '@/services/api/interventions.api';
import { listAnomalies, updateAnomalyStatus } from '@/services/api/anomalies.api';
import { listMissionAttendance, listMyRequests } from '@/services/api/supervision.api';
import { ApiError } from '@/services/api/client';
import { formatSavedAt, loadWithCache } from '@/services/supervisorCache';
import { Intervention } from '@/types/intervention';
import { Anomaly } from '@/types/anomaly';
import { ApprovalRequest, MissionAttendance } from '@/types/supervision';
import { ANOMALY_LABELS, APPROVAL_ACTION_LABELS, formatClock, formatDayLong, missionStatus } from './format';
import { MissionRequestKind, MissionRequestSheet } from './MissionRequestSheet';

type Props = {
  interventionId: string;
  /** Appelé après une validation ou une anomalie traitée, pour rafraîchir la liste. */
  onChanged?: () => void;
};

type Loaded = {
  mission: Intervention;
  attendance: MissionAttendance[];
  checklist: InterventionChecklistItem[];
  anomalies: Anomaly[];
  /** Demande du superviseur sur cette mission encore en attente de l'administrateur. */
  pendingRequests: ApprovalRequest[];
};

/** Détail d'une mission : pointages, checklist, anomalies, photos, et validation si elle est à valider. */
export const MissionDetail: React.FC<Props> = ({ interventionId, onChanged }) => {
  const { token, user } = useAuthContext();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Renseigné quand la mission affichée vient du cache (hors ligne). */
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestKind, setRequestKind] = useState<MissionRequestKind | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const fetchAll = async (): Promise<Loaded> => {
      const mission = await fetchInterventionById(token, interventionId);
      // Les éléments secondaires ne doivent pas empêcher d'afficher la mission.
      const [attendance, checklist, anomalies, requests] = await Promise.all([
        listMissionAttendance(token, interventionId).catch(() => []),
        listInterventionChecklist(token, interventionId).catch(() => []),
        listAnomalies(token, interventionId).catch(() => []),
        listMyRequests(token).catch(() => [] as ApprovalRequest[]),
      ]);
      const pendingRequests = requests.filter((r) => r.entityId === interventionId && r.status === 'PENDING');
      return { mission, attendance, checklist, anomalies, pendingRequests };
    };
    try {
      const result = await loadWithCache(user?.id, `mission:${interventionId}`, fetchAll);
      setData(result.value);
      setSavedAt(result.fromCache ? result.savedAt : null);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && (err.status === 403 || err.status === 404)
          ? "Cette mission est introuvable ou n'est pas sur l'un de vos sites."
          : err instanceof Error
            ? err.message
            : 'Impossible de charger la mission.',
      );
    }
  }, [token, interventionId, user?.id]);

  useEffect(() => {
    setData(null);
    setConfirming(false);
    setActionError(null);
    load();
  }, [load]);

  const validate = async () => {
    if (!token) return;
    setBusy(true);
    setActionError(null);
    try {
      await updateInterventionStatus(token, interventionId, 'COMPLETED');
      setConfirming(false);
      await load();
      onChanged?.();
    } catch (err) {
      // Ex. « Validation impossible : Heures manquantes (fin) : … » renvoyé par le serveur.
      setActionError(err instanceof Error ? err.message : 'Validation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const resolveAnomaly = async (anomaly: Anomaly) => {
    if (!token) return;
    setActionError(null);
    try {
      await updateAnomalyStatus(token, anomaly.id, 'RESOLVED');
      await load();
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Impossible de traiter l'anomalie.");
    }
  };

  if (loadError) {
    return (
      <View style={[styles.card, styles.center]}>
        <Ionicons name="alert-circle-outline" size={32} color={theme.colors.status.absent} />
        <Text style={styles.muted}>{loadError}</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const { mission, attendance, checklist, anomalies, pendingRequests } = data;
  // Changements de planning possibles tant que la mission n'est pas terminée.
  const canRequestChange = mission.status === 'PLANNED' || mission.status === 'IN_PROGRESS';
  const status = missionStatus(mission);
  const done = checklist.filter((item) => item.done).length;
  const openAnomalies = anomalies.filter((a) => a.status !== 'RESOLVED');
  const photos = attendance.flatMap((a) =>
    [
      a.checkInPhoto ? { uri: a.checkInPhoto, label: `Arrivée de ${a.agent.name}` } : null,
      a.checkOutPhoto ? { uri: a.checkOutPhoto, label: `Départ de ${a.agent.name}` } : null,
    ].filter((p): p is { uri: string; label: string } => p !== null),
  );
  const attendanceByAgent = new Map(attendance.map((a) => [a.agent.id, a]));
  // Le serveur accepte la validation même si un agent n'a jamais pointé : on le signale avant.
  const notCheckedOut = mission.agents.filter((agent) => {
    const att = attendanceByAgent.get(agent.id);
    return !(att?.checkOutTime || agent.checkOutTime);
  });

  return (
    <ScrollView style={styles.card} contentContainerStyle={styles.content}>
      {savedAt ? (
        <View style={styles.warning}>
          <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.ink} />
          <Text style={styles.warningText}>Hors ligne : mission telle qu'enregistrée le {formatSavedAt(savedAt)}.</Text>
        </View>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text accessibilityRole="header" style={styles.title}>
            {mission.siteName}
          </Text>
          <Text style={styles.muted}>
            {formatDayLong(mission.date)} · {mission.startTime} – {mission.endTime} ·{' '}
            {mission.type === 'PUNCTUAL' ? 'Intervention ponctuelle' : 'Entretien régulier'}
          </Text>
          {mission.siteAddress ? <Text style={styles.muted}>{mission.siteAddress}</Text> : null}
        </View>
        <StatusPill strong label={status.label} tone={status.tone} />
      </View>

      <Section title="Pointages">
        {mission.agents.length === 0 ? (
          <Text style={styles.muted}>Aucun agent affecté.</Text>
        ) : (
          mission.agents.map((agent) => {
            const att = attendanceByAgent.get(agent.id);
            const arrival = att?.checkInTime ? formatClock(att.checkInTime) : formatClock(agent.checkInTime ?? agent.arrivalTime);
            const departure = att?.checkOutTime ? formatClock(att.checkOutTime) : formatClock(agent.checkOutTime);
            const complete = departure !== '—';
            const started = arrival !== '—';
            // Avant l'heure de début, l'absence de pointage est normale : pas d'alerte rouge.
            const upcoming = new Date() < new Date(`${mission.date}T${mission.startTime || '00:00'}:00`);
            return (
              <View key={agent.id} style={styles.attendanceRow}>
                <Text style={[styles.cell, styles.bold]}>{agent.name}</Text>
                <Text style={styles.cell}>Arrivée {arrival}</Text>
                <Text style={styles.cell}>Départ {departure}</Text>
                <StatusPill
                  label={complete ? 'Complet' : started ? 'En cours' : upcoming ? 'Pas encore arrivé' : 'Non pointé'}
                  tone={complete ? 'success' : started ? 'info' : upcoming ? 'neutral' : 'danger'}
                />
              </View>
            );
          })
        )}
      </Section>

      <View style={styles.twoCols}>
        <Section title="Checklist" style={styles.col}>
          {checklist.length === 0 ? (
            <Text style={styles.muted}>Pas de checklist pour cette mission.</Text>
          ) : (
            <>
              <Text style={styles.bold}>
                {done} tâche{done > 1 ? 's' : ''} sur {checklist.length}
              </Text>
              <View style={styles.progressTrack} accessibilityLabel={`${done} tâches faites sur ${checklist.length}`}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round((done / checklist.length) * 100)}%`,
                      backgroundColor: done === checklist.length ? theme.colors.status.onTime : theme.colors.status.late,
                    },
                  ]}
                />
              </View>
              {checklist
                .filter((item) => !item.done)
                .slice(0, 4)
                .map((item) => (
                  <Text key={item.id} style={styles.muted}>
                    · {item.label} (non faite)
                  </Text>
                ))}
            </>
          )}
        </Section>
        <Section title={openAnomalies.length ? `Anomalies (${openAnomalies.length})` : 'Anomalies'} style={styles.col}>
          {anomalies.length === 0 ? (
            <Text style={styles.muted}>Aucune anomalie signalée.</Text>
          ) : (
            anomalies.map((anomaly) => (
              <View key={anomaly.id} style={styles.anomaly}>
                <View style={styles.anomalyText}>
                  <Text style={styles.bold}>{anomaly.title || ANOMALY_LABELS[anomaly.type] || 'Anomalie'}</Text>
                  <Text style={styles.muted}>
                    {anomaly.description} · par {anomaly.user.name}
                  </Text>
                </View>
                {anomaly.status === 'RESOLVED' ? (
                  <StatusPill strong label="Traitée" tone="success" />
                ) : (
                  <ActionButton label="Marquer traitée" onPress={() => resolveAnomaly(anomaly)} />
                )}
              </View>
            ))
          )}
        </Section>
      </View>

      {photos.length ? (
        <Section title="Photos de pointage">
          <View style={styles.photos}>
            {photos.map((photo) => (
              <Image key={photo.label} source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel={photo.label} />
            ))}
          </View>
        </Section>
      ) : null}

      {actionError ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.colors.status.absent} />
          <Text style={styles.errorText}>{actionError}</Text>
        </View>
      ) : null}

      {pendingRequests.length ? (
        <View style={styles.pending}>
          <Ionicons name="hourglass-outline" size={20} color={theme.colors.primaryDark} />
          <Text style={styles.pendingText}>
            {pendingRequests.length > 1 ? "Demandes en attente de l'administrateur" : "Demande en attente de l'administrateur"} :{' '}
            {pendingRequests.map((r) => APPROVAL_ACTION_LABELS[r.actionType] ?? 'Demande').join(', ')}. Suivi dans Validations › Mes demandes.
          </Text>
        </View>
      ) : null}

      {canRequestChange ? (
        <View style={styles.actions}>
          {mission.status === 'PLANNED' ? (
            <ActionButton label="Déplacer" icon="calendar-outline" onPress={() => setRequestKind('reschedule')} />
          ) : null}
          <ActionButton label="Changer les agents" icon="people-outline" onPress={() => setRequestKind('agents')} />
          {mission.status === 'PLANNED' ? (
            <ActionButton label="Annuler la mission" icon="close-circle-outline" onPress={() => setRequestKind('cancel')} />
          ) : null}
        </View>
      ) : null}

      <MissionRequestSheet
        kind={requestKind}
        mission={mission}
        onClose={() => setRequestKind(null)}
        onSent={() => {
          load();
          onChanged?.();
        }}
      />

      {mission.status === 'NEEDS_REVIEW' ? (
        confirming ? (
          <View style={styles.confirm}>
            <Text style={styles.bold}>Valider cette mission ? Elle passera en « Terminée ».</Text>
            {notCheckedOut.length ? (
              <View accessibilityRole="alert" style={styles.warning}>
                <Ionicons name="warning-outline" size={20} color={theme.colors.status.late} />
                <Text style={styles.warningText}>
                  Pointage incomplet pour {notCheckedOut.map((a) => a.name).join(', ')} : la mission sera tout de même
                  comptée comme réalisée.
                </Text>
              </View>
            ) : null}
            <View style={styles.actions}>
              <ActionButton label="Annuler" onPress={() => setConfirming(false)} />
              <ActionButton label={busy ? 'Validation…' : 'Confirmer la validation'} primary onPress={validate} disabled={busy} />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            <ActionButton label="Valider la mission" icon="checkmark" primary onPress={() => setConfirming(true)} />
          </View>
        )
      ) : null}
    </ScrollView>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode; style?: object }> = ({ title, children, style }) => (
  <View style={[styles.section, style]}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>
      {title}
    </Text>
    {children}
  </View>
);

const ActionButton: React.FC<{
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}> = ({ label, onPress, primary, disabled, icon }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
    onPress={disabled ? undefined : onPress}
    style={({ pressed }) => [styles.button, primary && styles.buttonPrimary, (pressed || disabled) && { opacity: 0.7 }]}
  >
    {icon ? <Ionicons name={icon} size={20} color={primary ? '#fff' : theme.colors.ink} /> : null}
    <Text style={[styles.buttonLabel, primary && { color: '#fff' }]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.shell,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  content: { padding: 20, gap: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleText: { flex: 1, gap: 4 },
  title: { fontFamily: theme.fonts.display, fontSize: 26, color: theme.colors.ink },
  muted: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  bold: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
  section: { gap: 10 },
  sectionTitle: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cell: { flex: 1, fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.ink },
  twoCols: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  col: { flex: 1, minWidth: 240 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: theme.colors.status.pendingSoft, overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 999 },
  anomaly: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  anomalyText: { flex: 1, gap: 2 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: 120, height: 90, borderRadius: 12, backgroundColor: theme.colors.status.pendingSoft },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.status.absentSoft,
  },
  errorText: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.ink },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.status.lateSoft,
  },
  warningText: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.ink },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
  },
  pendingText: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.ink },
  confirm: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: theme.colors.primarySoft },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonPrimary: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  buttonLabel: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
});
