import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Intervention } from '@/types/intervention';
import { AgentOption, SupervisedSite } from '@/types/supervision';
import {
  listActiveAgents,
  listSupervisedSites,
  requestMissionCancel,
  requestMissionChange,
  requestMissionCreate,
} from '@/services/api/supervision.api';
import { FormSheet } from './FormSheet';
import { DateTimeField } from './DateTimeField';
import { AgentPicker } from './AgentPicker';
import { formatDayLong, toISODate } from './format';

export type MissionRequestKind = 'reschedule' | 'agents' | 'cancel' | 'create';

type Props = {
  kind: MissionRequestKind | null;
  /** Mission concernée (absente pour une création). */
  mission?: Intervention | null;
  /** Agent pré-sélectionné (ex. remplaçant proposé après une absence). */
  initialAgentIds?: string[];
  onClose: () => void;
  onSent?: () => void;
};

const TITLES: Record<MissionRequestKind, string> = {
  reschedule: 'Déplacer la mission',
  agents: 'Changer les agents',
  cancel: 'Annuler la mission',
  create: 'Nouvelle mission',
};

const HINT = "Votre demande sera envoyée à l'administrateur, qui l'approuvera ou la refusera. Suivez-la dans Validations › Mes demandes.";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Formulaires de demande de changement de planning (le superviseur propose, l'administrateur décide). */
export const MissionRequestSheet: React.FC<Props> = ({ kind, mission, initialAgentIds, onClose, onSent }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [nature, setNature] = useState('');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [sites, setSites] = useState<SupervisedSite[]>([]);
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
    setNature('');
    setDate(mission?.date ?? toISODate(new Date()));
    setStartTime(mission?.startTime ?? '08:00');
    setEndTime(mission?.endTime ?? '10:00');
    setAgentIds(initialAgentIds ?? mission?.agentIds ?? []);
    setSiteId(mission?.siteId ?? null);
    if (!token) return;
    if (kind === 'agents' || kind === 'create') listActiveAgents(token).then(setAgents).catch(() => setAgents([]));
    if (kind === 'create') {
      listSupervisedSites(token)
        .then((list) => {
          setSites(list);
          if (list.length === 1) setSiteId(list[0].id);
        })
        .catch(() => setSites([]));
    }
  }, [kind, mission?.id, token]);

  const validation = useMemo(() => {
    if (!kind) return null;
    if (kind === 'cancel') return reason.trim().length < 3 ? 'Indiquez le motif de l’annulation.' : null;
    if (kind === 'agents') {
      const current = [...(mission?.agentIds ?? [])].sort().join();
      return [...agentIds].sort().join() === current ? 'Modifiez la liste des agents.' : null;
    }
    if (!DATE_RE.test(date)) return 'Date au format AAAA-MM-JJ.';
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return 'Heures au format HH:MM.';
    if (endTime <= startTime) return "L'heure de fin doit être après l'heure de début.";
    if (kind === 'create' && !siteId) return 'Choisissez un site.';
    if (kind === 'create' && nature.trim().length < 2) return 'Indiquez la nature de la mission.';
    if (kind === 'reschedule' && mission && date === mission.date && startTime === mission.startTime && endTime === mission.endTime)
      return 'Modifiez la date ou les heures.';
    return null;
  }, [kind, reason, nature, date, startTime, endTime, siteId, agentIds, mission]);

  const submit = async () => {
    if (!token || !kind || validation) return;
    setSubmitting(true);
    setError(null);
    try {
      if (kind === 'reschedule' && mission) await requestMissionChange(token, mission.id, { date, startTime, endTime });
      if (kind === 'agents' && mission) await requestMissionChange(token, mission.id, { agentIds });
      if (kind === 'cancel' && mission) await requestMissionCancel(token, mission.id, reason.trim());
      if (kind === 'create' && siteId)
        await requestMissionCreate(token, { siteId, date, startTime, endTime, agentIds, type: 'PUNCTUAL', subType: nature.trim() });
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

      {kind === 'create' ? (
        <View style={styles.group}>
          <Text style={styles.label}>Site</Text>
          <View style={styles.choices}>
            {sites.map((site) => (
              <Pressable
                key={site.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: site.id === siteId }}
                onPress={() => edit(setSiteId)(site.id)}
                style={[styles.choice, site.id === siteId && styles.choiceActive]}
              >
                <Text style={[styles.choiceText, site.id === siteId && styles.choiceTextActive]}>{site.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {kind === 'create' ? (
        <View style={styles.group}>
          <Text style={styles.label}>Nature de la mission (obligatoire)</Text>
          <TextInput
            accessibilityLabel="Nature de la mission"
            value={nature}
            onChangeText={edit(setNature)}
            style={styles.input}
            placeholder="Ex. vitrerie, remise en état après travaux"
          />
        </View>
      ) : null}

      {kind === 'reschedule' || kind === 'create' ? (
        <View style={styles.row}>
          <DateTimeField label="Date" mode="date" value={date} onChange={edit(setDate)} />
          <DateTimeField label="Début" mode="time" value={startTime} onChange={edit(setStartTime)} />
          <DateTimeField label="Fin" mode="time" value={endTime} onChange={edit(setEndTime)} />
        </View>
      ) : null}

      {kind === 'agents' || kind === 'create' ? <AgentPicker agents={agents} selected={agentIds} onChange={edit(setAgentIds)} /> : null}

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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  group: { gap: 8 },
  label: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    justifyContent: 'center',
  },
  choiceActive: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  choiceText: { fontFamily: theme.fonts.bodySemiBold, fontSize: 15, color: theme.colors.ink },
  choiceTextActive: { color: '#fff' },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    paddingHorizontal: 14,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.ink,
  },
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
