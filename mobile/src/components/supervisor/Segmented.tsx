import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/config/theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Sélecteur à segments (ex. Jour / Semaine), zones tactiles de 44 points. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.group}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.item, active && styles.active]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: theme.colors.status.pendingSoft },
  item: { minHeight: 44, paddingHorizontal: 18, borderRadius: 11, justifyContent: 'center' },
  active: {
    backgroundColor: theme.colors.shell,
    shadowColor: '#0B1620',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.muted },
  labelActive: { color: theme.colors.ink },
});
