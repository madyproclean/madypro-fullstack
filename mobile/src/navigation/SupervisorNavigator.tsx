import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/config/theme';
import { useLayout } from '@/hooks/useLayout';
import { RAIL_COMPACT, RAIL_WIDE, SideRail, SUPERVISOR_SECTIONS } from '@/components/supervisor/SideRail';
import SupervisorTodayScreen from '@/screens/supervisor/SupervisorTodayScreen';
import SupervisorMapScreen from '@/screens/supervisor/SupervisorMapScreen';
import SupervisorMissionsScreen from '@/screens/supervisor/SupervisorMissionsScreen';
import { SupervisorComingSoonScreen } from '@/screens/supervisor/SupervisorComingSoonScreen';
import { SupervisorTabParamList } from './types';

const Tabs = createBottomTabNavigator<SupervisorTabParamList>();

// Rubriques livrées aux sprints suivants (voir le plan tablette superviseur).
const ValidationsScreen = () => (
  <SupervisorComingSoonScreen
    title="Validations"
    icon="checkmark-done-outline"
    description="Les absences de votre équipe à valider et le suivi de vos demandes de changement de planning."
  />
);
const TeamScreen = () => (
  <SupervisorComingSoonScreen
    title="Équipe et sites"
    icon="people-outline"
    description="Les fiches de vos agents et de vos sites, avec appel et SMS en un geste."
  />
);
const MessagesScreen = () => (
  <SupervisorComingSoonScreen title="Messages" icon="chatbubble-outline" description="Les discussions avec vos agents." />
);

/**
 * Espace superviseur : navigation latérale fixe (réduite aux icônes sous 900 points de large)
 * et une rubrique affichée à droite.
 */
export function SupervisorNavigator() {
  const { isWide } = useLayout();
  const insets = useSafeAreaInsets();
  const railWidth = isWide ? RAIL_WIDE : RAIL_COMPACT;

  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false }}
      sceneContainerStyle={{
        marginLeft: railWidth,
        paddingTop: insets.top,
        paddingRight: insets.right,
        backgroundColor: theme.colors.cream,
      }}
      tabBar={(props) => <SideRail {...props} compact={!isWide} />}
    >
      <Tabs.Screen name="SupervisorToday" component={SupervisorTodayScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorToday.label }} />
      <Tabs.Screen name="SupervisorMap" component={SupervisorMapScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorMap.label }} />
      <Tabs.Screen name="SupervisorMissions" component={SupervisorMissionsScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorMissions.label }} />
      <Tabs.Screen
        name="SupervisorValidations"
        component={ValidationsScreen}
        options={{ title: SUPERVISOR_SECTIONS.SupervisorValidations.label }}
      />
      <Tabs.Screen name="SupervisorTeam" component={TeamScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorTeam.label }} />
      <Tabs.Screen name="SupervisorMessages" component={MessagesScreen} options={{ title: SUPERVISOR_SECTIONS.SupervisorMessages.label }} />
    </Tabs.Navigator>
  );
}
