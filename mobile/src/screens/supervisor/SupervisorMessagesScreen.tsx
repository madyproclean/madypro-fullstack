import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useFocusPolling } from '@/hooks/useFocusPolling';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { formatSavedAt, loadWithCache } from '@/services/supervisorCache';
import { ScreenHeader } from '@/components/supervisor/ScreenHeader';
import { Initials, ListRow } from '@/components/supervisor/ListRow';
import { SplitView } from '@/components/supervisor/SplitView';
import { detailStyles } from '@/components/supervisor/DetailBlocks';
import { ChatConversation } from '@/components/supervisor/ChatConversation';
import { formatClock, formatDayShort, toISODate } from '@/components/supervisor/format';
import { getTeam, listChatThreads } from '@/services/api/supervision.api';
import { ChatThread, TeamAgent } from '@/types/supervision';
import { SupervisorTabParamList } from '@/navigation/types';

type Props = BottomTabScreenProps<SupervisorTabParamList, 'SupervisorMessages'>;

/** Heure si c'est aujourd'hui, sinon le jour. */
const formatWhen = (iso: string) => {
  const day = toISODate(new Date(iso));
  return day === toISODate(new Date()) ? formatClock(iso) : formatDayShort(day);
};

export default function SupervisorMessagesScreen({ route, navigation }: Props) {
  const { token, user } = useAuthContext();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [team, setTeam] = useState<TeamAgent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Ouverture directe d'une discussion (fiche agent, « Aujourd'hui » ou notification).
  const requestedId = route.params?.threadUserId;
  useEffect(() => {
    if (requestedId) {
      setSelectedId(requestedId);
      navigation.setParams({ threadUserId: undefined });
    }
  }, [requestedId, navigation]);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    try {
      const fetchAll = () => Promise.all([listChatThreads(token), getTeam(token)]);
      const apply = ([nextThreads, nextTeam]: Awaited<ReturnType<typeof fetchAll>>) => {
        setThreads(nextThreads);
        setTeam(nextTeam);
      };
      const result = await loadWithCache(user?.id, 'threads', fetchAll, (cached) => apply(cached.value));
      apply(result.value);
      setUpdatedAt(formatSavedAt(result.savedAt));
      setError(result.fromCache ? 'Hors ligne' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les messages.');
    } finally {
      inFlight.current = false;
    }
  }, [token, user?.id]);

  useFocusPolling(load, 20_000);
  const refreshControl = usePullToRefresh(load);

  const withThread = new Set(threads.map((t) => t.agent.id));
  const others = team.filter((a) => !withThread.has(a.id));
  const unread = threads.reduce((sum, t) => sum + t.unreadCount, 0);
  const selectedName =
    threads.find((t) => t.agent.id === selectedId)?.agent.name ?? team.find((a) => a.id === selectedId)?.name ?? 'Agent';

  const list = (
    <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl}>
      {threads.length === 0 ? <Text style={styles.empty}>Aucune discussion pour l'instant.</Text> : null}
      {threads.map((t) => {
        const mine = t.lastMessage.senderId !== t.agent.id;
        const preview = `${mine ? (t.lastMessage.senderId === user?.id ? 'Vous : ' : 'Encadrement : ') : ''}${t.lastMessage.body}`;
        return (
          <ListRow
            key={t.agent.id}
            title={t.agent.name}
            subtitle={preview}
            selected={t.agent.id === selectedId}
            onPress={() => setSelectedId(t.agent.id)}
            leading={<Initials name={t.agent.name} />}
            trailing={
              <View style={styles.trailing}>
                <Text style={styles.when}>{formatWhen(t.lastMessage.createdAt)}</Text>
                {t.unreadCount ? (
                  <View style={styles.badge} accessibilityLabel={`${t.unreadCount} non lu${t.unreadCount > 1 ? 's' : ''}`}>
                    <Text style={styles.badgeText}>{t.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            }
          />
        );
      })}
      {others.length ? (
        <>
          <Text style={styles.groupTitle}>Écrire à un autre agent</Text>
          {others.map((a) => (
            <ListRow
              key={a.id}
              title={a.name}
              subtitle="Nouvelle discussion"
              selected={a.id === selectedId}
              onPress={() => setSelectedId(a.id)}
              leading={<Initials name={a.name} />}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Messages"
        subtitle={unread ? `${unread} message${unread > 1 ? 's' : ''} non lu${unread > 1 ? 's' : ''}` : 'Discussions avec vos agents'}
        updatedAt={updatedAt}
        onRefresh={load}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {updatedAt ? 'Mise à jour impossible : liste de la dernière mise à jour.' : error}
        </Text>
      ) : null}
      <SplitView
        list={list}
        detail={
          selectedId ? (
            <ChatConversation
              agentId={selectedId}
              agentName={selectedName}
              onChanged={load}
              onOpenFile={(agentId) => navigation.navigate('SupervisorTeam', { agentId })}
            />
          ) : null
        }
        detailTitle={selectedName}
        onCloseDetail={() => setSelectedId(null)}
        emptyDetail={
          <View style={detailStyles.placeholder}>
            <Ionicons name="chatbubbles-outline" size={36} color={theme.colors.muted} />
            <Text style={styles.empty}>Choisissez une discussion.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 32, gap: 20, backgroundColor: theme.colors.cream },
  list: { gap: 10, paddingBottom: 16 },
  empty: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.muted, textAlign: 'center', paddingVertical: 12 },
  error: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.status.absent },
  groupTitle: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted, marginTop: 12 },
  trailing: { alignItems: 'flex-end', gap: 6 },
  when: { fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: theme.fonts.bodyBold, fontSize: 13, color: '#fff' },
});
