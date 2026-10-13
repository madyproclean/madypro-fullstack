import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { ONBOARDING_STORAGE_KEY } from '@/config/storage';
import { theme } from '@/config/theme';
import { AgentTabBar } from '@/components/navigation/AgentTabBar';
import AgentHomeScreen from '@/screens/agent/AgentHomeScreen';
import AgentHistoryScreen from '@/screens/agent/AgentHistoryScreen';
import AgentRequestsScreen from '@/screens/agent/AgentRequestsScreen';
import AgentAbsenceFormScreen from '@/screens/agent/AgentAbsenceFormScreen';
import AgentNotificationsScreen from '@/screens/agent/AgentNotificationsScreen';
import AgentProfileScreen from '@/screens/agent/AgentProfileScreen';
import AgentInterventionScreen from '@/screens/agent/AgentInterventionScreen';
import AgentChangePasswordScreen from '@/screens/agent/AgentChangePasswordScreen';
import AgentSyncQueueScreen from '@/screens/agent/AgentSyncQueueScreen';
import AgentAvailabilityScreen from '@/screens/agent/AgentAvailabilityScreen';
import AgentChatScreen from '@/screens/agent/AgentChatScreen';
import AgentInventoryScannerScreen from '@/screens/agent/AgentInventoryScannerScreen';
import AgentPlanningScreen from '@/screens/agent/AgentPlanningScreen';
import AgentShiftSwapsScreen from '@/screens/agent/AgentShiftSwapsScreen';
import AgentTeamFeedScreen from '@/screens/agent/AgentTeamFeedScreen';
import AgentOnboardingChecklistScreen from '@/screens/agent/AgentOnboardingChecklistScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import LoginScreen from '@/screens/auth/LoginScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';
import AdminWebOnlyScreen from '@/screens/AdminWebOnlyScreen';
import { useAuthContext } from '@/context/AuthContext';
import { navigationRef } from './navigationRef';
import { SupervisorNavigator } from './SupervisorNavigator';
import { spaceForRole } from './spaceForRole';
import { AgentStackParamList, AgentTabParamList, AuthStackParamList, RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AgentStack = createNativeStackNavigator<AgentStackParamList>();
const AgentTabs = createBottomTabNavigator<AgentTabParamList>();

const agentTabMeta: Record<keyof AgentTabParamList, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  AgentHome: { label: 'Accueil', icon: 'home-outline' },
  AgentHistory: { label: 'Historique', icon: 'time-outline' },
  AgentRequests: { label: 'Absences', icon: 'calendar-outline' },
  AgentNotifications: { label: 'Notifications', icon: 'notifications-outline' },
  AgentProfile: { label: 'Profil', icon: 'person-circle-outline' },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function AgentTabNavigator() {
  return (
    <AgentTabs.Navigator
      screenOptions={{
        headerShown: false,
      }}
      sceneContainerStyle={{ paddingBottom: 96 }}
      tabBar={(props) => <AgentTabBar {...props} iconMap={agentTabMeta} />}
    >
      <AgentTabs.Screen name="AgentHome" component={AgentHomeScreen} options={{ title: agentTabMeta.AgentHome.label }} />
      <AgentTabs.Screen
        name="AgentHistory"
        component={AgentHistoryScreen}
        options={{ title: agentTabMeta.AgentHistory.label }}
      />
      <AgentTabs.Screen
        name="AgentRequests"
        component={AgentRequestsScreen}
        options={{ title: agentTabMeta.AgentRequests.label }}
      />
      <AgentTabs.Screen
        name="AgentNotifications"
        component={AgentNotificationsScreen}
        options={{ title: agentTabMeta.AgentNotifications.label }}
      />
      <AgentTabs.Screen
        name="AgentProfile"
        component={AgentProfileScreen}
        options={{ title: agentTabMeta.AgentProfile.label }}
      />
    </AgentTabs.Navigator>
  );
}

function AgentNavigator() {
  return (
    <AgentStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AgentStack.Screen name="AgentTabs" component={AgentTabNavigator} options={{ animation: 'fade' }} />
      <AgentStack.Screen name="AgentIntervention" component={AgentInterventionScreen} />
      <AgentStack.Screen name="AgentAbsenceForm" component={AgentAbsenceFormScreen} />
      <AgentStack.Screen name="AgentChangePassword" component={AgentChangePasswordScreen} />
      <AgentStack.Screen name="AgentSyncQueue" component={AgentSyncQueueScreen} />
      <AgentStack.Screen name="AgentAvailability" component={AgentAvailabilityScreen} />
      <AgentStack.Screen name="AgentChat" component={AgentChatScreen} />
      <AgentStack.Screen name="AgentInventoryScanner" component={AgentInventoryScannerScreen} />
      <AgentStack.Screen name="AgentPlanning" component={AgentPlanningScreen} />
      <AgentStack.Screen name="AgentShiftSwaps" component={AgentShiftSwapsScreen} />
      <AgentStack.Screen name="AgentTeamFeed" component={AgentTeamFeedScreen} />
      <AgentStack.Screen name="AgentOnboardingChecklist" component={AgentOnboardingChecklistScreen} />
    </AgentStack.Navigator>
  );
}

export function AppNavigator() {
  const { user, isReady: isAuthReady } = useAuthContext();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((value) => setHasCompletedOnboarding(value === 'true'))
      .catch(() => setHasCompletedOnboarding(false));
  }, []);

  const markOnboardingDone = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setHasCompletedOnboarding(true);
  }, []);

  const ready = hasCompletedOnboarding !== null && isAuthReady;
  const showOnboarding = hasCompletedOnboarding === false;
  const showAuth = hasCompletedOnboarding === true && !user;
  const space = user ? spaceForRole(user.role) : null;

  const loader = useMemo(
    () => (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    ),
    [],
  );

  if (!ready) {
    return loader;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {showOnboarding ? (
          <RootStack.Screen name="Onboarding">
            {(props) => <OnboardingScreen {...props} onFinish={markOnboardingDone} />}
          </RootStack.Screen>
        ) : null}

        {showAuth ? <RootStack.Screen name="Auth" component={AuthNavigator} /> : null}

        {/* Aiguillage par rôle : chaque profil n'a accès qu'à son propre espace. */}
        {space === 'Agent' ? <RootStack.Screen name="Agent" component={AgentNavigator} /> : null}
        {space === 'Supervisor' ? <RootStack.Screen name="Supervisor" component={SupervisorNavigator} /> : null}
        {space === 'AdminWebOnly' ? <RootStack.Screen name="AdminWebOnly" component={AdminWebOnlyScreen} /> : null}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
