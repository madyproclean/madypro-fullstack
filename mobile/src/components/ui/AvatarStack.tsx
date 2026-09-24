import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/config/theme';
import { Avatar } from './Avatar';

type AvatarStackProps = {
  people: Array<{ id: string; name: string; uri?: string | null }>;
  max?: number;
  size?: 'sm' | 'md';
};

/** Groupe d'avatars superposés — "N agents assignés". */
export const AvatarStack: React.FC<AvatarStackProps> = ({ people, max = 4, size = 'sm' }) => {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;

  return (
    <View style={styles.row}>
      {visible.map((person, index) => (
        <View key={person.id} style={[styles.item, index > 0 && styles.overlap]}>
          <Avatar uri={person.uri} name={person.name} size={size} />
        </View>
      ))}
      {overflow > 0 && (
        <View style={[styles.item, styles.overlap, styles.more]}>
          <Text style={styles.moreText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: theme.colors.shell,
  },
  overlap: {
    marginLeft: -10,
  },
  more: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.clay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 11,
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.muted,
  },
});
