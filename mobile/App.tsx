import React from 'react';
import 'react-native-gesture-handler';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { FjallaOne_400Regular } from '@expo-google-fonts/fjalla-one';
import {
  Cabin_400Regular,
  Cabin_500Medium,
  Cabin_600SemiBold,
  Cabin_700Bold,
} from '@expo-google-fonts/cabin';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { I18nProvider } from './src/i18n';
import { installGlobalErrorReporting } from './src/services/errorReporting';

installGlobalErrorReporting();
import { ToastProvider } from './src/context/ToastContext';

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    FjallaOne_400Regular,
    Cabin_400Regular,
    Cabin_500Medium,
    Cabin_600SemiBold,
    Cabin_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <SyncProvider>
            <NotificationProvider>
              <StatusBar barStyle="dark-content" />
              <AppNavigator />
            </NotificationProvider>
          </SyncProvider>
        </AuthProvider>
      </ToastProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
