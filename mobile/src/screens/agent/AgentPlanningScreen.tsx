import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { HeaderLayout } from '@/components/layout/HeaderLayout';
import { InterventionCard } from '@/components/cards/InterventionCard';
import { theme } from '@/config/theme';
import { Intervention } from '@/types/intervention';
import { isPlannedOnly, listMyMissions } from '@/services/api/interventions.api';
import { agentCache } from '@/services/agentCache';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/i18n';
import { useAuthContext } from '@/context/AuthContext';
import { useStaggeredFadeIn } from '@/hooks/useStaggeredFadeIn';

type ViewMode = 'liste' | 'calendrier';
type CalendarMode = 'semaine' | 'mois';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const toISODate = (d: Date) => {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};
const startOfWeek = (d: Date) => {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // lundi = 0
  copy.setDate(copy.getDate() - day);
  return copy;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d: Date, n: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

const buildMonthGrid = (month: Date) => {
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) days.push(addDays(gridStart, i));
  return days;
};

const weekLabel = (weekStart: Date) => {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startLabel = weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: sameMonth ? undefined : 'short' });
  const endLabel = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${startLabel} – ${endLabel}`;
};
const monthLabel = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const dayLabel = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function AgentPlanningScreen() {
  const { token, user } = useAuthContext();
  const { showToast } = useToast();
  const { t } = useI18n();
  const navigation = useNavigation();
  const [viewMode, setViewMode] = useState<ViewMode>('liste');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('semaine');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { getItemStyle } = useStaggeredFadeIn();

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === 'calendrier' && calendarMode === 'semaine') {
      const start = startOfWeek(anchorDate);
      return { rangeStart: toISODate(start), rangeEnd: toISODate(addDays(start, 6)) };
    }
    if (viewMode === 'calendrier' && calendarMode === 'mois') {
      const days = buildMonthGrid(anchorDate);
      return { rangeStart: toISODate(days[0]), rangeEnd: toISODate(days[days.length - 1]) };
    }
    return { rangeStart: toISODate(addDays(anchorDate, -14)), rangeEnd: toISODate(addDays(anchorDate, 60)) };
  }, [viewMode, calendarMode, anchorDate]);

  const load = React.useCallback(() => {
    if (!token || !user) return;
    setLoading(true);
    setError(null);
    agentCache
      .loadWithCache(user.id, `planning:${rangeStart}:${rangeEnd}`, () => listMyMissions(token, rangeStart, rangeEnd, user.id))
      .then(({ value }) => setInterventions(value))
      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de charger le planning'))
      .finally(() => setLoading(false));
  }, [token, user, rangeStart, rangeEnd]);

  useFocusEffect(
    React.useCallback(() => {
      load();
      return () => {};
    }, [load]),
  );

  useEffect(() => {
    // Une sélection de jour (vue mois) ne doit pas survivre à un changement de mois/semaine ou
    // de mode : sinon le panneau de détail affiche un jour qui n'est plus visible dans la grille.
    setSelectedDate(null);
  }, [anchorDate, calendarMode]);

  const sorted = useMemo(
    () => [...interventions].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
    [interventions],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Intervention[]>();
    interventions.forEach((i) => {
      const list = map.get(i.date) ?? [];
      list.push(i);
      map.set(i.date, list);
    });
    return map;
  }, [interventions]);

  const goToIntervention = (intervention: Intervention) => {
    if (isPlannedOnly(intervention)) {
      showToast(intervention.siteName, t('planning.notYet'), 'info');
      return;
    }
    (navigation as any).navigate('AgentIntervention', { id: intervention.id });
  };

  const monthDays = useMemo(() => buildMonthGrid(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchorDate]);

  const selectedDayInterventions = selectedDate ? byDate.get(selectedDate) ?? [] : [];

  return (
    <HeaderLayout title="Mon planning" subtitle="Vos interventions passées et à venir" accent="Planning" showBack>
      <View style={styles.toggleRow}>
        {(['liste', 'calendrier'] as ViewMode[]).map((mode) => (
          <Pressable
            key={mode}
            style={[styles.toggleButton, viewMode === mode && styles.toggleButtonActive]}
            onPress={() => setViewMode(mode)}
          >
            <View style={styles.toggleContent}>
              <Ionicons
                name={mode === 'liste' ? 'list-outline' : 'calendar-outline'}
                size={16}
                color={viewMode === mode ? '#fff' : theme.colors.muted}
              />
              <Text style={[styles.toggleLabel, viewMode === mode && styles.toggleLabelActive]}>
                {mode === 'liste' ? 'Liste' : 'Calendrier'}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {viewMode === 'calendrier' && (
        <View style={styles.toggleRow}>
          {(['semaine', 'mois'] as CalendarMode[]).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.toggleButtonSmall, calendarMode === mode && styles.toggleButtonActive]}
              onPress={() => setCalendarMode(mode)}
            >
              <Text style={[styles.toggleLabel, calendarMode === mode && styles.toggleLabelActive]}>
                {mode === 'semaine' ? 'Semaine' : 'Mois'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {viewMode === 'liste' && (
        <View style={styles.stack}>
          {isLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : sorted.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.muted} />
              <Text style={styles.empty}>Aucune intervention sur cette période.</Text>
            </View>
          ) : (
            sorted.map((intervention, index) => (
              <Animated.View key={intervention.id} style={[getItemStyle(index), { marginBottom: theme.spacing.sm }]}>
                <InterventionCard intervention={intervention} onPress={goToIntervention} />
              </Animated.View>
            ))
          )}
        </View>
      )}

      {viewMode === 'calendrier' && calendarMode === 'semaine' && (
        <View style={styles.stack}>
          <View style={styles.navRow}>
            <Pressable onPress={() => setAnchorDate((d) => addDays(d, -7))} style={styles.navButton}>
              <Text style={styles.navButtonText}>‹ Précédente</Text>
            </Pressable>
            <Text style={styles.navLabel}>{weekLabel(startOfWeek(anchorDate))}</Text>
            <Pressable onPress={() => setAnchorDate((d) => addDays(d, 7))} style={styles.navButton}>
              <Text style={styles.navButtonText}>Suivante ›</Text>
            </Pressable>
          </View>
          {isLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            weekDays.map((day) => {
              const iso = toISODate(day);
              const dayItems = byDate.get(iso) ?? [];
              return (
                <View key={iso} style={styles.daySection}>
                  <View style={styles.dayHeadingRow}>
                    <Ionicons name="calendar-outline" size={16} color={theme.colors.ink} />
                    <Text style={styles.dayHeading}>{dayLabel(day)}</Text>
                  </View>
                  {dayItems.length === 0 ? (
                    <View style={styles.emptyRow}>
                      <Ionicons name="calendar-outline" size={14} color={theme.colors.muted} />
                      <Text style={styles.emptySmall}>Aucune intervention.</Text>
                    </View>
                  ) : (
                    dayItems
                      .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map((intervention) => (
                        <InterventionCard key={intervention.id} intervention={intervention} onPress={goToIntervention} />
                      ))
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

      {viewMode === 'calendrier' && calendarMode === 'mois' && (
        <View style={styles.stack}>
          <View style={styles.navRow}>
            <Pressable onPress={() => setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={styles.navButton}>
              <Text style={styles.navButtonText}>‹</Text>
            </Pressable>
            <Text style={styles.navLabel}>{monthLabel(anchorDate)}</Text>
            <Pressable onPress={() => setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={styles.navButton}>
              <Text style={styles.navButtonText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={`${label}-${i}`} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          {isLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <View style={styles.monthGrid}>
              {monthDays.map((day) => {
                const iso = toISODate(day);
                const inMonth = day.getMonth() === anchorDate.getMonth();
                const count = (byDate.get(iso) ?? []).length;
                const isSelected = selectedDate === iso;
                return (
                  <Pressable
                    key={iso}
                    style={[styles.monthCell, isSelected && styles.monthCellSelected]}
                    onPress={() => setSelectedDate(iso === selectedDate ? null : iso)}
                  >
                    <Text style={[styles.monthCellText, !inMonth && styles.monthCellTextMuted]}>{day.getDate()}</Text>
                    {count > 0 && <View style={styles.monthDot} />}
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedDate && (
            <View style={styles.daySection}>
              <View style={styles.dayHeadingRow}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.ink} />
                <Text style={styles.dayHeading}>{dayLabel(new Date(`${selectedDate}T00:00:00`))}</Text>
              </View>
              {selectedDayInterventions.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Ionicons name="calendar-outline" size={14} color={theme.colors.muted} />
                  <Text style={styles.emptySmall}>Aucune intervention.</Text>
                </View>
              ) : (
                selectedDayInterventions
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((intervention) => (
                    <InterventionCard key={intervention.id} intervention={intervention} onPress={goToIntervention} />
                  ))
              )}
            </View>
          )}
        </View>
      )}
    </HeaderLayout>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.shell,
    alignItems: 'center',
  },
  toggleButtonSmall: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.shell,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  toggleLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.bodySemiBold,
  },
  toggleLabelActive: {
    color: '#fff',
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  stack: {
    gap: theme.spacing.md,
  },
  error: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  empty: {
    color: theme.colors.muted,
    fontStyle: 'italic',
  },
  emptySmall: {
    color: theme.colors.muted,
    fontStyle: 'italic',
    fontSize: 13,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  navButtonText: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.bodySemiBold,
  },
  navLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.ink,
    textTransform: 'capitalize',
  },
  daySection: {
    gap: theme.spacing.sm,
  },
  dayHeading: {
    fontFamily: theme.fonts.bodySemiBold,
    color: theme.colors.ink,
    textTransform: 'capitalize',
  },
  dayHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: theme.colors.muted,
    fontSize: 12,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  monthCellSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radii.md,
  },
  monthCellText: {
    color: theme.colors.ink,
  },
  monthCellTextMuted: {
    color: theme.colors.clay,
  },
  monthDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
  },
});
