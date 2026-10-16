import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { getDaySummary } from '@/services/api/supervision.api';
import { DaySummary } from '@/types/supervision';
import { FormSheet } from './FormSheet';
import { ABSENCE_LABELS } from './AbsenceDetail';
import { formatDayLong } from './format';

type Props = { visible: boolean; onClose: () => void; onOpenMission?: (id: string) => void };

/** Bilan de la journée en un écran : ce qui est fait, ce qui reste, ce qui a posé problème. */
export const DaySummarySheet: React.FC<Props> = ({ visible, onClose, onOpenMission }) => {
  const { token } = useAuthContext();
  const [data, setData] = useState<DaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !token) return;
    setError(null);
    getDaySummary(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Bilan indisponible.'));
  }, [visible, token]);

  const tiles: Array<[string, string | number, string]> = data
    ? [
        ['Missions faites', `${data.missions.completed + data.missions.toValidate} / ${data.missions.total}`, theme.colors.status.onTime],
        ['À valider', data.missions.toValidate, theme.colors.status.late],
        ['Non faites', data.missions.notDone, theme.colors.status.absent],
        ['À l’heure', data.punctuality.onTimeRate === null ? '—' : `${data.punctuality.onTimeRate} %`, theme.colors.primaryDark],
        ['Heures faites', `${data.hours.worked} h / ${data.hours.planned} h`, theme.colors.ink],
        ['Anomalies', data.anomalyCount.open ? `${data.anomalyCount.open} ouverte(s)` : data.anomalyCount.total, theme.colors.ink],
      ]
    : [];

  return (
    <FormSheet
      visible={visible}
      title="Bilan du jour"
      hint={data ? formatDayLong(data.date) : undefined}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Fermer"
      readOnly
      error={error}
    >
      {!data && !error ? <ActivityIndicator color={theme.colors.primary} /> : null}
      {data ? (
        <>
          <View style={styles.tiles}>
            {tiles.map(([label, value, color]) => (
              <View key={label} style={styles.tile} accessible accessibilityLabel={`${label} : ${value}`}>
                <Text style={[styles.tileValue, { color }]}>{value}</Text>
                <Text style={styles.muted}>{label}</Text>
              </View>
            ))}
          </View>
          <Block title="Retards" empty="Aucun retard.">
            {data.late.map((l, i) => (
              <Text key={i} style={styles.line}>
                {l.agentName} · {l.siteName} ({l.startTime}) · {l.minutesLate} min
              </Text>
            ))}
          </Block>
          <Block title="Missions non faites" empty="Aucune.">
            {data.notDone.map((m) => (
              <Text key={m.interventionId} style={[styles.line, styles.link]} onPress={() => onOpenMission?.(m.interventionId)}>
                {m.siteName} à {m.startTime} · {m.agents.join(', ') || 'aucun agent'}
              </Text>
            ))}
          </Block>
          <Block title="Encore à valider" empty="Tout est validé.">
            {data.toValidate.map((m) => (
              <Text key={m.interventionId} style={[styles.line, styles.link]} onPress={() => onOpenMission?.(m.interventionId)}>
                {m.siteName} · {m.startTime} – {m.endTime}
              </Text>
            ))}
          </Block>
          <Block title="Anomalies signalées" empty="Aucune anomalie.">
            {data.anomalies.map((a) => (
              <Text key={a.id} style={styles.line}>
                {a.siteName} · {a.title} · {a.agentName}
                {a.status === 'NEW' ? ' (à traiter)' : ''}
              </Text>
            ))}
          </Block>
          <Block title="Absents" empty="Personne.">
            {data.absences.map((a, i) => (
              <Text key={i} style={styles.line}>
                {a.agentName} · {ABSENCE_LABELS[a.type] ?? 'Absence'}
              </Text>
            ))}
          </Block>
        </>
      ) : null}
    </FormSheet>
  );
};

const Block: React.FC<{ title: string; empty: string; children: React.ReactNode[] }> = ({ title, empty, children }) => (
  <View style={{ gap: 6 }}>
    <Text accessibilityRole="header" style={styles.blockTitle}>
      {title}
    </Text>
    {children.length ? children : <Text style={styles.muted}>{empty}</Text>}
  </View>
);

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.shell,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 2,
  },
  tileValue: { fontFamily: theme.fonts.bodyBold, fontSize: 22 },
  blockTitle: { fontFamily: theme.fonts.bodyBold, fontSize: 17, color: theme.colors.ink },
  line: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.ink },
  link: { color: theme.colors.primaryDark, textDecorationLine: 'underline' },
  muted: { fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted },
});
