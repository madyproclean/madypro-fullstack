import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  approveAbsenceLevel1,
  decideAbsence,
  getReplacementSuggestions,
  getTeamAbsence,
} from '@/services/api/supervision.api';
import { getInterventionById } from '@/services/api/interventions.api';
import { Intervention } from '@/types/intervention';
import { ReplacementSuggestions, TeamAbsence } from '@/types/supervision';
import { formatDayShort } from './format';
import { MissionRequestSheet } from './MissionRequestSheet';

export const ABSENCE_LABELS: Record<string, string> = {
  SICK: 'Arrêt maladie',
  PAID_LEAVE: 'Congé payé',
  UNPAID: 'Congé sans solde',
  OTHER: 'Autre absence',
};

const dayCount = (from: string, to: string) =>
  Math.round((new Date(to.slice(0, 10)).getTime() - new Date(from.slice(0, 10)).getTime()) / 86_400_000) + 1;

export const absenceStatus = (absence: TeamAbsence) => {
  if (absence.status === 'APPROVED') return { label: 'Approuvée', tone: 'success' as const };
  if (absence.status === 'REJECTED') return { label: 'Refusée', tone: 'danger' as const };
  if (absence.requiresSecondApproval && absence.level1ApprovedBy)
    return { label: "Chez l'administrateur", tone: 'info' as const };
  return { label: 'En attente', tone: 'warning' as const };
};

type Props = {
  absenceId: string;
  /** Absence déjà chargée par la liste (évite un appel). */
  initial?: TeamAbsence;
  onChanged?: () => void;
};

/**
 * Détail d'une absence de l'équipe : approuver ou refuser (motif obligatoire) ; pour une absence
 * de plus de 5 jours, première validation seulement, l'administrateur donnant l'accord final.
 * Une fois approuvée, propose des remplaçants pour les missions touchées (demande à l'administrateur).
 */
export const AbsenceDetail: React.FC<Props> = ({ absenceId, initial, onChanged }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [absence, setAbsence] = useState<TeamAbsence | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ReplacementSuggestions | null>(null);
  const [proposal, setProposal] = useState<{ mission: Intervention; agentIds: string[] } | null>(null);

  useEffect(() => {
    setAbsence(initial ?? null);
    setReason('');
    setActionError(null);
    setSuggestions(null);
    if (initial || !token) return;
    getTeamAbsence(token, absenceId)
      .then(setAbsence)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Absence introuvable.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absenceId, token]);

  const loadSuggestions = useCallback(async () => {
    if (!token) return;
    try {
      setSuggestions(await getReplacementSuggestions(token, absenceId));
    } catch {
      setSuggestions({ absenceId, interventions: [] });
    }
  }, [token, absenceId]);

  useEffect(() => {
    if (absence?.status === 'APPROVED') loadSuggestions();
  }, [absence?.status, loadSuggestions]);

  const act = async (action: () => Promise<TeamAbsence>, success: string) => {
    setBusy(true);
    setActionError(null);
    try {
      setAbsence(await action());
      showToast(success, undefined, 'success');
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  const propose = async (interventionId: string, candidateId: string) => {
    if (!token || !absence) return;
    const mission = await getInterventionById(token, interventionId);
    if (!mission) {
      setActionError('Mission introuvable.');
      return;
    }
    // L'agent absent est remplacé par le candidat, les autres agents restent.
    const agentIds = [...mission.agentIds.filter((id) => id !== absence.agent.id), candidateId];
    setProposal({ mission, agentIds });
  };

  if (loadError) {
    return (
      <View style={[styles.card, styles.center]}>
        <Text style={styles.muted}>{loadError}</Text>
      </View>
    );
  }
  if (!absence) {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const status = absenceStatus(absence);
  const days = dayCount(absence.from, absence.to);
  const pending = absence.status === 'PENDING';
  const twoLevels = !!absence.requiresSecondApproval;
  const awaitingAdmin = pending && twoLevels && !!absence.level1ApprovedBy;
  const reasonOk = reason.trim().length >= 3;
  const token_ = token as string;

  return (
    <ScrollView style={styles.card} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text accessibilityRole="header" style={styles.title}>
            {absence.agent.name} · {ABSENCE_LABELS[absence.type] ?? 'Absence'}
          </Text>
          <Text style={styles.muted}>
            {absence.from.slice(0, 10) === absence.to.slice(0, 10)
              ? formatDayShort(absence.from.slice(0, 10))
              : `Du ${formatDayShort(absence.from.slice(0, 10))} au ${formatDayShort(absence.to.slice(0, 10))}`}{' '}
            · {days} jour{days > 1 ? 's' : ''}
            {absence.site ? ` · ${absence.site.name}` : ''}
          </Text>
        </View>
        <StatusPill label={status.label} tone={status.tone} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Motif de l'agent</Text>
        <Text style={styles.text}>{absence.reason || 'Non précisé.'}</Text>
        {absence.note ? <Text style={styles.muted}>{absence.note}</Text> : null}
        {absence.attachment ? (
          <Image source={{ uri: absence.attachment }} style={styles.attachment} accessibilityLabel="Justificatif" />
        ) : null}
      </View>

      {absence.status === 'REJECTED' && absence.validationComment ? (
        <Text style={styles.muted}>Motif du refus : {absence.validationComment}</Text>
      ) : null}

      {actionError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {actionError}
        </Text>
      ) : null}

      {pending && !awaitingAdmin ? (
        <View style={styles.section}>
          {twoLevels ? (
            <Text style={styles.info}>
              Absence de plus de 5 jours : votre accord sera transmis à l'administrateur, qui donnera l'accord final.
            </Text>
          ) : null}
          <Text style={styles.sectionTitle}>Motif du refus (obligatoire pour refuser)</Text>
          <TextInput
            accessibilityLabel="Motif du refus"
            value={reason}
            onChangeText={setReason}
            multiline
            style={styles.textarea}
          />
          <View style={styles.actions}>
            <Button
              label="Refuser"
              danger
              disabled={busy || !reasonOk}
              onPress={() => act(() => decideAbsence(token_, absence.id, 'REJECTED', reason.trim()), 'Absence refusée')}
            />
            <Button
              label={twoLevels ? 'Donner mon accord' : 'Approuver'}
              primary
              disabled={busy}
              onPress={() =>
                twoLevels
                  ? act(() => approveAbsenceLevel1(token_, absence.id), "Accord transmis à l'administrateur")
                  : act(() => decideAbsence(token_, absence.id, 'APPROVED'), 'Absence approuvée')
              }
            />
          </View>
        </View>
      ) : null}

      {awaitingAdmin ? (
        <Text style={styles.info}>Votre accord a été transmis. L'administrateur doit donner l'accord final.</Text>
      ) : null}

      {absence.status === 'APPROVED' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Missions à couvrir</Text>
          {!suggestions ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : suggestions.interventions.length === 0 ? (
            <Text style={styles.muted}>Aucune mission à venir de cet agent pendant l'absence.</Text>
          ) : (
            suggestions.interventions.map((item) => (
              <View key={item.interventionId} style={styles.mission}>
                <Text style={styles.bold}>
                  {item.siteName} · {formatDayShort(item.date)} · {item.startTime} – {item.endTime}
                </Text>
                {item.candidates.length === 0 ? (
                  <Text style={styles.muted}>Aucun agent disponible sur ce créneau.</Text>
                ) : (
                  item.candidates.slice(0, 3).map((candidate) => (
                    <View key={candidate.id} style={styles.candidate}>
                      <Text style={styles.text}>{candidate.name} · disponible</Text>
                      <Button label="Proposer" onPress={() => propose(item.interventionId, candidate.id)} />
                    </View>
                  ))
                )}
              </View>
            ))
          )}
        </View>
      ) : null}

      <MissionRequestSheet
        kind={proposal ? 'agents' : null}
        mission={proposal?.mission}
        initialAgentIds={proposal?.agentIds}
        onClose={() => setProposal(null)}
      />
    </ScrollView>
  );
};

const Button: React.FC<{ label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }> = ({
  label,
  onPress,
  primary,
  danger,
  disabled,
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
    onPress={disabled ? undefined : onPress}
    style={({ pressed }) => [
      styles.button,
      primary && styles.primary,
      danger && styles.danger,
      disabled && styles.disabled,
      pressed && { opacity: 0.7 },
    ]}
  >
    <Text style={[styles.buttonLabel, primary && { color: '#fff' }, danger && { color: theme.colors.status.absent }]}>
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: theme.colors.shell, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, gap: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleText: { flex: 1, gap: 4 },
  title: { fontFamily: theme.fonts.display, fontSize: 26, color: theme.colors.ink },
  muted: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  text: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.ink, flex: 1 },
  bold: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
  info: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 15,
    color: theme.colors.ink,
    backgroundColor: theme.colors.primarySoft,
    padding: 12,
    borderRadius: 12,
  },
  error: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
  section: { gap: 10 },
  sectionTitle: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  attachment: { width: 160, height: 120, borderRadius: 12, backgroundColor: theme.colors.status.pendingSoft },
  textarea: {
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.ink,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  mission: { gap: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    justifyContent: 'center',
  },
  primary: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  danger: { borderColor: theme.colors.status.absent },
  disabled: { opacity: 0.5 },
  buttonLabel: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
});
