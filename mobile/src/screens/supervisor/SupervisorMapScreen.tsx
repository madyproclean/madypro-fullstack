import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useLayout } from '@/hooks/useLayout';
import { useFocusPolling } from '@/hooks/useFocusPolling';
import { formatSavedAt, loadWithCache } from '@/services/supervisorCache';
import { StatusPill } from '@/components/ui/StatusPill';
import { ScreenHeader } from '@/components/supervisor/ScreenHeader';
import { Initials, ListRow } from '@/components/supervisor/ListRow';
import { SupervisionMap } from '@/components/supervisor/SupervisionMap';
import { MARKER_LIVE, MARKER_STALE } from '@/components/supervisor/mapColors';
import { formatAgo, formatClock, STALE_SIGNAL_MINUTES } from '@/components/supervisor/format';
import { getLiveAgents, listSupervisedSites } from '@/services/api/supervision.api';
import { LiveAgent, SupervisedSite } from '@/types/supervision';
import { SupervisorTabParamList } from '@/navigation/types';

type Props = BottomTabScreenProps<SupervisorTabParamList, 'SupervisorMap'>;

const isStale = (agent: LiveAgent) => Date.now() - new Date(agent.lastSeenAt).getTime() > STALE_SIGNAL_MINUTES * 60_000;

export default function SupervisorMapScreen({ navigation }: Props) {
  const { token, user } = useAuthContext();
  const { isWide } = useLayout();
  const [sites, setSites] = useState<SupervisedSite[]>([]);
  const [agents, setAgents] = useState<LiveAgent[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    try {
      // Seuls les sites sont gardés hors ligne : d'anciennes positions d'agents induiraient en erreur.
      const sitesResult = await loadWithCache(user?.id, 'sites', () => listSupervisedSites(token), (cached) =>
        setSites(cached.value),
      );
      setSites(sitesResult.value);
      if (sitesResult.fromCache) {
        setAgents([]);
        setUpdatedAt(formatSavedAt(sitesResult.savedAt));
        setError('Hors ligne');
        return;
      }
      setAgents(await getLiveAgents(token));
      setUpdatedAt(formatClock(new Date().toISOString()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la carte.');
    } finally {
      inFlight.current = false;
    }
  }, [token, user?.id]);

  useFocusPolling(load);

  // Signal le plus récent d'abord, signaux anciens en fin de liste.
  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const staleDiff = Number(isStale(a)) - Number(isStale(b));
        return staleDiff || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      }),
    [agents],
  );

  const list = (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.count}>
        {agents.length} agent{agents.length > 1 ? 's' : ''} en mission
      </Text>
      {sortedAgents.length === 0 ? (
        <Text style={styles.empty}>
          Aucun agent n'a envoyé de position depuis 30 minutes sur vos sites.
        </Text>
      ) : (
        sortedAgents.map((agent) => {
          const stale = isStale(agent);
          return (
            <ListRow
              key={agent.userId}
              title={agent.agentName}
              subtitle={`${agent.siteName} · signal ${formatAgo(agent.lastSeenAt)}`}
              selected={agent.userId === selectedId}
              onPress={() => setSelectedId(agent.userId)}
              accessibilityHint="Centre la carte sur cet agent"
              leading={<Initials name={agent.agentName} />}
              trailing={<StatusPill strong label={stale ? 'Signal ancien' : 'Sur place'} tone={stale ? 'warning' : 'success'} />}
            />
          );
        })
      )}
    </ScrollView>
  );

  const selected = agents.find((a) => a.userId === selectedId);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Carte" subtitle="Où sont vos agents en ce moment" updatedAt={updatedAt} onRefresh={load} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error === 'Hors ligne'
            ? 'Positions des agents indisponibles hors ligne : seuls vos sites sont affichés.'
            : updatedAt
              ? 'Mise à jour impossible : positions de la dernière mise à jour.'
              : error}
        </Text>
      ) : null}
      <View style={[styles.body, !isWide && styles.bodyStacked]}>
        <View style={isWide ? styles.listPane : styles.listPaneStacked}>{list}</View>
        <View style={styles.mapPane}>
          <SupervisionMap sites={sites} agents={agents} selectedAgentId={selectedId} onSelectAgent={(a) => setSelectedId(a.userId)} />
          <View style={styles.legend}>
            <Legend color={theme.colors.primaryDark} square label="Site" />
            <Legend color={MARKER_LIVE} label="Agent sur place" />
            <Legend color={MARKER_STALE} label={`Signal de plus de ${STALE_SIGNAL_MINUTES} min`} />
            {selected ? (
              <Text
                accessibilityRole="link"
                onPress={() => navigation.navigate('SupervisorMissions', { interventionId: selected.interventionId })}
                style={styles.link}
              >
                Voir la mission de {selected.agentName}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const Legend: React.FC<{ color: string; label: string; square?: boolean }> = ({ color, label, square }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color, borderRadius: square ? 4 : 8 }]} />
    <Text style={styles.legendText}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 32, gap: 20, backgroundColor: theme.colors.cream },
  error: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
  body: { flex: 1, flexDirection: 'row', gap: 20 },
  bodyStacked: { flexDirection: 'column-reverse' },
  listPane: { width: 340 },
  listPaneStacked: { maxHeight: 280 },
  list: { gap: 10, paddingBottom: 12 },
  count: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  empty: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted, paddingVertical: 12 },
  mapPane: { flex: 1, gap: 12, minHeight: 320 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 16, height: 16 },
  legendText: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  link: { fontFamily: theme.fonts.bodySemiBold, fontSize: 15, color: theme.colors.primaryDark, marginLeft: 'auto', paddingVertical: 12 },
});
