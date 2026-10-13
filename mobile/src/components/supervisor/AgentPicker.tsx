import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { AgentOption } from '@/types/supervision';

type Props = {
  agents: AgentOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
};

/** Choix multiple d'agents : sélectionnés en tête, recherche par nom, 8 suggestions max affichées. */
export const AgentPicker: React.FC<Props> = ({ agents, selected, onChange }) => {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents
      .filter((a) => !selected.includes(a.id))
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [agents, selected, query]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Agents</Text>
      <View style={styles.chips}>
        {selected.length === 0 ? <Text style={styles.muted}>Aucun agent.</Text> : null}
        {selected.map((id) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${byId.get(id)?.name ?? 'cet agent'}`}
            onPress={() => toggle(id)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{byId.get(id)?.name ?? 'Agent'}</Text>
            <Ionicons name="close" size={16} color={theme.colors.primaryDark} />
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Rechercher un agent"
        placeholder="Rechercher un agent"
        value={query}
        onChangeText={setQuery}
        style={styles.search}
      />
      {matches.map((agent) => (
        <Pressable
          key={agent.id}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter ${agent.name}`}
          onPress={() => toggle(agent.id)}
          style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.optionText}>{agent.name}</Text>
          <Ionicons name="add" size={20} color={theme.colors.primaryDark} />
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  muted: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
  },
  chipText: { fontFamily: theme.fonts.bodySemiBold, fontSize: 15, color: theme.colors.primaryDark },
  search: {
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
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  optionText: { fontFamily: theme.fonts.body, fontSize: 16, color: theme.colors.ink },
});
