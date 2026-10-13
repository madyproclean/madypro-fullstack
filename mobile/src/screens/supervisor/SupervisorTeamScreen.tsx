import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useFocusPolling } from '@/hooks/useFocusPolling';
import { StatusPill } from '@/components/ui/StatusPill';
import { ScreenHeader } from '@/components/supervisor/ScreenHeader';
import { Initials, ListRow } from '@/components/supervisor/ListRow';
import { Segmented } from '@/components/supervisor/Segmented';
import { SplitView } from '@/components/supervisor/SplitView';
import { detailStyles } from '@/components/supervisor/DetailBlocks';
import { AgentFileDetail, agentDayLabel } from '@/components/supervisor/AgentFileDetail';
import { SiteFileDetail } from '@/components/supervisor/SiteFileDetail';
import { formatClock } from '@/components/supervisor/format';
import { getTeam, listSupervisedSites } from '@/services/api/supervision.api';
import { SupervisedSite, TeamAgent } from '@/types/supervision';
import { SupervisorTabParamList } from '@/navigation/types';

type Props = BottomTabScreenProps<SupervisorTabParamList, 'SupervisorTeam'>;
type Tab = 'agents' | 'sites';

// Recherche insensible aux accents et à la casse (« nadege » trouve « Nadège »).
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export default function SupervisorTeamScreen({ route, navigation }: Props) {
  const { token } = useAuthContext();
  const [tab, setTab] = useState<Tab>('agents');
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [sites, setSites] = useState<SupervisedSite[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Ouverture directe d'une fiche (depuis une autre rubrique).
  const { agentId, siteId } = route.params ?? {};
  useEffect(() => {
    if (agentId) {
      setTab('agents');
      setSelectedAgent(agentId);
    } else if (siteId) {
      setTab('sites');
      setSelectedSite(siteId);
    } else return;
    navigation.setParams({ agentId: undefined, siteId: undefined });
  }, [agentId, siteId, navigation]);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    try {
      const [nextAgents, nextSites] = await Promise.all([getTeam(token), listSupervisedSites(token)]);
      setAgents(nextAgents);
      setSites([...nextSites].sort((a, b) => a.name.localeCompare(b.name, 'fr')));
      setUpdatedAt(formatClock(new Date().toISOString()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger l'équipe.");
    } finally {
      inFlight.current = false;
    }
  }, [token]);

  useFocusPolling(load, 60_000);

  const query = normalize(search.trim());
  const visibleAgents = agents.filter((a) => !query || normalize(a.name).includes(query));
  const visibleSites = sites.filter((s) => !query || normalize(`${s.name} ${s.address}`).includes(query));

  const openAgent = (id: string) => {
    setTab('agents');
    setSelectedAgent(id);
  };
  const openSite = (id: string) => {
    setTab('sites');
    setSelectedSite(id);
  };
  const openMission = (interventionId: string) => navigation.navigate('SupervisorMissions', { interventionId });

  const agentList = (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      {visibleAgents.length === 0 ? (
        <Text style={styles.empty}>{query ? 'Aucun agent ne correspond.' : 'Aucun agent sur vos sites.'}</Text>
      ) : null}
      {visibleAgents.map((agent) => {
        const day = agentDayLabel(agent.today);
        return (
          <ListRow
            key={agent.id}
            title={agent.name}
            subtitle={day.detail}
            selected={agent.id === selectedAgent}
            onPress={() => setSelectedAgent(agent.id)}
            leading={<Initials name={agent.name} />}
            below={
              <>
                <StatusPill label={day.label} tone={day.tone} />
                {agent.expiringCertifications ? <StatusPill label="Certification à renouveler" tone="warning" /> : null}
              </>
            }
          />
        );
      })}
    </ScrollView>
  );

  const siteList = (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      {visibleSites.length === 0 ? (
        <Text style={styles.empty}>{query ? 'Aucun site ne correspond.' : "Aucun site ne vous est confié."}</Text>
      ) : null}
      {visibleSites.map((site) => (
        <ListRow
          key={site.id}
          title={site.name}
          subtitle={site.address}
          selected={site.id === selectedSite}
          onPress={() => setSelectedSite(site.id)}
          leading={
            <View style={styles.siteIcon}>
              <Ionicons name="business-outline" size={22} color={theme.colors.primaryDark} />
            </View>
          }
        />
      ))}
    </ScrollView>
  );

  const isAgents = tab === 'agents';
  const selectedAgentName = agents.find((a) => a.id === selectedAgent)?.name;
  const selectedSiteName = sites.find((s) => s.id === selectedSite)?.name;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Équipe et sites"
        subtitle={`${agents.length} agent${agents.length > 1 ? 's' : ''} · ${sites.length} site${sites.length > 1 ? 's' : ''}`}
        updatedAt={updatedAt}
        onRefresh={load}
        right={
          <Segmented
            accessibilityLabel="Rubrique"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'agents', label: 'Agents' },
              { value: 'sites', label: 'Sites' },
            ]}
          />
        }
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {updatedAt ? 'Mise à jour impossible : liste de la dernière mise à jour.' : error}
        </Text>
      ) : null}
      <View style={styles.search}>
        <Ionicons name="search" size={20} color={theme.colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={isAgents ? 'Rechercher un agent' : 'Rechercher un site ou une adresse'}
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel={isAgents ? 'Rechercher un agent' : 'Rechercher un site'}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>
      {isAgents ? (
        <SplitView
          list={agentList}
          detail={
            selectedAgent ? (
              <AgentFileDetail
                agentId={selectedAgent}
                onMessage={(id) => navigation.navigate('SupervisorMessages', { threadUserId: id })}
                onOpenMission={openMission}
                onOpenAbsence={(absenceId) => navigation.navigate('SupervisorValidations', { absenceId })}
                onOpenSite={openSite}
              />
            ) : null
          }
          detailTitle={selectedAgentName}
          onCloseDetail={() => setSelectedAgent(null)}
          emptyDetail={
            <View style={detailStyles.placeholder}>
              <Ionicons name="people-outline" size={36} color={theme.colors.muted} />
              <Text style={styles.empty}>Choisissez un agent pour voir sa fiche.</Text>
            </View>
          }
        />
      ) : (
        <SplitView
          list={siteList}
          detail={
            selectedSite ? <SiteFileDetail siteId={selectedSite} onOpenAgent={openAgent} onOpenMission={openMission} /> : null
          }
          detailTitle={selectedSiteName}
          onCloseDetail={() => setSelectedSite(null)}
          emptyDetail={
            <View style={detailStyles.placeholder}>
              <Ionicons name="business-outline" size={36} color={theme.colors.muted} />
              <Text style={styles.empty}>Choisissez un site pour voir sa fiche.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 32, gap: 16, backgroundColor: theme.colors.cream },
  list: { gap: 10, paddingBottom: 16 },
  empty: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted, textAlign: 'center', paddingVertical: 12 },
  error: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    maxWidth: 520,
  },
  searchInput: { flex: 1, fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.ink, minHeight: 48 },
  siteIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
