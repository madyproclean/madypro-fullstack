import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/config/theme';

export type StatRowItem = {
  label: string;
  value: React.ReactNode;
};

type StatRowProps = {
  items: StatRowItem[];
};

/** Bandeau horizontal de stats (heures/ponctualité/tâches) — style "Timing summary" Crewly. */
export const StatRow: React.FC<StatRowProps> = ({ items }) => {
  return (
    <View style={styles.row}>
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 && <View style={styles.divider} />}
          <View style={styles.item}>
            <Text style={styles.value}>{item.value}</Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.lg,
    paddingVertical: theme.spacing.lg,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.clay,
  },
  value: {
    fontSize: 18,
    fontFamily: theme.fonts.display,
    color: theme.colors.ink,
  },
  label: {
    fontSize: 11,
    color: theme.colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
