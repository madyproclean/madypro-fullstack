import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/config/theme';
import { useAuthContext } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  listActiveAgents,
  listSitePrestations,
  listSiteTemplates,
  listSupervisedSites,
  previewSiteTemplateImpact,
  saveSiteTemplate,
} from '@/services/api/supervision.api';
import { AgentOption, SitePrestation, SiteTemplate, SupervisedSite, TemplateImpact, TemplateStop } from '@/types/supervision';
import { FormSheet } from './FormSheet';
import { DateTimeField } from './DateTimeField';
import { AgentPicker } from './AgentPicker';
import { formatDayShort } from './format';

/** Lundi en premier ; valeurs du serveur : 0 = dimanche. */
const WEEK_DAYS: Array<{ value: number; short: string; label: string }> = [
  { value: 1, short: 'Lun', label: 'lundi' },
  { value: 2, short: 'Mar', label: 'mardi' },
  { value: 3, short: 'Mer', label: 'mercredi' },
  { value: 4, short: 'Jeu', label: 'jeudi' },
  { value: 5, short: 'Ven', label: 'vendredi' },
  { value: 6, short: 'Sam', label: 'samedi' },
  { value: 0, short: 'Dim', label: 'dimanche' },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type Props = {
  visible: boolean;
  /** Site dont on modifie le gabarit ; absent : le superviseur choisit d'abord le site. */
  siteId?: string | null;
  /** Créneau mis en évidence (ouvert depuis une mission). */
  focusStopId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

/** Résumé d'un créneau en langage courant : « lun., mer. · 07:00–10:00 ». */
export const describeStop = (stop: TemplateStop) => {
  const when = stop.specificDate
    ? `le ${formatDayShort(stop.specificDate.slice(0, 10))}`
    : WEEK_DAYS.filter((d) => stop.daysOfWeek.includes(d.value))
        .map((d) => d.short.toLowerCase())
        .join(', ') + (stop.intervalWeeks > 1 ? ` (toutes les ${stop.intervalWeeks} semaines)` : '');
  return `${when} · ${stop.startTime}–${stop.endTime}`;
};

const comparable = (stops: TemplateStop[]) =>
  JSON.stringify(
    stops.map((s) => ({ ...s, daysOfWeek: [...s.daysOfWeek].sort(), agentIds: [...s.agentIds].sort(), order: undefined })),
  );

/**
 * Gabarit d'un site : toutes ses missions en découlent. Créer, déplacer une mission ou changer ses
 * agents habituels = modifier un créneau ici. Pour un superviseur, l'enregistrement est soumis à
 * l'administrateur ; en attendant, la version validée continue de créer les missions.
 */
export const TemplateEditorSheet: React.FC<Props> = ({ visible, siteId: initialSiteId, focusStopId, onClose, onSaved }) => {
  const { token } = useAuthContext();
  const { showToast } = useToast();
  const [sites, setSites] = useState<SupervisedSite[]>([]);
  const [siteId, setSiteId] = useState<string | null>(initialSiteId ?? null);
  const [template, setTemplate] = useState<SiteTemplate | null>(null);
  const [prestations, setPrestations] = useState<SitePrestation[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [stops, setStops] = useState<TemplateStop[]>([]);
  const [initial, setInitial] = useState('[]');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Envoi en deux temps : d'abord l'effet sur les 2 prochaines semaines, puis l'envoi.
  const [impact, setImpact] = useState<TemplateImpact | null>(null);

  useEffect(() => setImpact(null), [stops, siteId, visible]);

  // À l'ouverture : sites et agents du superviseur.
  useEffect(() => {
    if (!visible || !token) return;
    setError(null);
    setSiteId(initialSiteId ?? null);
    listSupervisedSites(token)
      .then((list) => setSites([...list].sort((a, b) => a.name.localeCompare(b.name, 'fr'))))
      .catch(() => setSites([]));
    listActiveAgents(token)
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [visible, token, initialSiteId]);

  // Pour le site choisi : son gabarit et ses prestations.
  useEffect(() => {
    if (!visible || !token || !siteId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listSiteTemplates(token), listSitePrestations(token, siteId)])
      .then(([templates, nextPrestations]) => {
        if (cancelled) return;
        const current = templates.find((t) => t.siteId === siteId) ?? null;
        // Une modification déjà envoyée : on repart d'elle.
        const source = current?.pendingVersion?.stops ?? current?.stops ?? [];
        const nextStops = source.map((s) => ({ ...s, intervalWeeks: s.intervalWeeks ?? 1 }));
        setTemplate(current);
        setPrestations(nextPrestations.filter((p) => p.active));
        setStops(nextStops);
        setInitial(comparable(nextStops));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Impossible de charger le gabarit.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [visible, token, siteId]);

  const site = sites.find((s) => s.id === siteId);
  const changed = comparable(stops) !== initial;

  const validation = useMemo(() => {
    if (!siteId) return 'Choisissez un site.';
    if (!stops.length) return 'Ajoutez au moins un créneau.';
    for (const [index, stop] of stops.entries()) {
      const name = `Créneau ${index + 1}`;
      if (!stop.specificDate && !stop.daysOfWeek.length) return `${name} : choisissez au moins un jour.`;
      if (!TIME_RE.test(stop.startTime) || !TIME_RE.test(stop.endTime)) return `${name} : heures au format HH:MM.`;
      if (stop.startTime === stop.endTime) return `${name} : l'heure de fin doit différer de l'heure de début.`;
    }
    if (!changed) return 'Aucune modification.';
    return null;
  }, [siteId, stops, changed]);

  const update = (index: number, patch: Partial<TemplateStop>) =>
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const choosePrestation = (index: number, prestation: SitePrestation | null) =>
    update(
      index,
      prestation
        ? { categoryId: prestation.categoryId, startTime: prestation.startTime, endTime: prestation.endTime }
        : { categoryId: null },
    );

  const addStop = () =>
    setStops((prev) => [
      ...prev,
      {
        daysOfWeek: [1, 2, 3, 4, 5],
        intervalWeeks: 1,
        categoryId: prestations[0]?.categoryId ?? null,
        startTime: prestations[0]?.startTime ?? '08:00',
        endTime: prestations[0]?.endTime ?? '10:00',
        agentIds: [],
      },
    ]);

  const submit = async () => {
    if (!token || !siteId || validation) return;
    setSubmitting(true);
    setError(null);
    const input = { label: template?.label ?? `Gabarit ${site?.name ?? ''}`.trim(), siteId, stops };
    try {
      if (!impact) {
        setImpact(await previewSiteTemplateImpact(token, template?.id ?? null, input));
        return;
      }
      await saveSiteTemplate(token, template?.id ?? null, input);
      showToast(
        'Gabarit envoyé',
        template?.validatedAt
          ? "L'administrateur doit valider le changement ; d'ici là, le gabarit actuel continue de s'appliquer."
          : "L'administrateur doit le valider pour que les missions soient créées.",
        'success',
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le gabarit n'a pas pu être enregistré.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      title={site ? `Gabarit · ${site.name}` : 'Gabarit d’un site'}
      hint="Toutes les missions du site sont créées à partir de ce gabarit. Votre modification sera soumise à l'administrateur ; en attendant sa validation, la version actuelle continue de s'appliquer. Pour un seul jour (absence, fermeture), utilisez plutôt « Remplacer ce jour-là » depuis la mission."
      onClose={onClose}
      onSubmit={submit}
      submitLabel={impact ? 'Envoyer pour validation' : 'Voir l’effet sur le planning'}
      submitting={submitting}
      canSubmit={!validation}
      error={error ?? (changed && validation !== 'Aucune modification.' ? validation : null)}
    >
      {!initialSiteId ? (
        <View style={styles.group}>
          <Text style={styles.label}>Site</Text>
          <View style={styles.chips}>
            {sites.map((s) => (
              <Chip key={s.id} label={s.name} selected={s.id === siteId} onPress={() => setSiteId(s.id)} />
            ))}
          </View>
        </View>
      ) : null}

      {siteId && loading ? <ActivityIndicator color={theme.colors.primary} /> : null}

      {siteId && !loading ? (
        <>
          <View style={[styles.status, template?.validatedAt ? styles.statusOk : styles.statusPending]}>
            <Ionicons
              name={template?.validatedAt ? 'checkmark-circle-outline' : 'hourglass-outline'}
              size={20}
              color={theme.colors.ink}
            />
            <Text style={styles.statusText}>
              {!template
                ? "Ce site n'a pas encore de gabarit : aucune mission n'y est prévue."
                : template.pendingVersion
                  ? "Une modification attend l'administrateur (affichée ci-dessous) : en attendant, la version validée continue de s'appliquer."
                  : template.validatedAt
                    ? 'Gabarit validé : les missions du site en découlent.'
                    : "Gabarit en attente de validation par l'administrateur : aucune mission n'est créée d'ici là."}
            </Text>
          </View>

          {stops.map((stop, index) => (
            <View key={stop.id ?? `new-${index}`} style={[styles.stop, stop.id && stop.id === focusStopId && styles.stopFocus]}>
              <View style={styles.stopHead}>
                <Text style={styles.stopTitle}>Créneau {index + 1}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer le créneau ${index + 1}`}
                  onPress={() => setStops((prev) => prev.filter((_, i) => i !== index))}
                  style={({ pressed }) => [styles.remove, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.colors.status.absent} />
                  <Text style={styles.removeText}>Retirer</Text>
                </Pressable>
              </View>

              {stop.specificDate ? (
                <Text style={styles.muted}>
                  Créneau ponctuel {describeStop(stop)} : modifiable depuis l'espace web.
                </Text>
              ) : (
                <>
                  <View style={styles.group}>
                    <Text style={styles.label}>Prestation</Text>
                    <View style={styles.chips}>
                      {prestations.map((p) => (
                        <Chip
                          key={p.id}
                          label={`${p.category.label} (${p.startTime}–${p.endTime})`}
                          selected={stop.categoryId === p.categoryId}
                          onPress={() => choosePrestation(index, p)}
                        />
                      ))}
                      <Chip label="Autre" selected={!stop.categoryId} onPress={() => choosePrestation(index, null)} />
                    </View>
                  </View>

                  <View style={styles.group}>
                    <Text style={styles.label}>Jours</Text>
                    <View style={styles.chips}>
                      {WEEK_DAYS.map((d) => {
                        const on = stop.daysOfWeek.includes(d.value);
                        return (
                          <Chip
                            key={d.value}
                            label={d.short}
                            accessibilityLabel={d.label}
                            selected={on}
                            onPress={() =>
                              update(index, {
                                daysOfWeek: on ? stop.daysOfWeek.filter((v) => v !== d.value) : [...stop.daysOfWeek, d.value],
                              })
                            }
                          />
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.row}>
                    <DateTimeField label="Début" mode="time" value={stop.startTime} onChange={(v) => update(index, { startTime: v })} />
                    <DateTimeField label="Fin" mode="time" value={stop.endTime} onChange={(v) => update(index, { endTime: v })} />
                  </View>

                  <View style={styles.group}>
                    <Text style={styles.label}>Fréquence</Text>
                    <View style={styles.chips}>
                      <Chip label="Chaque semaine" selected={stop.intervalWeeks === 1} onPress={() => update(index, { intervalWeeks: 1 })} />
                      <Chip
                        label="Une semaine sur deux"
                        selected={stop.intervalWeeks === 2}
                        onPress={() => update(index, { intervalWeeks: 2 })}
                      />
                      {stop.intervalWeeks > 2 ? <Chip label={`Toutes les ${stop.intervalWeeks} semaines`} selected onPress={() => {}} /> : null}
                    </View>
                  </View>

                  <AgentPicker agents={agents} selected={stop.agentIds} onChange={(ids) => update(index, { agentIds: ids })} />
                </>
              )}
            </View>
          ))}

          {impact ? <ImpactBlock impact={impact} /> : null}

          <Pressable
            accessibilityRole="button"
            onPress={addStop}
            style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add" size={20} color={theme.colors.primaryDark} />
            <Text style={styles.addText}>Ajouter un créneau</Text>
          </Pressable>
        </>
      ) : null}
    </FormSheet>
  );
};

const ImpactBlock: React.FC<{ impact: TemplateImpact }> = ({ impact }) => {
  const line = (i: TemplateImpact['added'][number]) =>
    `${formatDayShort(i.date)} · ${i.startTime}–${i.endTime} · ${i.agents.join(', ') || 'aucun agent'}`;
  const groups: Array<[string, string, string[]]> = [
    ['Missions ajoutées', theme.colors.status.onTime, impact.added.map(line)],
    ['Missions retirées', theme.colors.status.absent, impact.removed.map(line)],
    ['Missions modifiées', theme.colors.status.late, impact.changed.map((c) => `${line(c.before)} → ${c.after.startTime}–${c.after.endTime} · ${c.after.agents.join(', ') || 'aucun agent'}`)],
  ];
  const nothing = groups.every(([, , items]) => !items.length);
  return (
    <View style={styles.impact} accessibilityLabel="Effet sur le planning">
      <Text style={styles.stopTitle}>Effet sur les 2 prochaines semaines</Text>
      {impact.warnings.map((w) => (
        <View key={w} style={{ flexDirection: 'row', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color={theme.colors.status.absent} />
          <Text style={[styles.muted, { flex: 1, color: theme.colors.ink }]}>{w}</Text>
        </View>
      ))}
      {nothing ? <Text style={styles.muted}>Aucune mission ne change sur cette période.</Text> : null}
      {groups.map(([title, color, items]) =>
        items.length ? (
          <View key={title} style={{ gap: 4 }}>
            <Text style={[styles.label, { color, fontFamily: theme.fonts.bodySemiBold }]}>
              {title} ({items.length})
            </Text>
            {items.slice(0, 8).map((text) => (
              <Text key={text} style={styles.muted}>
                • {text}
              </Text>
            ))}
            {items.length > 8 ? <Text style={styles.muted}>… et {items.length - 8} autre(s)</Text> : null}
          </View>
        ) : null,
      )}
    </View>
  );
};

const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string }> = ({
  label,
  selected,
  onPress,
  accessibilityLabel,
}) => (
  <Pressable
    accessibilityRole="checkbox"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ checked: selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.75 }]}
  >
    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  muted: { fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  chipText: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.ink },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  statusOk: { backgroundColor: theme.colors.status.onTimeSoft },
  statusPending: { backgroundColor: theme.colors.status.lateSoft },
  statusText: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.ink },
  stop: {
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.shell,
  },
  stopFocus: { borderColor: theme.colors.primary, borderWidth: 2 },
  stopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stopTitle: { fontFamily: theme.fonts.bodyBold, fontSize: 17, color: theme.colors.ink },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 8 },
  removeText: { fontFamily: theme.fonts.bodySemiBold, fontSize: 15, color: theme.colors.status.absent },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.primaryDark,
  },
  addText: { fontFamily: theme.fonts.bodySemiBold, fontSize: 16, color: theme.colors.primaryDark },
  impact: { gap: 10, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.shell },
});
