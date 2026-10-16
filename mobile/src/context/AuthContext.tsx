import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser } from '../types/auth';
import { AUTH_STORAGE_KEY, NOTIFICATION_STORAGE_KEY } from '../config/storage';
import { secureStorage } from '../services/secureStorage';
import { setUnauthorizedHandler } from '../services/api/client';
import { SUPERVISOR_CACHE_PREFIX } from '../services/supervisorCache';
import { AGENT_CACHE_PREFIX } from '../services/agentCache';
import { biometricLock } from '../services/biometricLock';
import { useToast } from './ToastContext';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isReady: boolean;
  /** Session présente mais verrouillée (empreinte / visage demandés). */
  locked: boolean;
  unlock: () => Promise<boolean>;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const { showToast } = useToast();
  const backgroundSince = React.useRef<number | null>(null);

  // Verrouille après 10 minutes en arrière-plan si le verrou biométrique est activé.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundSince.current = backgroundSince.current ?? Date.now();
        return;
      }
      const since = backgroundSince.current;
      backgroundSince.current = null;
      if (since && Date.now() - since > 10 * 60 * 1000 && (await biometricLock.isEnabled())) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  const unlock = async () => {
    const ok = await biometricLock.authenticate();
    if (ok) setLocked(false);
    return ok;
  };

  useEffect(() => {
    // Déconnexion forcée par le backend (token expiré/invalide) : distincte d'un logout manuel,
    // l'utilisateur doit comprendre pourquoi il se retrouve sur l'écran de connexion.
    setUnauthorizedHandler(() => {
      logout();
      showToast('Session expirée', 'Merci de vous reconnecter.', 'error');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const restore = async () => {
      let raw = await secureStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        // Migration depuis l'ancien stockage AsyncStorage (non chiffré) : à supprimer une fois
        // que les utilisateurs auront tous mis à jour vers la version avec expo-secure-store.
        const legacy = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (legacy) {
          await secureStorage.setItem(AUTH_STORAGE_KEY, legacy);
          await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          raw = legacy;
        }
      }
      if (raw) {
        const parsed = JSON.parse(raw) as { user: AuthUser; token: string };
        setUser(parsed.user);
        setToken(parsed.token);
        if (await biometricLock.isEnabled()) setLocked(true);
      }
    };
    restore()
      .catch(() => {})
      .finally(() => setIsReady(true));
  }, []);

  const login = (nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    secureStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: nextUser, token: nextToken })).catch(() => {});
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setLocked(false);
    secureStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
    // purge les données locales liées à l'utilisateur précédent
    AsyncStorage.getAllKeys()
      .then((keys) => {
        const keysToRemove = keys.filter(
          (key) =>
            key === 'syncQueue' ||
            key === NOTIFICATION_STORAGE_KEY ||
            key.startsWith('intervention:start:') ||
            key.startsWith(SUPERVISOR_CACHE_PREFIX) ||
            key.startsWith(AGENT_CACHE_PREFIX),
        );
        if (keysToRemove.length) {
          AsyncStorage.multiRemove(keysToRemove).catch(() => {});
        }
      })
      .catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, token, isReady, locked, unlock, login, logout }}>{children}</AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};
