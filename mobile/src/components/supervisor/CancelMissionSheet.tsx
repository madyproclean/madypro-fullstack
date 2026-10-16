import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Intervention } from '@/types/intervention';
import { requestMissionCancel } from '@/services/api/supervision.api';
import { FormSheet } from './FormSheet';
import { formatDayLong } from './format';

type Props = {
  /** Mission à annuler ; `null` : fiche fermée. */
  mission: Intervention | null;
  onClose: () => void;
  onSent?: () => void;
};

const HINT = "Votre demande sera envoyée à l'administrateur, qui l'approuvera ou la refusera. Suivez-la dans Validations › Mes demandes.";

/**
 * Demande d'annulation ponctuelle d'une mission (ex. site fermé ce jour-là) : seule action encore
 * possible sur une mission créée. Créer, déplacer ou réaffecter passe par le gabarit du site.
 */
export const CancelMissionSheet: React.FC<Props> = ({ mission, onClose, onSent }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulaire vierge à chaque ouverture.
  useEffect(() => {
    if (!mission) return;
    setReason('');
    setError(null);
  }, [mission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = reason.trim().length >= 3;

  const submit = async () => {
    if (!token || !mission || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestMissionCancel(token, mission.id, reason.trim());
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
      visible={mission !== null}
      title="Annuler la mission"
      hint={HINT}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Envoyer la demande"
      submitting={submitting}
      canSubmit={valid}
      error={error}
    >
      {mission ? (
        <Text style={styles.context}>
          {mission.siteName} · {formatDayLong(mission.date)} · {mission.startTime} – {mission.endTime}
        </Text>
      ) : null}
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
