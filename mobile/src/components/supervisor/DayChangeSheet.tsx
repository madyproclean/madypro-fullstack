import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { changeOneDay, listActiveAgents } from '@/services/api/supervision.api';
import { AgentOption, DayOccurrence } from '@/types/supervision';
import { FormSheet } from './FormSheet';
import { AgentPicker } from './AgentPicker';
import { formatDayLong } from './format';

type Props = {
  /** Créneau du jour concerné ; `null` : fiche fermée. */
  occurrence: DayOccurrence | null;
  mode: 'replace' | 'cancel';
  /** Agents proposés d'office (ex. remplaçant disponible suggéré). */
  suggestedAgentIds?: string[];
  onClose: () => void;
  onDone?: () => void;
};

/**
 * Changement d'un seul jour sur un créneau du gabarit, sans toucher au gabarit : remplacer un
 * agent (pris en compte tout de suite) ou annuler le passage (accord de l'administrateur).
 */
export const DayChangeSheet: React.FC<Props> = ({ occurrence, mode, suggestedAgentIds, onClose, onDone }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!occurrence || !token) return;
    setAgentIds(suggestedAgentIds ?? occurrence.agentIds);
    setReason('');
    setError(null);
    if (mode === 'replace') listActiveAgents(token).then(setAgents).catch(() => setAgents([]));
  }, [occurrence, mode, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const sameAsBefore =
    !!occurrence && agentIds.length === occurrence.agentIds.length && agentIds.every((id) => occurrence.agentIds.includes(id));
  const valid = mode === 'cancel' ? reason.trim().length >= 3 : agentIds.length > 0 && !sameAsBefore;

  const submit = async () => {
    if (!token || !occurrence || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await changeOneDay(
        token,
        occurrence,
        mode === 'cancel'
          ? { kind: 'CANCEL', reason: reason.trim() }
          : { kind: 'REPLACE_AGENTS', agentIds, reason: reason.trim() || undefined },
      );
      if (result.actionType) {
        showToast('Demande envoyée', "L'administrateur doit accepter l'annulation.", 'success');
      } else {
        showToast('Remplacement enregistré', 'Les agents concernés sont prévenus.', 'success');
      }
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le changement n'a pas pu être enregistré.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormSheet
      visible={occurrence !== null}
      title={mode === 'cancel' ? 'Annuler ce jour-là' : 'Remplacer pour ce jour-là'}
      hint={
        mode === 'cancel'
          ? "Seul ce jour est annulé : le gabarit continue les autres jours. L'administrateur doit accepter."
          : 'Seul ce jour change : le gabarit garde les agents habituels pour les autres jours.'
      }
      onClose={onClose}
      onSubmit={submit}
      submitLabel={mode === 'cancel' ? 'Envoyer la demande' : 'Enregistrer'}
      submitting={submitting}
      canSubmit={valid}
      error={error}
    >
      {occurrence ? (
        <Text style={styles.context}>
          {occurrence.siteName} · {formatDayLong(occurrence.date)} · {occurrence.startTime} – {occurrence.endTime}
        </Text>
      ) : null}
      {mode === 'replace' ? <AgentPicker agents={agents} selected={agentIds} onChange={setAgentIds} /> : null}
      <View style={styles.group}>
        <Text style={styles.label}>{mode === 'cancel' ? 'Motif (obligatoire)' : 'Motif (facultatif)'}</Text>
        <TextInput
          accessibilityLabel="Motif"
          value={reason}
          onChangeText={setReason}
          multiline
          style={styles.textarea}
          placeholder={mode === 'cancel' ? 'Ex. site fermé ce jour-là' : "Ex. absence de l'agent habituel"}
        />
      </View>
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  context: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.ink },
  group: { gap: 8 },
  label: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  textarea: {
    minHeight: 80,
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
