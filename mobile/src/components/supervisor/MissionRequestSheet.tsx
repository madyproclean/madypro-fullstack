import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Intervention } from '@/types/intervention';
import { AgentOption } from '@/types/supervision';
import { listActiveAgents, requestMissionCancel, requestMissionChange } from '@/services/api/supervision.api';
import { FormSheet } from './FormSheet';
import { AgentPicker } from './AgentPicker';
import { formatDayLong } from './format';

/**
 * Seules des demandes ponctuelles sur une mission déjà créée : remplacer un agent (absence) ou
 * annuler. Créer, déplacer ou changer durablement une mission passe par le gabarit du site.
 */
export type MissionRequestKind = 'agents' | 'cancel';

type Props = {
  kind: MissionRequestKind | null;
  mission?: Intervention | null;
  /** Agent pré-sélectionné (ex. remplaçant proposé après une absence). */
  initialAgentIds?: string[];
  onClose: () => void;
  onSent?: () => void;
};

const TITLES: Record<MissionRequestKind, string> = {
  agents: 'Changer les agents',
  cancel: 'Annuler la mission',
};

const HINT = "Votre demande sera envoyée à l'administrateur, qui l'approuvera ou la refusera. Suivez-la dans Validations › Mes demandes.";

/** Formulaires de demande de changement de planning (le superviseur propose, l'administrateur décide). */
export const MissionRequestSheet: React.FC<Props> = ({ kind, mission, initialAgentIds, onClose, onSent }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Les consignes de saisie ne s'affichent qu'après une première modification (pas en rouge dès l'ouverture).
  const [dirty, setDirty] = useState(false);
  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setDirty(true);
      setter(value);
    };

  const initialAgentsRef = useRef(initialAgentIds);
  initialAgentsRef.current = initialAgentIds;
  const missionRef = useRef(mission);
  missionRef.current = mission;

  // Réinitialise le formulaire à chaque ouverture (pas à chaque rafraîchissement du parent).
  useEffect(() => {
    const mission = missionRef.current;
    const initialAgentIds = initialAgentsRef.current;
    if (!kind) return;
    setError(null);
    setDirty(false);
    setReason('');
    setAgentIds(initialAgentIds ?? mission?.agentIds ?? []);
    if (!token) return;
    if (kind === 'agents') listActiveAgents(token).then(setAgents).catch(() => setAgents([]));
  }, [kind, mission?.id, token]);

  const validation = useMemo(() => {
    if (!kind) return null;
    if (kind === 'cancel') return reason.trim().length < 3 ? 'Indiquez le motif de l’annulation.' : null;
    if (kind === 'agents') {
      const current = [...(mission?.agentIds ?? [])].sort().join();
      return [...agentIds].sort().join() === current ? 'Modifiez la liste des agents.' : null;
    }
    return null;
  }, [kind, reason, agentIds, mission]);

  const submit = async () => {
    if (!token || !kind || validation) return;
    setSubmitting(true);
    setError(null);
    try {
      if (kind === 'agents' && mission) await requestMissionChange(token, mission.id, { agentIds });
      if (kind === 'cancel' && mission) await requestMissionCancel(token, mission.id, reason.trim());
      showToast('Demande envoyée', "L'administrateur va l'examiner.", 'success');
      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La demande n'a pas pu être envoyée.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormSheet
      visible={kind !== null}
      title={kind ? TITLES[kind] : ''}
      hint={HINT}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Envoyer la demande"
      submitting={submitting}
      canSubmit={!validation}
      error={error ?? (!dirty || kind === 'cancel' ? null : validation)}
    >
      {mission ? (
        <Text style={styles.context}>
          {mission.siteName} · {formatDayLong(mission.date)} · {mission.startTime} – {mission.endTime}
        </Text>
      ) : null}

      {kind === 'agents' ? <AgentPicker agents={agents} selected={agentIds} onChange={edit(setAgentIds)} /> : null}

      {kind === 'cancel' ? (
        <View style={styles.group}>
          <Text style={styles.label}>Motif de l'annulation (obligatoire)</Text>
          <TextInput
            accessibilityLabel="Motif de l'annulation"
            value={reason}
            onChangeText={setReason}
            multiline
            style={styles.textarea}
            placeholder="Ex. site fermé ce jour-là"
          />
        </View>
      ) : null}
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  context: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
  group: { gap: 8 },
  label: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  textarea: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    padding: 14,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.ink,
    textAlignVertical: 'top',
  },
});
