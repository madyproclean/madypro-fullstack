import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HeaderLayout } from '@/components/layout/HeaderLayout';
import { Section } from '@/components/ui/Section';
import { Intervention } from '@/types/intervention';
import { getInterventionById, updateInterventionStatus } from '@/services/api/interventions.api';
import { theme } from '@/config/theme';
import { Button } from '@/components/ui/Button';
import { getCurrentCoordinates, verifyProximityToSite } from '@/utils/location';
import { checkIn, checkOut, heartbeat, markArrival } from '@/services/api/attendance.api';
import { AnomalyType } from '@/types/anomaly';
import { createAnomaly } from '@/services/api/anomalies.api';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSyncContext } from '@/context/SyncContext';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getSite } from '@/services/api/sites.api';
import { ApiError } from '@/services/api/client';
import { Site } from '@/types/site';
import { AgentStackParamList } from '@/navigation/types';
import { RunningTimer } from '@/components/intervention/RunningTimer';
import { AssignedAgentsList } from '@/components/intervention/AssignedAgentsList';
import { ProblemModal } from '@/components/intervention/ProblemModal';
import { InterventionChecklist } from '@/components/intervention/InterventionChecklist';
import { getActualDate, buildDateTime, formatTime } from '@/utils/interventionTime';
import { capturePhotoBase64 } from '@/utils/photo';
import { StatusPill, StatusTone } from '@/components/ui/StatusPill';
import { SwipeToConfirm } from '@/components/ui/SwipeToConfirm';
import { agentCache } from '@/services/agentCache';
import { NetworkError } from '@/services/api/client';
import { useI18n } from '@/i18n';
import { openDirections } from '@/components/agent/RouteCard';

const TYPE_LABELS = {
  REGULAR: 'Intervention régulière',
  PUNCTUAL: 'Intervention ponctuelle',
};

const TYPE_ICONS: Record<Intervention['type'], keyof typeof Ionicons.glyphMap> = {
  REGULAR: 'repeat-outline',
  PUNCTUAL: 'flash-outline',
};

const STATUS_TONE: Record<Intervention['status'], StatusTone> = {
  PLANNED: 'info',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
  NEEDS_REVIEW: 'warning',
};

const STATUS_LABELS: Record<Intervention['status'], string> = {
  PLANNED: 'Planifiée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  NO_SHOW: 'Non effectuée',
  NEEDS_REVIEW: 'À valider',
};

const START_CACHE_KEY = (id: string) => `intervention:start:${id}`;

export default function InterventionDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AgentStackParamList>>();
  const route = useRoute<RouteProp<AgentStackParamList, 'AgentIntervention'>>();
  const { id } = route.params;
  const [intervention, setIntervention] = React.useState<Intervention | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isProblemModalVisible, setProblemModalVisible] = React.useState(false);
  const [problemType, setProblemType] = React.useState<AnomalyType>('CLEANLINESS');
  const [problemDescription, setProblemDescription] = React.useState('');
  const [problemPhotos, setProblemPhotos] = React.useState<string[]>([]);
  const [isSubmittingProblem, setSubmittingProblem] = React.useState(false);
  const {
    isOnline,
    pendingEvents,
    pendingStarts,
    pendingEnds,
    queueEvent,
    clearQueue,
    lastError,
  } = useSyncContext();
  const { token, user } = useAuthContext();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [site, setSite] = React.useState<Site | null>(null);
  const [isMarkingArrival, setMarkingArrival] = React.useState(false);
  const [arrivalRecorded, setArrivalRecorded] = React.useState(false);
  const [now, setNow] = React.useState<Date>(() => new Date());
  const [startPersisted, setStartPersisted] = React.useState<string | null>(null);
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!id || !token) {
      return;
    }
    let cancelled = false;
    // reset arrival state when changing d'intervention
    setArrivalRecorded(false);
    setMarkingArrival(false);
    setStartPersisted(null);
    setCurrentId(id);
    const load = async () => {
      setIsLoading(true);
      try {
        // Gardée sur le téléphone pour rester consultable sans réseau.
        const { value: data } = await agentCache.loadWithCache(user?.id, `mission:${id}`, () => getInterventionById(token, id));
        if (!cancelled) {
          setIntervention(data);
          const mine = data?.agents?.find((a) => a.id === user?.id);
          setArrivalRecorded(Boolean(mine?.arrivalTime));
          if (data?.status !== 'IN_PROGRESS') {
            AsyncStorage.removeItem(START_CACHE_KEY(id)).catch(() => {});
          }
          // Reload persisted start time if backend does not return it
          if (!data?.actualStartAt) {
            const cachedStart = await AsyncStorage.getItem(START_CACHE_KEY(id));
            if (cachedStart) {
              setStartPersisted(cachedStart);
              setIntervention((prev) =>
                prev ? { ...prev, actualStartAt: cachedStart, actualStartTime: prev.actualStartTime ?? cachedStart } : prev,
              );
            }
          }
          if (data) {
            try {
              const { value: rawSite } = await agentCache.loadWithCache(user?.id, `site:${data.siteId}`, () => getSite(token, data.siteId));
              if (!cancelled) {
                const toNumber = (val: any) => {
                  const n = Number(val);
                  return Number.isFinite(n) ? n : undefined;
                };
                const normalizedSite: Site = {
                  ...rawSite,
                  latitude: toNumber(rawSite.latitude),
                  longitude: toNumber(rawSite.longitude),
                };
                setSite(normalizedSite);
                setIntervention((prev) =>
                  prev
                    ? {
                        ...prev,
                        siteAddress: normalizedSite.address,
                        siteLatitude: normalizedSite.latitude ?? prev.siteLatitude,
                        siteLongitude: normalizedSite.longitude ?? prev.siteLongitude,
                      }
                    : prev,
                );
              }
            } catch {
              // ignore
            }
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, token, user?.id]);

  const goBack = React.useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const isPlanned = intervention?.status === 'PLANNED';
  const isRunning = intervention?.status === 'IN_PROGRESS';
  const isCompleted = intervention?.status === 'COMPLETED';
  const userAttendance = React.useMemo(
    () => intervention?.agents?.find((a) => a.id === user?.id) ?? null,
    [intervention?.agents, user?.id],
  );
  const hasStarted = Boolean(userAttendance?.checkInTime);

  React.useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, currentId]);

  const startDate = React.useMemo(() => {
    if (!intervention) {
      return null;
    }
    if (intervention.actualStartAt) {
      return new Date(intervention.actualStartAt);
    }
    if (startPersisted) {
      const d = new Date(startPersisted);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return getActualDate(intervention);
  }, [intervention?.actualStartAt, intervention?.actualStartTime, intervention?.date, startPersisted]);

  const plannedStart = React.useMemo(() => {
    if (!intervention?.date || !intervention?.startTime) return null;
    return buildDateTime(intervention.date, intervention.startTime);
  }, [intervention?.date, intervention?.startTime]);
  const plannedEnd = React.useMemo(() => {
    if (!intervention?.date || !intervention?.endTime) return null;
    return buildDateTime(intervention.date, intervention.endTime);
  }, [intervention?.date, intervention?.endTime]);

  const arrivalAllowedFrom = React.useMemo(() => {
    if (!plannedStart) return null;
    return new Date(plannedStart.getTime() - 30 * 60 * 1000);
  }, [plannedStart]);

  const canMarkArrival = React.useMemo(() => {
    if (arrivalRecorded) return true;
    if (!arrivalAllowedFrom) return true;
    return now >= arrivalAllowedFrom;
  }, [arrivalAllowedFrom, arrivalRecorded, now]);

  const hasPendingSync = intervention
    ? pendingEvents.some((event: { interventionId: string }) => event.interventionId === intervention.id)
    : false;

  const actualStartDisplay = React.useMemo(() => {
    if (intervention?.actualStartTime) return intervention.actualStartTime;
    // intervention.agents[].checkInTime (contrairement à l'endpoint /attendance) est une date ISO
    // complète, pas une chaîne "HH:mm" — même format que ce qu'utilise déjà AssignedAgentsList.
    if (userAttendance?.checkInTime) return formatTime(new Date(userAttendance.checkInTime));
    return null;
  }, [intervention?.actualStartTime, userAttendance?.checkInTime]);

  const actualEndDisplay = React.useMemo(() => {
    if (intervention?.actualEndTime) return intervention.actualEndTime;
    if (userAttendance?.checkOutTime) return formatTime(new Date(userAttendance.checkOutTime));
    return null;
  }, [intervention?.actualEndTime, userAttendance?.checkOutTime]);

  React.useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  const runWithProximityCheck = React.useCallback(
    async (onSuccess: () => Promise<void> | void) => {
      if (!intervention) {
        return;
      }
      // isVerifying reste true pendant toute la durée de onSuccess() (photo + appel réseau), pas
      // seulement pendant le check GPS : sinon le bouton swipe redevient actif pendant que
      // l'action est encore en vol, permettant un double pointage via un second swipe rapide.
      const runAction = async () => {
        setIsVerifying(true);
        try {
          await onSuccess();
        } finally {
          setIsVerifying(false);
        }
      };
      if (typeof site?.latitude !== 'number' || typeof site?.longitude !== 'number') {
        await runAction();
        return;
      }
      setIsVerifying(true);
      const result = await verifyProximityToSite(site.latitude, site.longitude, 120);
      if (result.ok) {
        await runAction();
        return;
      }
      setIsVerifying(false);
      const distanceInfo =
        typeof result.distance === 'number' ? `\nDistance estimée : ${Math.round(result.distance)} m.` : '';
      Alert.alert(
        'Position à confirmer',
        `${result.message ?? 'Vous semblez trop loin du site.'}${distanceInfo}`,
        [
          { text: 'Réessayer', style: 'cancel' },
          { text: 'Continuer', style: 'default', onPress: () => { runAction(); } },
        ],
      );
    },
    [intervention, site],
  );

  const handleStart = React.useCallback(() => {
    const target = intervention;
    if (!target || !token || !user) {
      return;
    }
    if (!arrivalRecorded) {
      showToast('Arrivée requise', 'Enregistrez d’abord votre présence sur site.', 'error');
      return;
    }
    const startAction = async () => {
      const photo = await capturePhotoBase64();
      if (!photo) {
        showToast('Photo requise', 'Une photo est nécessaire pour démarrer la mission.', 'error');
        return;
      }
      const coords = await getCurrentCoordinates().catch(() => null);
      const now = new Date();
      if (!coords) {
        showToast('Position requise', 'Impossible de récupérer votre position pour démarrer.', 'error');
        return;
      }
      if (isOnline) {
        try {
          await checkIn(token, {
            userId: user.id,
            siteId: target.siteId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            interventionId: target.id,
            photo,
          });
        } catch (err: any) {
          if (err instanceof ApiError) {
            // Refus explicite du serveur (ex: hors créneau, trop loin) : on ne file pas en offline
            // et on n'affiche pas la mission comme démarrée.
            showToast('Démarrage refusé', err.message, 'error');
            return;
          }
          showToast('Démarrage hors ligne', "Impossible de contacter le serveur, l'action sera synchronisée plus tard.", 'info');
          // on file en offline
          queueEvent({
            userId: user.id,
            interventionId: target.id,
            siteId: target.siteId,
            type: 'START',
            timestamp: now.toISOString(),
            coordinates: coords,
            photo,
          });
        }
      } else {
        queueEvent({
          userId: user.id,
          interventionId: target.id,
          siteId: target.siteId,
          type: 'START',
          timestamp: now.toISOString(),
          coordinates: coords,
          photo,
        });
      }
      const displayTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      setIntervention((prev) =>
        prev
          ? {
              ...prev,
              status: 'IN_PROGRESS',
              actualStartTime: prev.actualStartTime ?? displayTime,
              actualStartAt: prev.actualStartAt ?? now.toISOString(),
              agents: prev.agents.map((a) =>
                a.id === user.id
                  ? {
                      ...a,
                      attendanceStatus: 'IN_PROGRESS',
                      checkInTime: a.checkInTime ?? now.toISOString(),
                    }
                  : a,
              ),
            }
          : prev,
      );
      AsyncStorage.setItem(START_CACHE_KEY(target.id), now.toISOString()).catch(() => {});
      try {
        await updateInterventionStatus(token, target.id, 'IN_PROGRESS');
      } catch (err) {
        console.warn('Unable to sync intervention start status', err);
      }
    };
    runWithProximityCheck(startAction);
  }, [arrivalRecorded, intervention, queueEvent, runWithProximityCheck, showToast, token, user]);

  const handleFinish = React.useCallback(() => {
    const target = intervention;
    if (!target || !token || !user) {
      return;
    }
    const finishAction = async () => {
      const photo = await capturePhotoBase64();
      if (!photo) {
        showToast('Photo requise', 'Une photo de fin de mission est nécessaire pour terminer.', 'error');
        return;
      }
      const now = new Date();
      if (isOnline) {
        try {
          await checkOut(token, { userId: user.id, interventionId: target.id, photo });
        } catch (err: any) {
          if (err instanceof ApiError) {
            // Refus explicite du serveur : on ne file pas en offline et on n'affiche pas la mission comme terminée.
            showToast('Fin de mission refusée', err.message, 'error');
            return;
          }
          showToast('Fin hors ligne', "Impossible de contacter le serveur, l'action sera synchronisée plus tard.", 'info');
          const coords = await getCurrentCoordinates().catch(() => null);
          queueEvent({
            userId: user.id,
            interventionId: target.id,
            siteId: target.siteId,
            type: 'END',
            timestamp: now.toISOString(),
            coordinates: coords ?? undefined,
            photo,
          });
        }
      } else {
        const coords = await getCurrentCoordinates().catch(() => null);
        queueEvent({
          userId: user.id,
          interventionId: target.id,
          siteId: target.siteId,
          type: 'END',
          timestamp: now.toISOString(),
          coordinates: coords ?? undefined,
          photo,
        });
      }
      // Ne met à jour localement que le pointage de l'agent courant (fiable, on vient de l'envoyer) :
      // le statut global de l'intervention dépend des AUTRES agents assignés et ne doit jamais être
      // deviné côté client — sinon un agent qui termine voit "Terminée" alors qu'un collègue est
      // toujours sur site. On va chercher la vraie valeur juste après.
      setIntervention((prev) =>
        prev
          ? {
              ...prev,
              agents: prev.agents.map((a) =>
                a.id === user.id
                  ? {
                      ...a,
                      attendanceStatus: 'COMPLETED',
                      checkOutTime: a.checkOutTime ?? now.toISOString(),
                    }
                  : a,
              ),
            }
          : prev,
      );
      AsyncStorage.removeItem(START_CACHE_KEY(target.id)).catch(() => {});
      // Un agent ne peut pas clôturer l'intervention globale (le backend refuse cette demande) :
      // même quand c'est le dernier agent à terminer, l'intervention passe en attente de validation
      // par le superviseur, jamais directement "Terminée" — on récupère le vrai statut pour l'affichage.
      try {
        const refreshed = await getInterventionById(token, target.id);
        if (refreshed) {
          setIntervention(refreshed);
          const stillWorking = refreshed.agents.filter(
            (a) => a.id !== user.id && a.attendanceStatus !== 'COMPLETED',
          );
          showToast(
            'Votre pointage est terminé',
            stillWorking.length
              ? `En attente de : ${stillWorking.map((a) => a.name).join(', ')}.`
              : 'Tous les agents ont terminé : en attente de validation par le superviseur.',
            'success',
          );
        }
      } catch (err) {
        console.warn('Unable to refresh intervention after finish', err);
      }
      setArrivalRecorded(false);
      setStartPersisted(null);
    };
    runWithProximityCheck(finishAction);
  }, [intervention, queueEvent, runWithProximityCheck, showToast, token, user]);

  const handleProblem = React.useCallback(() => {
    setProblemModalVisible(true);
  }, []);

  // Ouverture depuis l'accueil (« Signaler un problème ») : le formulaire s'affiche aussitôt.
  React.useEffect(() => {
    if (route.params.openProblem && intervention) {
      setProblemModalVisible(true);
      navigation.setParams({ openProblem: undefined });
    }
  }, [route.params.openProblem, intervention, navigation]);

  const handleArrival = React.useCallback(async () => {
    if (!intervention || !token || !user) return;
    if (!canMarkArrival && arrivalAllowedFrom) {
      showToast(
        'Trop tôt',
        `Vous pourrez enregistrer votre présence à partir de ${formatTime(arrivalAllowedFrom)}.`,
        'error',
      );
      return;
    }
    const toNumber = (value: any) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    };

    // Always refresh the site from backend to get latest GPS
    let targetSite = site;
    if (!targetSite || targetSite.latitude === undefined || targetSite.longitude === undefined) {
      try {
        const fetched = await getSite(token, intervention.siteId);
        const normalized: Site = {
          ...fetched,
          latitude: toNumber(fetched.latitude),
          longitude: toNumber(fetched.longitude),
        };
        targetSite = normalized;
        setSite(normalized);
        setIntervention((prev) =>
          prev
            ? {
                ...prev,
                siteAddress: normalized.address ?? prev.siteAddress,
                siteLatitude: normalized.latitude ?? prev.siteLatitude,
                siteLongitude: normalized.longitude ?? prev.siteLongitude,
              }
            : prev,
        );
      } catch (error: any) {
        showToast(
          'Coordonnées manquantes',
          "Impossible de récupérer les coordonnées GPS du site. Réessayez plus tard.",
          'error',
        );
        return;
      }
    }

    const targetLat = toNumber(targetSite?.latitude) ?? toNumber(intervention.siteLatitude);
    const targetLon = toNumber(targetSite?.longitude) ?? toNumber(intervention.siteLongitude);

    if (typeof targetLat !== 'number' || typeof targetLon !== 'number') {
      showToast(
        'Coordonnées manquantes',
        'Coordonnées GPS introuvables pour ce site. Enregistrement de présence impossible.',
        'error',
      );
      return;
    }

    setMarkingArrival(true);
    try {
      const coords = await getCurrentCoordinates();
      if (isOnline) {
        await markArrival(token, {
          userId: user.id,
          siteId: intervention.siteId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          interventionId: intervention.id,
        });
        showToast('Présence enregistrée', 'Votre arrivée sur site a été enregistrée.', 'success');
      } else {
        queueEvent({
          userId: user.id,
          interventionId: intervention.id,
          siteId: intervention.siteId,
          type: 'ARRIVAL',
          timestamp: new Date().toISOString(),
          coordinates: coords,
        });
        showToast('Présence enregistrée hors ligne', 'Elle sera synchronisée dès le retour réseau.', 'info');
      }
      setArrivalRecorded(true);
    } catch (error: any) {
      if (error instanceof ApiError) {
        // Le serveur a répondu et a explicitement refusé la demande (créneau dépassé, trop loin du site,
        // intervention non assignée...) : ce n'est pas un problème réseau, il ne faut ni mettre en file
        // d'attente hors ligne, ni faire croire que la présence a été enregistrée.
        showToast("Présence refusée", error.message, 'error');
      } else if (!isOnline) {
        showToast("Impossible d’enregistrer la présence", error?.message ?? 'Erreur inconnue', 'error');
      } else {
        // Échec réseau (pas de réponse du serveur) : on met en file pour synchronisation ultérieure.
        const coords = await getCurrentCoordinates().catch(() => null);
        if (coords) {
          queueEvent({
            userId: user.id,
            interventionId: intervention.id,
            siteId: intervention.siteId,
            type: 'ARRIVAL',
            timestamp: new Date().toISOString(),
            coordinates: coords,
          });
          showToast('Présence enregistrée hors ligne', 'Elle sera synchronisée dès le retour réseau.', 'info');
          setArrivalRecorded(true);
        } else {
          showToast("Impossible d’enregistrer la présence", error?.message ?? 'Erreur inconnue', 'error');
        }
      }
    } finally {
      setMarkingArrival(false);
    }
  }, [arrivalAllowedFrom, canMarkArrival, intervention, token, user, site, isOnline, queueEvent, showToast]);

  const openMaps = React.useCallback(() => {
    if (!site) {
      return;
    }
    openDirections(`${site.name} ${site.address}`, site.latitude, site.longitude);
  }, [site]);

  // Heartbeat interval to keep backend updated while running
  React.useEffect(() => {
    if (!token || !user || !intervention || intervention.status !== 'IN_PROGRESS') return;
    let cancelled = false;
    const sendBeat = async () => {
      try {
        const coords = await getCurrentCoordinates().catch(() => null);
        if (!coords) return;
        await heartbeat(token, {
          userId: user.id,
          siteId: intervention.siteId,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      } catch {
        // silent
      }
    };
    sendBeat();
    const interval = setInterval(() => {
      if (cancelled) return;
      sendBeat();
    }, 5 * 60 * 1000); // toutes les 5 minutes
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, user, intervention]);

  if (isLoading) {
    return (
      <HeaderLayout title="Intervention" subtitle="Chargement en cours" accent="Planning" showBack>
        <ActivityIndicator color={theme.colors.primary} />
      </HeaderLayout>
    );
  }

  if (!intervention) {
    return (
      <HeaderLayout title="Intervention" subtitle="Introuvable" accent="Planning" showBack>
        <View style={styles.iconRow}>
          <Ionicons name="alert-circle-outline" size={18} color={theme.colors.muted} />
          <Text style={styles.empty}>Impossible de trouver cette intervention.</Text>
        </View>
        <Button title="Retour" icon="arrow-back" onPress={goBack} />
      </HeaderLayout>
    );
  }

  return (
    <HeaderLayout
      title={intervention.siteName}
      subtitle={`${TYPE_LABELS[intervention.type]} • ${STATUS_LABELS[intervention.status]}`}
      accent="Détail intervention"
      showBack
      trailing={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          {isMarkingArrival && <ActivityIndicator color={theme.colors.primary} />}
          {!(isCompleted || userAttendance?.attendanceStatus === 'COMPLETED') && (
            <Button
              title={
                isMarkingArrival
                  ? 'Enregistrement...'
                  : arrivalRecorded
                  ? 'Présence enregistrée'
                  : 'Enregistrer ma présence'
              }
              icon="location-outline"
              onPress={handleArrival}
              disabled={
                isMarkingArrival ||
                isVerifying ||
                arrivalRecorded ||
                !canMarkArrival ||
                userAttendance?.attendanceStatus === 'COMPLETED'
              }
            />
          )}
        </View>
      }
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
          transform: [
            {
              translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            },
          ],
        }}
      >
        <ScrollView
          style={styles.sectionStack}
          contentContainerStyle={{ gap: theme.spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
        {hasPendingSync && (
          <View style={styles.syncBanner}>
            <View style={styles.syncBannerHeader}>
              <Ionicons name="sync-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.syncBannerTitle}>Intervention en attente de synchronisation</Text>
            </View>
            <Text style={styles.syncBannerText}>
              {isOnline
                ? 'Synchronisation en cours…'
                : 'Hors connexion, envoi dès le retour réseau.'}
            </Text>
            <Text style={styles.syncBannerText}>
              Événements en attente : {pendingEvents.length} (Arrivée/Début/Fin)
            </Text>
            {pendingEvents.slice(0, 5).map((evt) => (
              <Text key={evt.id} style={styles.syncBannerText}>
                • {evt.type} {evt.timestamp?.slice(11, 16)} — {evt.status ?? 'pending'}
                {evt.status === 'failed' && evt.error ? ` (${evt.error})` : ''}
              </Text>
            ))}
            {lastError && <Text style={[styles.syncBannerText, { color: '#c62828' }]}>Dernière erreur : {lastError}</Text>}
            {pendingEvents.length > 5 && (
              <Text style={styles.syncBannerText}>… {pendingEvents.length - 5} élément(s) supplémentaires</Text>
            )}
            {pendingEvents.length > 0 && (
              <Button title="Purger la file locale" variant="ghost" icon="trash-outline" onPress={clearQueue} />
            )}
          </View>
        )}

        {!isRunning && (
          <StatusPill label={STATUS_LABELS[intervention.status]} tone={STATUS_TONE[intervention.status]} />
        )}

        <RunningTimer isRunning={isRunning} startDate={startDate} plannedStart={plannedStart} plannedEnd={plannedEnd} />

        <Section title="Type d’intervention">
          <View style={styles.iconRow}>
            <Ionicons name={TYPE_ICONS[intervention.type]} size={16} color={theme.colors.ink} />
            <Text style={styles.highlight}>{TYPE_LABELS[intervention.type]}</Text>
          </View>
          {intervention.type === 'PUNCTUAL' && intervention.subType && (
            <Text style={styles.textMuted}>{intervention.subType}</Text>
          )}
        </Section>

        <Section title={t('mission.site')}>
          <View style={styles.iconRow}>
            <Ionicons name="location-outline" size={16} color={theme.colors.ink} />
            <Text style={styles.highlight}>{site?.name ?? intervention.siteName}</Text>
          </View>
          {site?.address && <Text style={styles.textMuted}>{site.address}</Text>}
          <Button title={t('site.openMaps')} variant="ghost" icon="navigate-outline" onPress={openMaps} />
        </Section>

        {site ? (
          <Section title={t('site.instructions')}>
            {site.photos?.[0] ? (
              <Image source={{ uri: site.photos[0] }} style={styles.sitePhoto} resizeMode="cover" accessibilityLabel={site.name} />
            ) : null}
            {site.accessInstructions ? (
              <View style={styles.iconRow}>
                <Ionicons name="key-outline" size={16} color={theme.colors.ink} />
                <Text style={[styles.row, { flex: 1 }]}>
                  <Text style={styles.highlight}>{t('site.access')} : </Text>
                  {site.accessInstructions}
                </Text>
              </View>
            ) : null}
            {site.accessCode ? (
              <View style={styles.iconRow}>
                <Ionicons name="keypad-outline" size={16} color={theme.colors.ink} />
                <Text style={styles.row}>
                  <Text style={styles.highlight}>{t('site.code')} : </Text>
                  {site.accessCode}
                </Text>
              </View>
            ) : null}
            {site.contactName || site.contactPhone ? (
              <View style={styles.iconRow}>
                <Ionicons name="person-outline" size={16} color={theme.colors.ink} />
                <Text style={[styles.row, { flex: 1 }]}>
                  <Text style={styles.highlight}>{t('site.contact')} : </Text>
                  {[site.contactName, site.contactPhone].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ) : null}
            {site.contactPhone ? (
              <Button
                title={t('site.call', { name: site.contactName ?? site.contactPhone })}
                variant="ghost"
                icon="call-outline"
                onPress={() => Linking.openURL(`tel:${site.contactPhone!.replace(/\s+/g, '')}`)}
              />
            ) : null}
            {!site.accessInstructions && !site.accessCode && !site.contactPhone && !site.photos?.length ? (
              <Text style={styles.textMuted}>{t('site.none')}</Text>
            ) : null}
          </Section>
        ) : null}

        <Section title={t('mission.schedule')}>
          <View style={styles.iconRow}>
            <Ionicons name="time-outline" size={16} color={theme.colors.ink} />
            <Text style={styles.row}>{t('mission.planned', { start: intervention.startTime, end: intervention.endTime })}</Text>
          </View>
          {arrivalAllowedFrom && (
            <Text style={styles.textMuted}>
              Arrivée possible dès {formatTime(arrivalAllowedFrom)} (30 min avant le début)
            </Text>
          )}
          {actualStartDisplay && (
            <Text style={styles.row}>
              Réel début : <Text style={styles.highlight}>{actualStartDisplay}</Text>
            </Text>
          )}
          {actualEndDisplay && (
            <Text style={styles.row}>
              Réel fin : <Text style={styles.highlight}>{actualEndDisplay}</Text>
            </Text>
          )}
        </Section>

        <Section title={t('mission.agents')}>
          <AssignedAgentsList agents={intervention.agents} currentUserId={user?.id} />
        </Section>

        {intervention.type === 'PUNCTUAL' && (
          <Section title="Camions mobilisés">
            {intervention.truckLabels?.length ? (
              intervention.truckLabels.map((truck) => (
                <View key={truck} style={styles.iconRow}>
                  <Ionicons name="car-outline" size={16} color={theme.colors.muted} />
                  <Text style={styles.row}>• {truck}</Text>
                </View>
              ))
            ) : (
              <View style={styles.iconRow}>
                <Ionicons name="car-outline" size={16} color={theme.colors.muted} />
                <Text style={styles.textMuted}>Pas de camion affecté.</Text>
              </View>
            )}
          </Section>
        )}

        {intervention.observation && (
          <Section title="Observation">
            <View style={styles.iconRow}>
              <Ionicons name="document-text-outline" size={16} color={theme.colors.ink} />
              <Text style={styles.row}>{intervention.observation}</Text>
            </View>
          </Section>
        )}

        {isRunning && (
          <Section title={t('mission.checklist')}>
            <InterventionChecklist interventionId={intervention.id} />
          </Section>
        )}
        </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
        {!arrivalRecorded && !canMarkArrival && arrivalAllowedFrom && (
          <Text style={styles.textMuted}>
            Arrivée possible dès {formatTime(arrivalAllowedFrom)} (30 min avant le début).
          </Text>
        )}
        {isVerifying && (
          <View style={styles.verifyingRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.verifyingText}>Vérification de la position…</Text>
          </View>
        )}
        {isMarkingArrival && (
          <View style={styles.verifyingRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.verifyingText}>Enregistrement de présence...</Text>
          </View>
        )}
        {!isCompleted && !hasStarted && (
          <SwipeToConfirm
            label={t('mission.slideStart')}
            confirmingLabel="Relâchez pour démarrer"
            onConfirm={handleStart}
            disabled={isVerifying || !arrivalRecorded}
          />
        )}
        {!isCompleted && hasStarted && !(userAttendance?.attendanceStatus === 'COMPLETED') && (
          <SwipeToConfirm
            label={t('mission.slideEnd')}
            confirmingLabel="Relâchez pour terminer"
            onConfirm={handleFinish}
            disabled={isVerifying}
            tone="danger"
          />
        )}
        {isPlanned && !hasStarted && (
          <Button
            title={t('mission.swap')}
            variant="ghost"
            icon="swap-horizontal-outline"
            onPress={() =>
              navigation.navigate('AgentShiftSwaps', {
                interventionId: intervention.id,
                siteName: intervention.siteName,
                date: intervention.date,
                startTime: intervention.startTime,
                endTime: intervention.endTime,
              })
            }
          />
        )}
        <Button title={t('mission.problem')} variant="ghost" icon="alert-circle-outline" onPress={handleProblem} />
      </Animated.View>
      <ProblemModal
        visible={isProblemModalVisible}
        onClose={() => setProblemModalVisible(false)}
        type={problemType}
        onTypeChange={setProblemType}
        description={problemDescription}
        onDescriptionChange={setProblemDescription}
        photos={problemPhotos}
        onAddPhoto={async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
            showToast('Permission requise', 'Activez la caméra pour joindre une photo.', 'error');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            quality: 0.5,
            allowsEditing: true,
          });
          if (!result.canceled && result.assets?.length) {
            setProblemPhotos((prev) => [...prev, result.assets[0].uri]);
          }
        }}
        onRemovePhoto={(uri) =>
          setProblemPhotos((prev) => prev.filter((photo) => photo !== uri))
        }
        onSubmit={async () => {
          if (!intervention) {
            return;
          }
          if (!problemDescription.trim()) {
            showToast('Description requise', 'Veuillez décrire le problème rencontré.', 'error');
            return;
          }
          setSubmittingProblem(true);
          try {
            if (!token) {
              throw new Error('Session expirée');
            }
            // Convertit les photos locales en base64 pour les transmettre à l'API
            const photosBase64 = await Promise.all(
              problemPhotos.map(async (uri) => {
                try {
                  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
                  return `data:image/jpeg;base64,${base64}`;
                } catch (e) {
                  return null;
                }
              }),
            );
            const cleanedPhotos = photosBase64.filter((v): v is string => Boolean(v));

            const anomaly = { type: problemType, description: problemDescription.trim(), photos: cleanedPhotos };
            try {
              await createAnomaly(token, { interventionId: intervention.id, ...anomaly });
              showToast('Merci', 'Votre anomalie a été transmise à l’équipe.', 'success');
            } catch (err) {
              if (!(err instanceof NetworkError)) throw err;
              // Sans réseau (sous-sol, parking) : le signalement part au retour du réseau.
              await queueEvent({
                userId: user?.id ?? '',
                interventionId: intervention.id,
                siteId: intervention.siteId,
                type: 'ANOMALY',
                timestamp: new Date().toISOString(),
                anomaly,
              });
              showToast('Merci', t('mission.offlineSaved'), 'info');
            }
            setIntervention((prev) => (prev ? { ...prev, status: 'NEEDS_REVIEW' } : prev));
            setProblemDescription('');
            setProblemPhotos([]);
            setProblemType('CLEANLINESS');
            setProblemModalVisible(false);
          } catch (error) {
            showToast('Erreur', "Impossible d'envoyer l'anomalie.", 'error');
          } finally {
            setSubmittingProblem(false);
          }
        }}
        submitting={isSubmittingProblem}
      />
    </HeaderLayout>
  );
}

const styles = StyleSheet.create({
  sectionStack: {
    flex: 1,
  },
  highlight: {
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.ink,
  },
  textMuted: {
    color: theme.colors.muted,
  },
  row: {
    color: theme.colors.ink,
  },
  empty: {
    color: theme.colors.muted,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  actions: {
    gap: theme.spacing.md,
  },
  verifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  verifyingText: {
    color: theme.colors.muted,
  },
  syncBanner: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 4,
  },
  syncBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  syncBannerTitle: {
    fontFamily: theme.fonts.bodyBold,
    color: theme.colors.primary,
  },
  syncBannerText: {
    color: theme.colors.muted,
  },
  sitePhoto: {
    width: '100%',
    height: 160,
    borderRadius: theme.radii.lg,
  },
});
