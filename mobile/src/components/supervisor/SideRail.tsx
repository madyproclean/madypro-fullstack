import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { SupervisorTabParamList } from '@/navigation/types';

export const RAIL_WIDE = 232;
export const RAIL_COMPACT = 96;

export const SUPERVISOR_SECTIONS: Record<
  keyof SupervisorTabParamList,
  { label: string; short: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  SupervisorToday: { label: "Aujourd'hui", short: "Aujourd'hui", icon: 'home-outline' },
  SupervisorMap: { label: 'Carte', short: 'Carte', icon: 'map-outline' },
  SupervisorMissions: { label: 'Missions', short: 'Missions', icon: 'list-outline' },
  SupervisorValidations: { label: 'Validations', short: 'Valider', icon: 'checkmark-done-outline' },
  SupervisorTeam: { label: 'Équipe et sites', short: 'Équipe', icon: 'people-outline' },
  SupervisorMessages: { label: 'Messages', short: 'Messages', icon: 'chatbubble-outline' },
};

type Props = BottomTabBarProps & { compact: boolean };

/**
 * Navigation latérale fixe de l'espace superviseur. Rendue comme « barre d'onglets » du
 * navigateur à onglets, mais positionnée à gauche (les écrans sont décalés d'autant).
 */
export const SideRail: React.FC<Props> = ({ state, navigation, compact }) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthContext();
  const width = compact ? RAIL_COMPACT : RAIL_WIDE;

  return (
    <View
      accessibilityRole="menu"
      style={[
        styles.rail,
        { width, paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + theme.spacing.lg, paddingLeft: insets.left + 12 },
      ]}
    >
      {!compact && (
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoLetter}>M</Text>
          </View>
          <View>
            <Text style={styles.brandName}>Mady Proclean</Text>
            <Text style={styles.brandSub}>Espace superviseur</Text>
          </View>
        </View>
      )}
      {state.routes.map((route, index) => {
        const meta = SUPERVISOR_SECTIONS[route.name as keyof SupervisorTabParamList];
        const focused = state.index === index;
        const color = focused ? theme.colors.primaryDark : theme.colors.muted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={({ pressed }) => [
              compact ? styles.itemCompact : styles.item,
              focused && styles.itemActive,
              pressed && styles.itemPressed,
            ]}
          >
            <Ionicons name={meta.icon} size={compact ? 26 : 22} color={color} />
            <Text
              numberOfLines={1}
              style={[compact ? styles.labelCompact : styles.label, { color }, focused && styles.labelActive]}
            >
              {compact ? meta.short : meta.label}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.footer}>
        {!compact && (
          <Text numberOfLines={1} style={styles.userName}>
            {user?.name}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
          onPress={logout}
          style={({ pressed }) => [compact ? styles.itemCompact : styles.item, pressed && styles.itemPressed]}
        >
          <Ionicons name="log-out-outline" size={22} color={theme.colors.muted} />
          <Text style={[compact ? styles.labelCompact : styles.label, { color: theme.colors.muted }]}>
            {compact ? 'Sortir' : 'Se déconnecter'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    paddingRight: 12,
    backgroundColor: theme.colors.shell,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    gap: 6,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 20 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { color: '#fff', fontFamily: theme.fonts.display, fontSize: 20 },
  brandName: { fontFamily: theme.fonts.display, fontSize: 19, color: theme.colors.ink },
  brandSub: { fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.muted },
  item: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  itemCompact: { minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14 },
  itemActive: { backgroundColor: theme.colors.primarySoft },
  itemPressed: { opacity: 0.7 },
  label: { fontFamily: theme.fonts.bodyMedium, fontSize: 17 },
  labelCompact: { fontFamily: theme.fonts.bodyMedium, fontSize: 12 },
  labelActive: { fontFamily: theme.fonts.bodySemiBold },
  footer: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12, gap: 6 },
  userName: { fontFamily: theme.fonts.bodySemiBold, fontSize: 15, color: theme.colors.ink, paddingHorizontal: 14 },
});
