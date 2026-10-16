import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useSyncContext } from '@/context/SyncContext';
import { agentCache } from '@/services/agentCache';
import {
  InterventionChecklistItem,
  listInterventionChecklist,
} from '@/services/api/interventions.api';

type InterventionChecklistProps = {
  interventionId: string;
};

export const InterventionChecklist: React.FC<InterventionChecklistProps> = ({ interventionId }) => {
  const { token, user } = useAuthContext();
  const { queueEvent, pendingEvents } = useSyncContext();
  const [items, setItems] = React.useState<InterventionChecklistItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // Gardée sur le téléphone : la checklist reste lisible et cochable sans réseau.
    agentCache
      .loadWithCache(user?.id, `checklist:${interventionId}`, () => listInterventionChecklist(token, interventionId))
      .then(({ value }) => {
        if (cancelled) return;
        // Les cases cochées hors ligne et pas encore envoyées gardent leur nouvel état.
        const queued = new Map(
          pendingEvents
            .filter((e) => e.type === 'CHECKLIST' && e.interventionId === interventionId && e.checklistItemId)
            .map((e) => [e.checklistItemId as string, Boolean(e.done)]),
        );
        setItems(value.map((i) => (queued.has(i.id) ? { ...i, done: queued.get(i.id)! } : i)));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, interventionId]);

  const toggle = async (item: InterventionChecklistItem) => {
    if (!token) return;
    setPendingId(item.id);
    const nextDone = !item.done;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: nextDone } : i)));
    try {
      await queueEvent({
        userId: user?.id ?? '',
        interventionId,
        siteId: '',
        type: 'CHECKLIST',
        timestamp: new Date().toISOString(),
        checklistItemId: item.id,
        done: nextDone,
      });
      const next = items.map((i) => (i.id === item.id ? { ...i, done: nextDone } : i));
      if (user?.id) agentCache.writeCache(user.id, `checklist:${interventionId}`, next);
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)));
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) {
    return <ActivityIndicator color={theme.colors.primary} />;
  }

  if (!items.length) {
    return (
      <Text style={styles.empty}>
        Aucune checklist définie pour ce site. Suivez les consignes partagées par votre équipe.
      </Text>
    );
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <View style={styles.list}>
      <Text style={styles.progress}>
        {doneCount}/{items.length} tâches réalisées
      </Text>
      {items.map((item) => (
        <TouchableOpacity key={item.id} style={styles.row} onPress={() => toggle(item)} disabled={pendingId === item.id}>
          <Ionicons
            name={item.done ? 'checkbox' : 'square-outline'}
            size={22}
            color={item.done ? theme.colors.primary : theme.colors.muted}
          />
          <Text style={[styles.label, item.done && styles.labelDone]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.sm,
  },
  progress: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.bodySemiBold,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  label: {
    color: theme.colors.ink,
    flexShrink: 1,
  },
  labelDone: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  empty: {
    color: theme.colors.muted,
    fontStyle: 'italic',
  },
});
