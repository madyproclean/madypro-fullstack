import React, { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CompositeNavigationProp,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '@/config/theme';
import { ClockCard } from '@/components/ui/ClockCard';
import { StatRow } from '@/components/ui/StatRow';
import { HeaderLayout } from '@/components/layout/HeaderLayout';
import { InterventionCard } from '@/components/cards/InterventionCard';
import { Intervention } from '@/types/intervention';
import { isPlannedOnly, listMyMissionsByRange } from '@/services/api/interventions.api';
import { useToast } from '@/context/ToastContext';
import { useAuthContext } from '@/context/AuthContext';
import { AgentStackParamList, AgentTabParamList } from '@/navigation/types';
import { useSyncContext } from '@/context/SyncContext';
import { buildDateTime, formatTime } from '@/utils/interventionTime';
import { describeWeatherCode, getCurrentWeather, WeatherSnapshot } from '@/services/api/weather.api';
import { useI18n } from '@/i18n';
import type { MessageKey } from '@/i18n';
import { RouteCard } from '@/components/agent/RouteCard';
import { MonthSummaryCard } from '@/components/agent/MonthSummaryCard';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<AgentTabParamList, 'AgentHome'>,
  NativeStackNavigationProp<AgentStackParamList>
>;

type PriorityMoment =
  | { kind: 'in-progress'; intervention: Intervention; since?: string }
  | { kind: 'upcoming'; intervention: Intervention; startsAt: Date }
  | { kind: 'none' };

function computePriorityMoment(interventions: Intervention[], userId?: string): PriorityMoment {
  if (!userId) return { kind: 'none' };
  const now = new Date();

  const inProgress = interventions.find((intervention) => {
    const mine = intervention.agents?.find((a) => a.id === userId);
    return Boolean(mine?.checkInTime) && !mine?.checkOutTime;
  });
  if (inProgress) {
    const mine = inProgress.agents.find((a) => a.id === userId);
    return { kind: 'in-progress', intervention: inProgress, since: mine?.checkInTime };
  }

  const upcoming = interventions
    .filter((intervention) => {
      const mine = intervention.agents?.find((a) => a.id === userId);
      return !mine?.checkOutTime && intervention.status !== 'CANCELLED';
    })
    .map((intervention) => ({ intervention, startsAt: buildDateTime(intervention.date, intervention.startTime) }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .find(({ startsAt }) => startsAt.getTime() > now.getTime() - 60 * 60 * 1000); // garde les missions du jour même si l'heure est légèrement dépassée

  if (upcoming) {
    return { kind: 'upcoming', intervention: upcoming.intervention, startsAt: upcoming.startsAt };
  }

  return { kind: 'none' };
}

function formatCountdown(target: Date, now: Date, t: (key: MessageKey, vars?: Record<string, string | number>) => string) {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return t('home.now');
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return t('home.inMinutes', { minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return t('home.inHours', { hours, minutes: rest ? String(rest).padStart(2, '0') : '' }).trim();
}

const HOME_CACHE_KEY = 'agent:home:interventions-cache';

export default function AgentHomeScreen() {
  const [scope, setScope] = React.useState<'today' | 'week'>('today');
  const [interventions, setInterventions] = React.useState<{
    today: Intervention[];
    week: Intervention[];
  }>({ today: [], week: [] });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [isOfflineCache, setIsOfflineCache] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());

  const navigation = useNavigation<Navigation>();
  const { t } = useI18n();
  const { showToast } = useToast();
  const { token, user } = useAuthContext();
  const { flush, pendingEvents, isOnline } = useSyncContext();

  const loadInterventions = useCallback(async () => {
    if (!token || !user) {
      setInterventions({ today: [], week: [] });
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [todayList, weekList] = await Promise.all([
        listMyMissionsByRange(token, 'today', user.id),
        listMyMissionsByRange(token, 'week', user.id),
      ]);
      const next = { today: todayList, week: weekList };
      setInterventions(next);
      setIsOfflineCache(false);
      AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ userId: user.id, data: next, cachedAt: Date.now() })).catch(
        () => {},
      );
    } catch (err) {
      const cached = await AsyncStorage.getItem(HOME_CACHE_KEY).catch(() => null);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.userId === user.id) {
            setInterventions(parsed.data);
            setIsOfflineCache(true);
            setError(null);
            return;
          }
        } catch {
          // cache corrompu, on ignore
        }
      }
      setError(err instanceof Error ? err.message : 'Impossible de charger les interventions');
      setInterventions({ today: [], week: [] });
    } finally {
      setIsLoading(false);
    }
  }, [token, user]);

  React.useEffect(() => {
    loadInterventions();
  }, [loadInterventions]);

  useFocusEffect(
    React.useCallback(() => {
      loadInterventions();
    }, [loadInterventions]),
  );

  React.useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  const wasOnlineRef = React.useRef(isOnline);
  React.useEffect(() => {
    // Retour de connexion pendant que l'écran est déjà affiché : on ne veut pas attendre un
    // pull-to-refresh manuel ou un changement de focus pour faire disparaître le bandeau hors ligne.
    if (isOnline && !wasOnlineRef.current) {
      loadInterventions();
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, loadInterventions]);

  const priority = React.useMemo(
    () => computePriorityMoment(interventions.today, user?.id),
    [interventions.today, user?.id],
  );

  const [weather, setWeather] = React.useState<WeatherSnapshot | null>(null);
  const weatherSiteCoords = React.useMemo(() => {
    const source = priority.kind !== 'none' ? priority.intervention : interventions.today[0];
    if (!source || typeof source.siteLatitude !== 'number' || typeof source.siteLongitude !== 'number') {
      return null;
    }
    return { latitude: source.siteLatitude, longitude: source.siteLongitude };
  }, [priority, interventions.today]);

  React.useEffect(() => {
    if (!weatherSiteCoords) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    getCurrentWeather(weatherSiteCoords.latitude, weatherSiteCoords.longitude).then((result) => {
      if (!cancelled) setWeather(result);
    });
    return () => {
      cancelled = true;
    };
  }, [weatherSiteCoords]);

  const displayed = scope === 'today' ? interventions.today : interventions.week;
  const emptyLabel =
    scope === 'today' ? t('home.emptyToday') : t('home.emptyWeek');

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await flush();
      await loadInterventions();
    } finally {
      setRefreshing(false);
    }
  }, [flush, loadInterventions]);

  const goToIntervention = (intervention: Intervention) => {
    if (isPlannedOnly(intervention)) {
      // Mission prévue mais pas encore créée : sa fiche s'ouvre le jour même, peu avant le début.
      showToast(intervention.siteName, t('planning.notYet'), 'info');
      return;
    }
    navigation.navigate('AgentIntervention', { id: intervention.id });
  };

  const firstName = user?.name?.split(' ')[0] ?? 'Agent';

  return (
    <HeaderLayout
      title={t('home.hello', { name: firstName })}
      subtitle={t('home.subtitle')}
      accent="Agent Madypro Clean"
    >
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        contentContainerStyle={{ gap: theme.spacing.lg }}
      >
        {pendingEvents.length > 0 && (
          <TouchableOpacity
            style={styles.syncBadge}
            onPress={() => navigation.navigate('AgentSyncQueue')}
          >
            <Text style={styles.syncBadgeText}>
              {isOnline ? t('home.syncing', { count: pendingEvents.length }) : t('home.pending', { count: pendingEvents.length })}
            </Text>
          </TouchableOpacity>
        )}
        {isOfflineCache && (
          <View style={styles.syncBadge}>
            <Text style={styles.syncBadgeText}>{t('home.offline')}</Text>
          </View>
        )}

        {weather && (
          <View style={styles.weatherRow}>
            <Text style={styles.weatherTemp}>{weather.temperatureC}°C</Text>
            <Text style={styles.weatherLabel}>{t('home.weatherOnSite', { weather: describeWeatherCode(weather.weatherCode) })}</Text>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : priority.kind === 'in-progress' ? (
          <ClockCard
            state="in-progress"
            statusLabel={t('home.inProgress')}
            siteName={priority.intervention.siteName}
            timeRange={`${priority.intervention.startTime} – ${priority.intervention.endTime}${
              priority.since ? ` · ${t('home.startedAt', { time: formatTime(new Date(priority.since)) })}` : ''
            }`}
            onPress={() => goToIntervention(priority.intervention)}
          />
        ) : priority.kind === 'upcoming' ? (
          <ClockCard
            state="upcoming"
            statusLabel={t('home.next', { when: formatCountdown(priority.startsAt, now, t) })}
            siteName={priority.intervention.siteName}
            timeRange={`${priority.intervention.startTime} – ${priority.intervention.endTime}`}
            onPress={() => goToIntervention(priority.intervention)}
          />
        ) : (
          <ClockCard state="empty" />
        )}

        {!isLoading && priority.kind === 'in-progress' ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.problemButton}
            onPress={() => navigation.navigate('AgentIntervention', { id: priority.intervention.id, openProblem: true })}
          >
            <Ionicons name="alert-circle-outline" size={22} color={theme.colors.status.absent} />
            <Text style={styles.problemText}>{t('mission.problem')}</Text>
          </TouchableOpacity>
        ) : null}

        {!isLoading && priority.kind === 'upcoming' ? (
          <RouteCard
            siteName={priority.intervention.siteName}
            address={priority.intervention.siteAddress ?? priority.intervention.siteName}
            latitude={priority.intervention.siteLatitude}
            longitude={priority.intervention.siteLongitude}
          />
        ) : null}

        {!isLoading ? <MonthSummaryCard /> : null}

        {!isLoading && (
          <StatRow
            items={[
              { label: t('home.today'), value: interventions.today.length },
              {
                label: t('home.done'),
                value: interventions.today.filter((i) => i.agents?.find((a) => a.id === user?.id)?.checkOutTime)
                  .length,
              },
              { label: t('home.week'), value: interventions.week.length },
            ]}
          />
        )}

        <View style={styles.block}>
          <View style={styles.segmented}>
            {[
              { label: t('home.today'), value: 'today' as const },
              { label: t('home.week'), value: 'week' as const },
            ].map((tab) => {
              const active = scope === tab.value;
              return (
                <TouchableOpacity
                  key={tab.value}
                  style={[styles.segmentButton, active && styles.segmentButtonActive]}
                  onPress={() => setScope(tab.value)}
                >
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {scope === 'today' ? t('home.planToday') : t('home.planNext')}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('AgentPlanning')} style={styles.inlineLinkRow}>
              <Text style={styles.inlineLink}>{t('home.seeAll')}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {isLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : displayed.length === 0 ? (
            <Text style={styles.empty}>{emptyLabel}</Text>
          ) : (
            <View style={styles.stack}>
              {displayed.map((intervention) => (
                <InterventionCard
                  key={intervention.id}
                  intervention={intervention}
                  onPress={goToIntervention}
                />
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('AgentRequests')} style={styles.linkRow}>
          <Text style={styles.link}>{t('home.declareAbsence')}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.muted} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('AgentShiftSwaps')} style={styles.linkRow}>
          <Text style={styles.link}>{t('home.swaps')}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.muted} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('AgentTeamFeed')} style={styles.linkRow}>
          <Text style={styles.link}>{t('home.feed')}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.muted} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('AgentOnboardingChecklist')} style={styles.linkRow}>
          <Text style={styles.link}>{t('home.onboarding')}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.muted} />
        </TouchableOpacity>
      </ScrollView>
    </HeaderLayout>
  );
}

const styles = StyleSheet.create({
  problemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.status.absent,
    backgroundColor: '#fff',
  },
  problemText: { color: theme.colors.status.absent, fontSize: 16, fontWeight: '700' },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  weatherTemp: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 16,
    color: theme.colors.ink,
  },
  weatherLabel: {
    color: theme.colors.muted,
    fontSize: 13,
  },
  syncBadge: {
    backgroundColor: theme.colors.status.lateSoft,
    borderRadius: theme.radii.pill,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    alignSelf: 'flex-start',
  },
  syncBadgeText: {
    color: theme.colors.status.late,
    fontSize: 12,
    fontFamily: theme.fonts.bodySemiBold,
  },
  block: {
    gap: theme.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: theme.fonts.bodySemiBold,
  },
  inlineLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  inlineLink: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: 13,
  },
  stack: {
    gap: theme.spacing.md,
  },
  linkRow: {
    marginTop: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  link: {
    color: theme.colors.muted,
    textTransform: 'uppercase',
  },
  error: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: theme.radii.pill,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    borderRadius: theme.radii.pill,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: theme.colors.primarySoft,
  },
  segmentLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.bodySemiBold,
  },
  segmentLabelActive: {
    color: theme.colors.primary,
  },
  empty: {
    color: theme.colors.muted,
    fontStyle: 'italic',
  },
});
