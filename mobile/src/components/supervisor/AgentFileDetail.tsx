import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { formatSavedAt, loadWithCache } from '@/services/supervisorCache';
import { StatusPill, StatusTone } from '@/components/ui/StatusPill';
import { getAgentFile } from '@/services/api/supervision.api';
import { AgentDay, AgentFile } from '@/types/supervision';
import { ABSENCE_LABELS } from './AbsenceDetail';
import { ActionButton, DetailSection, detailStyles as styles, InfoLine } from './DetailBlocks';
import { callPhone, formatMinutes, sendSms } from './contact';
import { formatDayShort, toISODate } from './format';
import { Initials } from './ListRow';

/** Situation du jour en langage courant, avec le créneau concerné. */
export const agentDayLabel = (day: AgentDay): { label: string; tone: StatusTone; detail?: string } => {
  const slot = day.siteName ? `${day.startTime}–${day.endTime} · ${day.siteName}` : undefined;
  switch (day.status) {
    case 'ON_SITE':
      return { label: 'Sur place', tone: 'success', detail: slot };
    case 'LATE':
      return { label: 'Pas encore pointé', tone: 'danger', detail: slot };
    case 'PLANNED':
      return { label: 'Mission à venir', tone: 'info', detail: slot };
    case 'DONE':
      return { label: 'Journée terminée', tone: 'neutral', detail: slot };
    case 'ABSENT':
      return { label: 'Absent', tone: 'warning' };
    default:
      return { label: 'Pas de mission aujourd’hui', tone: 'neutral' };
  }
};

const ABSENCE_STATUS: Record<AgentFile['absences'][number]['status'], { label: string; tone: StatusTone }> = {
  PENDING: { label: 'À valider', tone: 'warning' },
  APPROVED: { label: 'Approuvée', tone: 'success' },
  REJECTED: { label: 'Refusée', tone: 'danger' },
};

// Avec l'année : une certification court souvent sur plusieurs années.
const formatDateWithYear = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Certification expirée, bientôt expirée (30 jours) ou valide. */
const certificationState = (expiresAt: string | null, today: string): { label: string; tone: StatusTone } | null => {
  if (!expiresAt) return null;
  if (expiresAt < today) return { label: 'Expirée', tone: 'danger' };
  const soon = toISODate(new Date(Date.now() + 30 * 86_400_000));
  return expiresAt <= soon ? { label: 'Expire bientôt', tone: 'warning' } : { label: 'Valide', tone: 'success' };
};

type Props = {
  agentId: string;
  onMessage: (agentId: string) => void;
  onOpenMission: (interventionId: string) => void;
  onOpenAbsence: (absenceId: string) => void;
  onOpenSite: (siteId: string) => void;
};

/** Fiche agent : appel, SMS, message, situation du jour, heures, certifications, missions, absences. */
export const AgentFileDetail: React.FC<Props> = ({ agentId, onMessage, onOpenMission, onOpenAbsence, onOpenSite }) => {
  const { token, user } = useAuthContext();
  const [file, setFile] = useState<AgentFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Renseigné quand la fiche affichée vient du cache (hors ligne). */
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await loadWithCache(user?.id, `agent:${agentId}`, () => getAgentFile(token, agentId));
      setFile(result.value);
      setSavedAt(result.fromCache ? result.savedAt : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la fiche.');
    }
  }, [token, agentId, user?.id]);

  useEffect(() => {
    setFile(null);
    setActionError(null);
    load();
  }, [load]);

  if (!file) {
    return (
      <View style={[styles.card, styles.center]}>
        {error ? <Text style={styles.errorText}>{error}</Text> : <ActivityIndicator color={theme.colors.primary} size="large" />}
      </View>
    );
  }

  const today = toISODate(new Date());
  const day = agentDayLabel(file.today);
  const phone = file.phone;
  const failed = (what: string) => () => setActionError(`Impossible ${what} sur cet appareil. Numéro : ${phone}`);

  return (
    <View style={styles.card}>
      <ScrollView contentContainerStyle={styles.content}>
        {savedAt ? (
          <Text accessibilityRole="alert" style={styles.offline}>
            Hors ligne : fiche telle qu'enregistrée le {formatSavedAt(savedAt)}.
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Initials name={file.name} size={60} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.title}>{file.name}</Text>
            <View style={{ flexDirection: 'row' }}>
              <StatusPill strong label={day.label} tone={day.tone} />
            </View>
            {day.detail ? <Text style={styles.muted}>{day.detail}</Text> : null}
          </View>
        </View>

        <View style={styles.actions}>
          <ActionButton
            primary
            label="Appeler"
            icon="call-outline"
            disabled={!phone}
            accessibilityLabel={`Appeler ${file.name}`}
            onPress={() => phone && callPhone(phone).catch(failed("de lancer l'appel"))}
          />
          <ActionButton
            label="SMS"
            icon="chatbox-ellipses-outline"
            disabled={!phone}
            accessibilityLabel={`Envoyer un SMS à ${file.name}`}
            onPress={() => phone && sendSms(phone).catch(failed("d'ouvrir les SMS"))}
          />
          <ActionButton label="Message" icon="chatbubble-outline" onPress={() => onMessage(file.id)} />
        </View>
        {actionError ? <Text accessibilityRole="alert" style={styles.errorText}>{actionError}</Text> : null}

        <DetailSection title="Coordonnées">
          <InfoLine icon="call-outline" label="Téléphone" value={phone ?? 'Non renseigné'} />
          <InfoLine icon="mail-outline" label="Adresse e-mail" value={file.email} />
        </DetailSection>

        <DetailSection title="Heures sur vos sites">
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {(
              [
                ['Cette semaine', file.hours.week],
                ['Ce mois-ci', file.hours.month],
              ] as const
            ).map(([label, h]) => (
              <View
                key={label}
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: theme.colors.cream,
                  gap: 4,
                }}
              >
                <Text style={styles.muted}>{label}</Text>
                <Text style={[styles.bold, { fontSize: 22 }]}>{formatMinutes(h.worked)} pointées</Text>
                <Text style={styles.muted}>sur {formatMinutes(h.planned)} prévues</Text>
              </View>
            ))}
          </View>
        </DetailSection>

        <DetailSection title="Prochaines missions (14 jours)">
          {file.upcoming.length === 0 ? <Text style={styles.muted}>Aucune mission prévue sur vos sites.</Text> : null}
          {file.upcoming.map((m) => (
            <Pressable
              key={m.interventionId}
              accessibilityRole="button"
              accessibilityHint="Ouvre la mission"
              onPress={() => onOpenMission(m.interventionId)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.rowText}>
                <Text style={styles.bold}>
                  {formatDayShort(m.date)} · {m.startTime}–{m.endTime}
                </Text>
                <Text style={styles.muted}>{m.siteName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} />
            </Pressable>
          ))}
        </DetailSection>

        <DetailSection title="Absences en cours ou à venir">
          {file.absences.length === 0 ? <Text style={styles.muted}>Aucune.</Text> : null}
          {file.absences.map((a) => {
            const status = ABSENCE_STATUS[a.status] ?? ABSENCE_STATUS.PENDING;
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityHint="Ouvre l'absence dans Validations"
                onPress={() => onOpenAbsence(a.id)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.bold}>{ABSENCE_LABELS[a.type] ?? 'Absence'}</Text>
                  <Text style={styles.muted}>
                    {formatDayShort(a.from)} au {formatDayShort(a.to)}
                  </Text>
                </View>
                <StatusPill strong label={status.label} tone={status.tone} />
              </Pressable>
            );
          })}
        </DetailSection>

        <DetailSection title="Certifications">
          {file.certifications.length === 0 ? <Text style={styles.muted}>Aucune certification enregistrée.</Text> : null}
          {file.certifications.map((c) => {
            const state = certificationState(c.expiresAt, today);
            return (
              <View key={c.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.bold}>{c.label}</Text>
                  <Text style={styles.muted}>
                    {c.expiresAt
                      ? `${c.expiresAt < today ? 'Expirée le' : "Valable jusqu'au"} ${formatDateWithYear(c.expiresAt)}`
                      : 'Sans date de fin'}
                  </Text>
                </View>
                {state ? <StatusPill strong label={state.label} tone={state.tone} /> : null}
              </View>
            );
          })}
        </DetailSection>

        {file.sites.length ? (
          <DetailSection title="Travaille sur">
            <View style={styles.actions}>
              {file.sites.map((s) => (
                <ActionButton key={s.id} label={s.name} icon="business-outline" onPress={() => onOpenSite(s.id)} />
              ))}
            </View>
          </DetailSection>
        ) : null}
      </ScrollView>
    </View>
  );
};
