import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../services/notifications';
import { NotificationItem } from '../types/notification';
import { useAuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { listNotifications, markNotificationRead, registerNotificationToken } from '../services/api/notifications.api';
import { navigationRef } from '../navigation/navigationRef';
import { AgentTabParamList, AgentStackParamList } from '../navigation/types';
import { NOTIFICATION_STORAGE_KEY } from '../config/storage';

const AGENT_TAB_SCREENS = new Set<keyof AgentTabParamList>([
  'AgentHome',
  'AgentHistory',
  'AgentRequests',
  'AgentNotifications',
  'AgentProfile',
]);

type NotificationContextValue = {
  notifications: NotificationItem[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  openNotification: (item: NotificationItem) => void;
  pushMockNotification: (notification: Partial<NotificationItem>) => void;
  refresh: () => Promise<void>;
  unreadCount: number;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);
const STORAGE_KEY = NOTIFICATION_STORAGE_KEY;

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuthContext();
  const { showToast } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [devicePushToken, setDevicePushToken] = useState<string | null>(null);
  const tokenRef = React.useRef(token);
  tokenRef.current = token;
  // Lu au moment du tap : les écouteurs de notification sont enregistrés une seule fois.
  const roleRef = React.useRef(user?.role?.toUpperCase());
  roleRef.current = user?.role?.toUpperCase();

  const addNotification = useCallback((notification: NotificationItem) => {
    setItems((prev) => [notification, ...prev]);
  }, []);

  const navigateToAgentTab = useCallback((screen?: keyof AgentTabParamList) => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('Agent', {
      screen: 'AgentTabs',
      params: { screen: screen ?? 'AgentHome' },
    });
  }, []);

  const navigateFromPayload = useCallback(
    (data: unknown) => {
      console.log('[DeepLink] navigateFromPayload called with', JSON.stringify(data), 'ready=', navigationRef.isReady());
      if (!navigationRef.isReady() || !data || typeof data !== 'object') {
        return;
      }
      const payload = data as {
        path?: string;
        interventionId?: string | number;
        anomalyId?: string;
        absenceId?: string;
        threadUserId?: string;
      };
      if (roleRef.current === 'SUPERVISOR') {
        // Espace superviseur : chaque alerte ouvre sa rubrique, jamais un écran agent.
        if (payload.interventionId) {
          navigationRef.navigate('Supervisor', {
            screen: 'SupervisorMissions',
            params: { interventionId: String(payload.interventionId) },
          });
        } else if (payload.absenceId) {
          navigationRef.navigate('Supervisor', { screen: 'SupervisorValidations', params: { absenceId: payload.absenceId } });
        } else if (payload.path === 'requests') {
          navigationRef.navigate('Supervisor', { screen: 'SupervisorValidations', params: { tab: 'requests' } });
        } else if (payload.threadUserId) {
          navigationRef.navigate('Supervisor', { screen: 'SupervisorMessages', params: { threadUserId: payload.threadUserId } });
        } else {
          navigationRef.navigate('Supervisor', { screen: 'SupervisorToday' });
        }
        return;
      }
      if (roleRef.current !== 'AGENT') return;
      if (payload.path) {
        if (AGENT_TAB_SCREENS.has(payload.path as keyof AgentTabParamList)) {
          navigateToAgentTab(payload.path as keyof AgentTabParamList);
        } else {
          navigationRef.navigate('Agent', { screen: payload.path as keyof AgentStackParamList } as never);
        }
        return;
      }
      if (payload.interventionId) {
        const targetId = String(payload.interventionId);
        navigationRef.navigate('Agent', { screen: 'AgentIntervention', params: { id: targetId } });
      }
    },
    [navigateToAgentTab],
  );

  const fetchNotifications = useCallback(async () => {
    if (!token) {
      setItems([]);
      return;
    }
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      const cachedItems: NotificationItem[] = cached ? JSON.parse(cached) : [];
      const cachedRead = new Map(cachedItems.map((n) => [n.id, n.read]));
      const history = await listNotifications(token);
      setItems((prev) => {
        const readMap = new Map(prev.map((item) => [item.id, item.read]));
        return history.map((notification) => ({
          ...notification,
          read: notification.read || readMap.get(notification.id) || cachedRead.get(notification.id) || false,
        }));
      });
    } catch (error) {
      console.warn('Failed to load notifications', error);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetchNotifications();
    }, 60000);
    return () => clearInterval(interval);
  }, [token, fetchNotifications]);

  useEffect(() => {
    if (!token || !user) return;
    if (!expoPushToken && !devicePushToken) {
      console.warn('[Push] Aucun token à enregistrer (expo/native)');
      return;
    }
    console.log('[Push] Enregistrement tokens', { expoPushToken, devicePushToken });
    registerNotificationToken(token, expoPushToken || undefined, devicePushToken || undefined).catch((error) => {
      console.warn('Push token registration failed', error);
    });
  }, [token, expoPushToken, devicePushToken, user]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    // Cas "cold start" : l'app était fermée (tuée par le système) et le tap sur la
    // notification vient de la relancer — addNotificationResponseReceivedListener n'a pas eu
    // le temps de s'enregistrer avant que l'OS ait délivré l'événement, donc on le récupère
    // explicitement une fois au montage. navigationRef n'est pas forcément prêt tout de suite
    // (NavigationContainer pas encore monté), d'où le petit polling borné.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data;
      console.log('[DeepLink] cold-start response found, data=', JSON.stringify(data));
      let attempts = 0;
      const tryNavigate = () => {
        attempts += 1;
        if (navigationRef.isReady()) {
          navigateFromPayload(data);
          return;
        }
        if (attempts < 20) setTimeout(tryNavigate, 150);
      };
      tryNavigate();
    });

    registerForPushNotificationsAsync().then((value) => {
      if (!value) {
        showToast(
          'Notifications désactivées',
          "Activez les notifications pour être informé en temps réel des interventions. Vérifiez les autorisations système et utilisez un appareil physique.",
          'error',
        );
        console.warn('[Push] Aucun token obtenu (permission refusée ou simulateur).');
        return;
      }
      console.log('[Push] Token Expo reçu', value?.expoToken);
      console.log('[Push] Token natif reçu', value?.deviceToken);
      if (value?.expoToken) setExpoPushToken(value.expoToken);
      if (value?.deviceToken) setDevicePushToken(value.deviceToken);
    });

    const resolveServerId = (request: Notifications.NotificationRequest) => {
      const data = request.content.data as Record<string, unknown> | undefined;
      const serverId = data?.notificationId;
      return typeof serverId === 'string' ? serverId : request.identifier;
    };

    const receiveSub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      addNotification({
        id: resolveServerId(notification.request),
        title: content.title ?? 'Notification',
        message: content.body ?? '',
        receivedAt: new Date().toISOString(),
        read: false,
        data: (content.data as Record<string, unknown>) ?? undefined,
      });
      if (content.body || content.title) {
        showToast(content.title ?? 'Notification', content.body ?? '', 'info');
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      console.log('[DeepLink] response listener fired, content.data=', JSON.stringify(content.data));
      navigateFromPayload(content.data);
      const serverId = resolveServerId(response.notification.request);
      setItems((prev) => prev.map((item) => (item.id === serverId ? { ...item, read: true } : item)));
      if (tokenRef.current && !serverId.startsWith('local-')) {
        markNotificationRead(tokenRef.current, serverId).catch(() => {});
      }
    });

    return () => {
      receiveSub.remove();
      responseSub.remove();
    };
  }, [addNotification, navigateFromPayload, showToast]);

  const markAsRead = useCallback(
    (id: string) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
      if (token && !id.startsWith('local-')) {
        markNotificationRead(token, id).catch(() => {});
      }
    },
    [token],
  );

  const openNotification = useCallback(
    (item: NotificationItem) => {
      markAsRead(item.id);
      navigateFromPayload(item.data);
    },
    [markAsRead, navigateFromPayload],
  );

  const markAllAsRead = useCallback(() => {
    setItems((prev) => {
      if (token) {
        prev
          .filter((item) => !item.read && !item.id.startsWith('local-'))
          .forEach((item) => markNotificationRead(token, item.id).catch(() => {}));
      }
      return prev.map((item) => ({ ...item, read: true }));
    });
  }, [token]);

  const pushMockNotification = useCallback(
    (notification: Partial<NotificationItem>) => {
      addNotification({
        id: notification.id ?? `local-${Date.now()}`,
        title: notification.title ?? 'Notification',
        message: notification.message ?? '',
        receivedAt: notification.receivedAt ?? new Date().toISOString(),
        read: notification.read ?? false,
        data: notification.data,
      });
    },
    [addNotification],
  );

  const refresh = useCallback(async () => {
    await fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const value = useMemo(
    () => ({
      notifications: items,
      markAsRead,
      markAllAsRead,
      openNotification,
      pushMockNotification,
      refresh,
      unreadCount,
    }),
    [items, markAsRead, markAllAsRead, openNotification, pushMockNotification, refresh, unreadCount],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotificationCenter = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotificationCenter must be used within NotificationProvider');
  }
  return ctx;
};
