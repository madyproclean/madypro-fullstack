import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationCenter } from '@/context/NotificationContext';
import { theme } from '@/config/theme';

Ionicons.loadFont?.();

type TabMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type AgentTabBarProps = BottomTabBarProps & {
  iconMap: Record<string, TabMeta>;
};

export const AgentTabBar: React.FC<AgentTabBarProps> = ({ state, navigation, iconMap }) => {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(8, insets.bottom + 8);
   const { unreadCount } = useNotificationCenter();

  return (
    <View style={[styles.wrapper, { paddingBottom: bottom }]}>
      <View style={styles.container}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const meta = iconMap[route.name] ?? {
            label: route.name,
            icon: 'ellipse-outline',
          };

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const showBadge = route.name === 'AgentNotifications' && unreadCount > 0;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              // Onglets sans texte visible : le libellé est lu par le lecteur d'écran.
              accessibilityLabel={showBadge ? `${meta.label}, nouvelles notifications` : meta.label}
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tab}
            >
              <View style={[styles.iconWrapper, isFocused && styles.iconWrapperActive]}>
                <Ionicons
                  name={meta.icon}
                  size={isFocused ? 26 : 22}
                  color={isFocused ? '#ffffff' : theme.colors.sage}
                />
                {showBadge && <View style={styles.badge} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
  },
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.ink,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    marginHorizontal: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  iconWrapperActive: {
    backgroundColor: theme.colors.primary,
    borderRadius: '50%',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#d62828',
  },
});
