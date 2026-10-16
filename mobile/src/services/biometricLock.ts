import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY = 'biometric-lock:enabled';

/** Verrou de l'application par empreinte ou visage (session conservée, téléphone protégé). */
export const biometricLock = {
  /** Appareil équipé et au moins une empreinte ou un visage enregistré. */
  async isAvailable() {
    if (Platform.OS === 'web') return false;
    try {
      const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
      return hardware && enrolled;
    } catch {
      return false;
    }
  },
  async isEnabled() {
    return (await AsyncStorage.getItem(KEY).catch(() => null)) === 'true';
  },
  async setEnabled(enabled: boolean) {
    if (enabled) await AsyncStorage.setItem(KEY, 'true');
    else await AsyncStorage.removeItem(KEY);
  },
  async authenticate(promptMessage = 'Déverrouiller Mady Proclean') {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Annuler',
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  },
};
