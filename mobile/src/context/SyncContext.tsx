import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useAuthContext } from './AuthContext';
import { checkIn, checkOut, markArrival } from '../services/api/attendance.api';
import { toggleInterventionChecklistItem } from '../services/api/interventions.api';
import { createAnomaly } from '../services/api/anomalies.api';
import { NetworkError } from '../services/api/client';

const STORAGE_KEY = 'syncQueue';

/** Pointages, cases de checklist et signalements faits sans réseau, envoyés au retour du réseau. */
type SyncEventType = 'ARRIVAL' | 'START' | 'END' | 'CHECKLIST' | 'ANOMALY';
type SyncStatus = 'pending' | 'sending' | 'failed';

type SyncEvent = {
  id: string;
  userId: string;
  interventionId: string;
  siteId: string;
  type: SyncEventType;
  timestamp: string;
  coordinates?: { latitude: number; longitude: number } | null;
  photo?: string;
  checklistItemId?: string;
  done?: boolean;
  anomaly?: { type: string; description: string; photos: string[] };
  status: SyncStatus;
  error?: string | null;
};

type QueueInput = {
  userId: string;
  interventionId: string;
  siteId: string;
  type: SyncEventType;
  timestamp: string;
  coordinates?: { latitude: number; longitude: number } | null;
  photo?: string;
  checklistItemId?: string;
  done?: boolean;
  anomaly?: { type: string; description: string; photos: string[] };
};

type SyncContextValue = {
  isOnline: boolean;
  pendingEvents: SyncEvent[];
  queueEvent: (input: QueueInput) => Promise<void>;
  flush: () => Promise<void>;
  clearQueue: () => void;
  removeEvent: (id: string) => void;
  pendingStarts: SyncEvent[];
  pendingEnds: SyncEvent[];
  lastError: string | null;
};

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingEvents, setPendingEvents] = useState<SyncEvent[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const { token, user } = useAuthContext();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value) {
          const parsed = JSON.parse(value);
          const normalized: SyncEvent[] = parsed.map((evt: any) => ({
            status: 'pending',
            error: null,
            ...evt,
          }));
          setPendingEvents(normalized);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pendingEvents)).catch(() => {});
  }, [pendingEvents]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable);
      setIsOnline(online);
    });
    return () => unsubscribe();
  }, []);

  const uploadEvent = useCallback(
    async (event: SyncEvent) => {
      if (!token || !user) {
        throw new Error('Token manquant');
      }
      if (event.type === 'ARRIVAL') {
        if (!event.coordinates) throw new Error('Coordonnées manquantes');
        return markArrival(token, {
          userId: event.userId,
          siteId: event.siteId,
          latitude: event.coordinates.latitude,
          longitude: event.coordinates.longitude,
          interventionId: event.interventionId,
        });
      }
      if (event.type === 'START') {
        if (!event.coordinates) throw new Error('Coordonnées manquantes');
        if (!event.photo) throw new Error('Photo manquante');
        return checkIn(token, {
          userId: event.userId,
          siteId: event.siteId,
          latitude: event.coordinates.latitude,
          longitude: event.coordinates.longitude,
          interventionId: event.interventionId,
          photo: event.photo,
        });
      }
      if (event.type === 'END') {
        if (!event.photo) throw new Error('Photo manquante');
        return checkOut(token, { userId: event.userId, interventionId: event.interventionId, photo: event.photo });
      }
      if (event.type === 'CHECKLIST') {
        if (!event.checklistItemId) throw new Error('Tâche manquante');
        return toggleInterventionChecklistItem(token, event.interventionId, event.checklistItemId, Boolean(event.done));
      }
      if (event.type === 'ANOMALY') {
        if (!event.anomaly) throw new Error('Signalement vide');
        return createAnomaly(token, { interventionId: event.interventionId, ...event.anomaly });
      }
    },
    [token, user],
  );

  const isFlushingRef = React.useRef(false);

  const flush = useCallback(async () => {
    if (!isOnline || pendingEvents.length === 0 || isFlushingRef.current) {
      return;
    }
    isFlushingRef.current = true;
    try {
      for (const event of pendingEvents) {
        setPendingEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...e, status: 'sending', error: null } : e)),
        );
        try {
          await uploadEvent(event);
          setPendingEvents((prev) => prev.filter((item) => item.id !== event.id));
          setLastError(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Synchronisation impossible';
          setLastError(message);
          setPendingEvents((prev) =>
            prev.map((e) => (e.id === event.id ? { ...e, status: 'failed', error: message } : e)),
          );
          break; // stop après le premier échec pour éviter le spam
        }
      }
    } finally {
      isFlushingRef.current = false;
    }
  }, [isOnline, pendingEvents, uploadEvent]);

  const flushRef = React.useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (isOnline) {
      flushRef.current();
    }
  }, [isOnline]);

  const queueEvent = useCallback(
    async (input: QueueInput) => {
      const event: SyncEvent = {
        id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...input,
        status: 'pending',
        error: null,
      };

      if (isOnline) {
        try {
          await uploadEvent(event);
          setLastError(null);
          return;
        } catch (error) {
          // Checklist et signalements : seul un manque de réseau met l'action en attente ; un refus
          // du serveur est rendu tel quel à l'écran.
          if ((event.type === 'CHECKLIST' || event.type === 'ANOMALY') && !(error instanceof NetworkError)) throw error;
          const message = error instanceof Error ? error.message : 'Synchronisation impossible';
          setLastError(message);
          // fallthrough to queueing locally
        }
      }

      // Ajout en fin de file : l'envoi suit l'ordre des actions (arrivée, début, fin).
      setPendingEvents((prev) => [...prev, event]);
    },
    [isOnline, uploadEvent],
  );

  const clearQueue = useCallback(() => {
    setPendingEvents([]);
    setLastError(null);
  }, []);

  const removeEvent = useCallback((id: string) => {
    setPendingEvents((prev) => prev.filter((evt) => evt.id !== id));
  }, []);

  const pendingStarts = useMemo(() => pendingEvents.filter((e) => e.type === 'START'), [pendingEvents]);
  const pendingEnds = useMemo(() => pendingEvents.filter((e) => e.type === 'END'), [pendingEvents]);

  const value = useMemo(
    () => ({
      isOnline,
      pendingEvents,
      queueEvent,
      flush,
      clearQueue,
      removeEvent,
      pendingStarts,
      pendingEnds,
      lastError,
    }),
    [isOnline, pendingEvents, queueEvent, flush, clearQueue, removeEvent, pendingStarts, pendingEnds, lastError],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export const useSyncContext = () => {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSyncContext must be used within SyncProvider');
  }
  return ctx;
};
