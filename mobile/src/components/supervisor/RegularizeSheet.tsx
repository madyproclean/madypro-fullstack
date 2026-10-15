import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { regularizeAttendance } from '@/services/api/supervision.api';
import { FormSheet } from './FormSheet';
import { DateTimeField } from './DateTimeField';

export type RegularizeTarget = {
  attendanceId: string;
  agentName: string;
  /** Heures connues (HH:MM) ou heures prévues de la mission pour pré-remplir. */
  checkInTime: string;
  checkOutTime: string;
};

type Props = { target: RegularizeTarget | null; onClose: () => void; onDone?: () => void };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Correction d'un pointage oublié (badge en panne, téléphone déchargé…), motif obligatoire. */
export const RegularizeSheet: React.FC<Props> = ({ target, onClose, onDone }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setStart(target.checkInTime);
    setEnd(target.checkOutTime);
    setReason('');
    setError(null);
  }, [target]);

  const valid = TIME_RE.test(start) && TIME_RE.test(end) && reason.trim().length >= 3;

  const submit = async () => {
    if (!token || !target || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await regularizeAttendance(token, target.attendanceId, { checkInTime: start, checkOutTime: end, reason: reason.trim() });
      showToast('Pointage corrigé', `${target.agentName} : ${start} – ${end}`, 'success');
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La correction n'a pas pu être enregistrée.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormSheet
      visible={target !== null}
      title={`Corriger le pointage · ${target?.agentName ?? ''}`}
      hint="La correction et son motif sont gardés dans l'historique."
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Enregistrer"
      submitting={submitting}
      canSubmit={valid}
      error={error}
    >
      <View style={styles.row}>
        <DateTimeField label="Début" mode="time" value={start} onChange={setStart} />
        <DateTimeField label="Fin" mode="time" value={end} onChange={setEnd} />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={styles.label}>Motif (obligatoire)</Text>
        <TextInput
          accessibilityLabel="Motif de la correction"
          value={reason}
          onChangeText={setReason}
          placeholder="Ex. : téléphone déchargé, présence confirmée par le client"
          multiline
          style={styles.input}
        />
      </View>
    </FormSheet>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  label: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  input: {
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
