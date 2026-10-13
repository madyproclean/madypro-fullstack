import React, { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/config/theme';
import { useLayout } from '@/hooks/useLayout';
import { useAuthContext } from '@/context/AuthContext';
import { listChatThreads } from '@/services/api/supervision.api';
import { RAIL_COMPACT, RAIL_WIDE, SideRail, SUPERVISOR_SECTIONS } from '@/components/supervisor/SideRail';
import SupervisorTodayScreen from '@/screens/supervisor/SupervisorTodayScreen';
import SupervisorMapScreen from '@/screens/supervisor/SupervisorMapScreen';
import SupervisorMissionsScreen from '@/screens/supervisor/SupervisorMissionsScreen';
import SupervisorValidationsScreen from '@/screens/supervisor/SupervisorValidationsScreen';
import SupervisorTeamScreen from '@/screens/supervisor/SupervisorTeamScreen';
import SupervisorMessagesScreen from '@/screens/supervisor/SupervisorMessagesScreen';
import { SupervisorTabParamList } from './types';

const Tabs = createBottomTabNavigator<SupervisorTabParamList>();

const UNREAD_REFRESH_MS = 30_000;

/** Messages d'agents non lus, toutes discussions confondues (pastille de la navigation). */
function useUnreadMessages() {
  const { token } = useAuthContext();
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    if (!token || AppState.currentState !== 'active') return;
    listChatThreads(token)
      .then((threads) => setCount(threads.reduce((sum, t) => sum + t.unreadCount, 0)))
      .catch(() => undefined);
  }, [token]);
  React.useEffect(() => {
    refresh();
    const timer = setInterval(refresh, UNREAD_REFRESH_MS);
    const sub = AppState.addEventListener('change', (next) => next === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);
  return count;
}

/**
 * Espace superviseur : navigation latérale fixe (réduite aux icônes sous 900 points de large)
 * et une rubrique affichée à droite.
 */
export function SupervisorNavigator() {
  const { isWide } = useLayout();
  const insets = useSafeAreaInsets();
  const railWidth = isWide ? RAIL_WIDE : RAIL_COMPACT;
  const unreadMessages = useUnreadMessages();

  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false }}
      sceneContainerStyle={{
        marginLeft: railWidth,
        paddingTop: insets.top,
        paddingRight: insets.right,
        backgroundColor: theme.colors.cream,
      }}
      tabBar={(props) => <SideRail {...props} compact={!isWide} badges={{ SupervisorMessages: unreadMessages }} />}
    >
      <Tabs.Screen name="SupervisorToday" component={SupervisorTodayScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorToday.label }} />
      <Tabs.Screen name="SupervisorMap" component={SupervisorMapScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorMap.label }} />
      <Tabs.Screen name="SupervisorMissions" component={SupervisorMissionsScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorMissions.label }} />
      <Tabs.Screen
        name="SupervisorValidations"
        component={SupervisorValidationsScreen}
        options={{ title: SUPERVISOR_SECTIONS.SupervisorValidations.label }}
      />
      <Tabs.Screen name="SupervisorTeam" component={SupervisorTeamScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorTeam.label }} />
      <Tabs.Screen name="SupervisorMessages" component={SupervisorMessagesScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorMessages.label }} />
    </Tabs.Navigator>
  );
}
