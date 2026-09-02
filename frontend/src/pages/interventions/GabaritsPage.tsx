import React, { useEffect, useState } from 'react';
import { Plus, Play, Pencil, Power, Check, X, Eye } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  toggleTemplate,
  previewTemplate,
  generateTemplate,
  getTemplateAgentSuggestions,
  CreateTemplatePayload,
  TemplateStopPayload,
} from '../../services/api/interventions.api';
import { listSites, listSiteCategories } from '../../services/api/sites.api';
import { listUsers } from '../../services/api/users.api';
import { InterventionTemplate, TemplatePreview, TemplateAgentSuggestion } from '../../types/intervention';
import { SiteCategory } from '../../types/category';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ChipGroup } from '../../components/ui/ChipGroup';
import { Modal, ModalHeader, ModalBody } from '../../components/ui/Modal';
import { RepeatableFieldArray } from '../../components/ui/RepeatableFieldArray';
import { RouteOptimizationPanel } from '../../components/interventions/RouteOptimizationPanel';

const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
];
type StopRow = {
  id?: string;
  /** false = arrêt sans fréquence (une seule occurrence à specificDate). */
  recurring: boolean;
  daysOfWeek: number[];
  intervalWeeks: string;
  specificDate: string;
  categoryId: string;
  startTime: string;
  endTime: string;
  agentIds: string[];
};

const EMPTY_STOP: StopRow = {
  recurring: true,
  daysOfWeek: [1],
  intervalWeeks: '1',
  specificDate: '',
  categoryId: '',
  startTime: '08:00',
  endTime: '10:00',
  agentIds: [],
};

type FormState = {
  label: string;
  siteId: string;
  startDate: string;
  endDate: string;
  stops: StopRow[];
};

const INITIAL_FORM: FormState = {
  label: '',
  siteId: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  stops: [{ ...EMPTY_STOP }],
};

const toIso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (dateStr: string, days: number) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
};

/** Grille calendrier (semaines complètes Lun→Dim) couvrant [start, end]. */
const buildCalendarDays = (start: string, end: string): string[] => {
  const startD = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  const gridStart = new Date(startD);
  gridStart.setUTCDate(gridStart.getUTCDate() - ((startD.getUTCDay() + 6) % 7));
  const gridEnd = new Date(endD);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - ((endD.getUTCDay() + 6) % 7)));
  const days: string[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push(toIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

type GabaritsPageProps = {
  embedded?: boolean;
  /** Sites visibles/sélectionnables — non fourni ou `null` = aucune restriction (admin). */
  restrictToSiteIds?: Set<string> | null;
  /** Incrémenté par un parent pour ouvrir automatiquement le formulaire de création (ex : bouton "Nouvelle intervention"). */
  openCreateSignal?: number;
};

export const GabaritsPage: React.FC<GabaritsPageProps> = ({ embedded, restrictToSiteIds, openCreateSignal }) => {
  const { token, notify } = useAuthContext();
  const [templates, setTemplates] = useState<InterventionTemplate[]>([]);
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  const [siteOptions, setSiteOptions] = useState<{ value: string; label: string }[]>([]);
  const [agentOptions, setAgentOptions] = useState<{ id: string; name: string }[]>([]);
  const [siteCategoriesBySite, setSiteCategoriesBySite] = useState<Record<string, SiteCategory[]>>({});
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [suggestionsByStop, setSuggestionsByStop] = useState<Record<number, TemplateAgentSuggestion>>({});
  const [suggestionsLoadingStop, setSuggestionsLoadingStop] = useState<number | null>(null);

  const [generateTemplateId, setGenerateTemplateId] = useState<string | null>(null);
  const [generatePeriod, setGeneratePeriod] = useState<'day' | 'week' | 'custom'>('week');
  const [genStartDate, setGenStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [genEndDate, setGenEndDate] = useState(addDays(new Date().toISOString().slice(0, 10), 6));
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    if (!token) return;
    setLoading(true);
    listTemplates(token)
      .then(setTemplates)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les gabarits', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  useEffect(() => {
    if (!token) return;
    listSites(token, { pageSize: 500 })
      .then((res) => {
        const map: Record<string, string> = {};
        res.items.forEach((s) => {
          map[s.id] = s.name;
        });
        setSiteNames(map);
        setSiteOptions(res.items.map((s) => ({ value: s.id, label: s.name })));
      })
      .catch(() => {
        setSiteNames({});
        setSiteOptions([]);
      });
    listUsers(token, { role: 'AGENT', pageSize: 500 })
      .then((res) => setAgentOptions(res.items.map((u: any) => ({ id: u.id, name: u.name }))))
      .catch(() => setAgentOptions([]));
  }, [token]);

  const ensureSiteCategoriesLoaded = (siteId: string) => {
    if (!token || !siteId || siteCategoriesBySite[siteId]) return;
    listSiteCategories(token, siteId)
      .then((cats) => setSiteCategoriesBySite((prev) => ({ ...prev, [siteId]: cats })))
      .catch(() => setSiteCategoriesBySite((prev) => ({ ...prev, [siteId]: [] })));
  };

  const openCreateForm = (defaultRecurring = true) => {
    setEditingId(null);
    setForm({
      ...INITIAL_FORM,
      stops: [{ ...EMPTY_STOP, recurring: defaultRecurring }],
    });
    setFormOpen(true);
  };

  useEffect(() => {
    if (openCreateSignal) openCreateForm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateSignal]);

  const openEditForm = (template: InterventionTemplate) => {
    setEditingId(template.id);
    setForm({
      label: template.label,
      siteId: template.siteId,
      startDate: template.startDate.slice(0, 10),
      endDate: template.endDate ? template.endDate.slice(0, 10) : '',
      stops: template.stops.length
        ? template.stops.map((s) => ({
            id: s.id,
            recurring: !s.specificDate,
            daysOfWeek: s.daysOfWeek,
            intervalWeeks: String(s.intervalWeeks ?? 1),
            specificDate: s.specificDate ? s.specificDate.slice(0, 10) : '',
            categoryId: s.categoryId ?? '',
            startTime: s.startTime,
            endTime: s.endTime,
            agentIds: s.agentIds,
          }))
        : [{ ...EMPTY_STOP }],
    });
    ensureSiteCategoriesLoaded(template.siteId);
    setFormOpen(true);
  };

  const updateStop = (index: number, patch: Partial<StopRow>) => {
    setForm((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)),
    }));
  };

  const fetchStopSuggestions = async (index: number) => {
    if (!token || !form.siteId) return;
    setSuggestionsLoadingStop(index);
    try {
      const result = await getTemplateAgentSuggestions(token, form.siteId, form.stops[index]?.agentIds ?? []);
      setSuggestionsByStop((prev) => ({ ...prev, [index]: result }));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de charger les suggestions', 'error');
    } finally {
      setSuggestionsLoadingStop(null);
    }
  };

  const addSuggestedAgent = (index: number, agentId: string) => {
    updateStop(index, {
      agentIds: form.stops[index]?.agentIds.includes(agentId)
        ? form.stops[index].agentIds
        : [...(form.stops[index]?.agentIds ?? []), agentId],
    });
  };

  const handleSiteChange = (siteId: string) => {
    setForm((prev) => ({
      ...prev,
      siteId,
      stops: prev.stops.map((stop) => ({ ...stop, categoryId: '' })),
    }));
    ensureSiteCategoriesLoaded(siteId);
  };

  const addStop = () => {
    setForm((prev) => ({ ...prev, stops: [...prev.stops, { ...EMPTY_STOP }] }));
  };

  const removeStop = (index: number) => {
    setForm((prev) => {
      if (prev.stops.length <= 1) {
        notify('Un gabarit doit conserver au moins un arrêt', 'error');
        return prev;
      }
      return { ...prev, stops: prev.stops.filter((_, i) => i !== index) };
    });
  };

  /** Un gabarit existe déjà pour ce site : à la création, on y ajoutera l'arrêt plutôt que d'en créer un doublon. */
  const mergeTarget = !editingId ? templates.find((t) => t.siteId === form.siteId) ?? null : null;

  const isInvalid =
    !token ||
    (!mergeTarget && !form.label.trim()) ||
    !form.siteId ||
    !form.stops.length ||
    form.stops.some(
      (s) => !s.startTime || !s.endTime || (s.recurring ? !s.daysOfWeek.length : !s.specificDate),
    );

  const stopRowToPayload = (s: StopRow, index: number): TemplateStopPayload => ({
    id: s.id,
    daysOfWeek: s.recurring ? s.daysOfWeek : undefined,
    intervalWeeks: s.recurring ? Number(s.intervalWeeks) || 1 : undefined,
    specificDate: s.recurring ? undefined : s.specificDate,
    categoryId: s.categoryId || undefined,
    startTime: s.startTime,
    endTime: s.endTime,
    agentIds: s.agentIds,
    order: index,
  });

  const existingStopToPayload = (s: InterventionTemplate['stops'][number], index: number): TemplateStopPayload => ({
    id: s.id,
    daysOfWeek: s.daysOfWeek,
    intervalWeeks: s.intervalWeeks,
    specificDate: s.specificDate ?? undefined,
    categoryId: s.categoryId ?? undefined,
    startTime: s.startTime,
    endTime: s.endTime,
    agentIds: s.agentIds,
    order: index,
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || isInvalid) return;
    setSubmitting(true);
    try {
      const targetId = editingId ?? mergeTarget?.id ?? null;
      const baseStops = mergeTarget ? mergeTarget.stops.map(existingStopToPayload) : [];
      const payload: CreateTemplatePayload = {
        label: mergeTarget ? mergeTarget.label : form.label.trim(),
        siteId: form.siteId,
        startDate: mergeTarget
          ? mergeTarget.startDate
          : form.startDate
          ? new Date(form.startDate).toISOString()
          : undefined,
        endDate: mergeTarget ? mergeTarget.endDate ?? undefined : form.endDate ? new Date(form.endDate).toISOString() : undefined,
        stops: [
          ...baseStops,
          ...form.stops.map((s, index) => stopRowToPayload(s, baseStops.length + index)),
        ],
      };
      const saved = targetId ? await updateTemplate(token, targetId, payload) : await createTemplate(token, payload);
      notify(
        saved.validatedAt
          ? 'Gabarit enregistré et validé'
          : 'Gabarit enregistré — en attente de validation par un admin',
      );
      setFormOpen(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Impossible d'enregistrer ce gabarit", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (template: InterventionTemplate) => {
    if (!token) return;
    try {
      await toggleTemplate(token, template.id, !template.active);
      notify(template.active ? 'Gabarit désactivé' : 'Gabarit activé');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de modifier le statut', 'error');
    }
  };

  const openGenerate = (template: InterventionTemplate) => {
    const today = new Date().toISOString().slice(0, 10);
    setGenerateTemplateId(template.id);
    setGeneratePeriod('week');
    setGenStartDate(today);
    setGenEndDate(addDays(today, 6));
    setPreview(null);
  };

  const applyPeriodPreset = (period: 'day' | 'week' | 'custom') => {
    setGeneratePeriod(period);
    setPreview(null);
    const today = new Date().toISOString().slice(0, 10);
    if (period === 'day') {
      setGenStartDate(today);
      setGenEndDate(today);
    } else if (period === 'week') {
      setGenStartDate(today);
      setGenEndDate(addDays(today, 6));
    }
  };

  const handlePreview = async () => {
    if (!token || !generateTemplateId) return;
    setPreviewLoading(true);
    try {
      const result = await previewTemplate(token, generateTemplateId, genStartDate, genEndDate);
      setPreview(result);
      if (!result.occurrences.length) {
        notify('Aucune occurrence sur cette période.', 'error');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Impossible de calculer l'aperçu", 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!token || !generateTemplateId || !preview?.occurrences.length) return;
    setGenerating(true);
    try {
      const result = await generateTemplate(token, generateTemplateId, genStartDate, genEndDate);
      if (Array.isArray(result)) {
        notify(`${result.length} intervention(s) créée(s) — notification unique envoyée à chaque agent concerné`);
      } else {
        notify('Demande envoyée pour validation par un admin');
      }
      setGenerateTemplateId(null);
      setPreview(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de générer ce gabarit', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const generatingTemplate = templates.find((t) => t.id === generateTemplateId);
  const visibleTemplates = restrictToSiteIds ? templates.filter((t) => restrictToSiteIds.has(t.siteId)) : templates;
  const filteredSiteOptions = restrictToSiteIds ? siteOptions.filter((o) => restrictToSiteIds.has(o.value)) : siteOptions;

  return (
    <div className={embedded ? undefined : 'page'}>
      {embedded ? (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ marginTop: 0 }}>
            Un gabarit d'interventions récurrentes pour un site donné — chaque arrêt peut avoir son propre
            horaire, sa catégorie et sa fréquence, ou être un jour unique sans fréquence. Une fois validé
            (immédiatement si vous êtes admin, sinon après validation d'un admin), les interventions réelles
            sont créées automatiquement peu avant leur début — inutile de les générer à l'avance sauf besoin
            ponctuel (bouton « Générer »).
          </p>
          <Button type="button" icon={Plus} onClick={() => openCreateForm(true)}>
            Nouveau gabarit
          </Button>
        </div>
      ) : (
        <div className="page-header">
          <span className="pill">Interventions</span>
          <h2>Gabarits</h2>
          <p>
            Un gabarit d'interventions récurrentes pour un site donné — chaque arrêt peut avoir son propre
            horaire, sa catégorie et sa fréquence, ou être un jour unique sans fréquence. Une fois validé, les
            interventions réelles sont créées automatiquement peu avant leur début.
          </p>
          <Button type="button" icon={Plus} onClick={() => openCreateForm(true)}>
            Nouveau gabarit
          </Button>
        </div>
      )}

      <RouteOptimizationPanel agentOptions={agentOptions} title="Optimisation de tournée du jour" />

      <div className="panel">
        <div className="table-wrapper">
          <table className="table" aria-label="gabarits">
            <thead>
              <tr>
                <th>Nom du gabarit</th>
                <th>Site</th>
                <th>Arrêts</th>
                <th>Fréquence</th>
                <th>Période</th>
                <th>Validation</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTemplates.map((template) => {
                const recurringStops = template.stops.filter((s) => !s.specificDate);
                const onceCount = template.stops.length - recurringStops.length;
                const frequencies = Array.from(new Set(recurringStops.map((s) => s.intervalWeeks)));
                const frequencyLabel =
                  frequencies.length === 0
                    ? ''
                    : frequencies.length > 1
                    ? 'Fréquences variables'
                    : frequencies[0] === 1
                    ? 'Chaque semaine'
                    : `Toutes les ${frequencies[0]} semaines`;
                const onceLabel = onceCount ? `${onceCount} jour(s) unique(s)` : '';
                const summaryLabel = [frequencyLabel, onceLabel].filter(Boolean).join(' + ') || '—';
                return (
                  <tr key={template.id}>
                    <td>{template.label}</td>
                    <td>{siteNames[template.siteId] ?? '…'}</td>
                    <td>{template.stops.length} arrêt(s)</td>
                    <td>{summaryLabel}</td>
                    <td>
                      {new Date(template.startDate).toLocaleDateString('fr-FR')}
                      {template.endDate ? ` → ${new Date(template.endDate).toLocaleDateString('fr-FR')}` : ' → indéfini'}
                    </td>
                    <td>
                      <span className={`status-chip ${template.validatedAt ? 'status-chip--success' : 'status-chip--warning'}`}>
                        {template.validatedAt ? 'Validé' : 'En attente de validation'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-chip ${template.active ? 'status-chip--success' : 'status-chip--warning'}`}>
                        {template.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <Button
                          type="button"
                          className="btn--compact"
                          icon={Play}
                          onClick={() => openGenerate(template)}
                          disabled={!template.validatedAt}
                          title={template.validatedAt ? undefined : 'Le gabarit doit être validé avant génération'}
                        >
                          Générer
                        </Button>
                        <Button type="button" variant="ghost" className="btn--compact" icon={Pencil} onClick={() => openEditForm(template)}>
                          Modifier
                        </Button>
                        <Button type="button" variant="ghost" className="btn--compact" icon={Power} onClick={() => handleToggleActive(template)}>
                          {template.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && visibleTemplates.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucun gabarit défini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} maxWidth={900} labelledBy="gabarit-form-title">
        <ModalHeader
          eyebrow="Gabarit"
          title={editingId ? 'Modifier le gabarit' : mergeTarget ? 'Ajouter un arrêt' : 'Nouveau gabarit'}
          titleId="gabarit-form-title"
          onClose={() => setFormOpen(false)}
        />
        <ModalBody>
            <form
              className="form-card"
              onSubmit={handleSubmit}
              style={{ boxShadow: 'none', padding: 0, display: 'grid', gap: '1rem' }}
            >
              {mergeTarget ? (
                <p className="form-helper" style={{ margin: 0 }}>
                  Ce site a déjà un gabarit (« {mergeTarget.label} ») — le(s) nouvel/nouveaux arrêt(s) lui seront
                  ajoutés au lieu d'en créer un doublon.
                </p>
              ) : (
                <Input
                  id="label"
                  name="label"
                  label="Nom du gabarit"
                  placeholder="Nettoyage vitres — équipe A"
                  required
                  value={form.label}
                  onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                />
              )}

              <Select
                label="Site"
                options={[{ value: '', label: 'Sélectionner un site' }, ...filteredSiteOptions]}
                value={form.siteId}
                onChange={(e) => handleSiteChange(e.target.value)}
              />

              {!mergeTarget && (
                <div className="form-row">
                  <Input
                    id="startDate"
                    name="startDate"
                    label="Date de début"
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                  <Input
                    id="endDate"
                    name="endDate"
                    label="Date de fin (facultatif)"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              )}

              <div className="form-field">
                <span>Arrêts (un agent peut avoir plusieurs arrêts le même jour)</span>
                <div style={{ marginTop: '0.5rem' }}>
                  <RepeatableFieldArray
                    items={form.stops}
                    onAdd={addStop}
                    onRemove={removeStop}
                    addLabel="+ Ajouter un site"
                    removeLabel="Retirer cet arrêt"
                    renderItem={(stop, index) => (
                      <>
                        <ChipGroup
                          label="Type"
                          options={[
                            { value: 'recurring', label: 'Récurrent' },
                            { value: 'once', label: 'Jour unique' },
                          ]}
                          value={stop.recurring ? 'recurring' : 'once'}
                          onChange={(value) => updateStop(index, { recurring: value === 'recurring' })}
                        />
                        <div className="form-row">
                          <Select
                            label="Catégorie (facultatif)"
                            options={[
                              { value: '', label: 'Aucune / personnalisé' },
                              ...(siteCategoriesBySite[form.siteId] ?? []).map((sc) => ({
                                value: sc.categoryId,
                                label: sc.category.label,
                              })),
                            ]}
                            value={stop.categoryId}
                            onChange={(e) => {
                              const categoryId = e.target.value;
                              const sc = (siteCategoriesBySite[form.siteId] ?? []).find((c) => c.categoryId === categoryId);
                              updateStop(index, {
                                categoryId,
                                ...(sc ? { startTime: sc.startTime, endTime: sc.endTime } : {}),
                              });
                            }}
                          />
                          <Input
                            label="Début"
                            type="time"
                            value={stop.startTime}
                            onChange={(e) => updateStop(index, { startTime: e.target.value })}
                          />
                          <Input
                            label="Fin"
                            type="time"
                            value={stop.endTime}
                            onChange={(e) => updateStop(index, { endTime: e.target.value })}
                          />
                          {stop.recurring ? (
                            <Input
                              label="Fréquence (toutes les N semaines)"
                              type="number"
                              min={1}
                              helperText="1 = chaque semaine, 2 = une semaine sur deux, etc."
                              value={stop.intervalWeeks}
                              onChange={(e) => updateStop(index, { intervalWeeks: e.target.value })}
                            />
                          ) : (
                            <Input
                              label="Date"
                              type="date"
                              value={stop.specificDate}
                              onChange={(e) => updateStop(index, { specificDate: e.target.value })}
                            />
                          )}
                        </div>
                        {stop.recurring && (
                          <ChipGroup
                            multiple
                            label="Jours"
                            options={DAYS.map((day) => ({ value: String(day.value), label: day.label }))}
                            value={stop.daysOfWeek.map(String)}
                            onChange={(values) => updateStop(index, { daysOfWeek: values.map(Number) })}
                          />
                        )}
                        <ChipGroup
                          multiple
                          label="Agents"
                          options={agentOptions.map((agent) => ({ value: agent.id, label: agent.name }))}
                          value={stop.agentIds}
                          onChange={(agentIds) => updateStop(index, { agentIds })}
                          helperText={agentOptions.length === 0 ? 'Aucun agent disponible' : undefined}
                        />
                        {form.siteId && (
                          <div className="form-field">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => fetchStopSuggestions(index)}
                              disabled={suggestionsLoadingStop === index}
                            >
                              {suggestionsLoadingStop === index ? 'Recherche...' : 'Suggérer des agents à proximité'}
                            </Button>
                            {suggestionsByStop[index] && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
                                {suggestionsByStop[index].candidates.length === 0 && (
                                  <small className="form-helper">Aucun candidat disponible.</small>
                                )}
                                {suggestionsByStop[index].candidates.map((candidate) => (
                                  <div
                                    key={candidate.id}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
                                  >
                                    <span>
                                      {candidate.name}
                                      {candidate.distanceMeters != null ? ` · ${(candidate.distanceMeters / 1000).toFixed(1)} km` : ''}
                                      {candidate.positionSource === 'address' ? ' (adresse)' : ''}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="btn--compact"
                                      onClick={() => addSuggestedAgent(index, candidate.id)}
                                    >
                                      Ajouter
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  />
                </div>
              </div>

              <div className="form-actions">
                <Button type="submit" icon={Check} loading={submitting} disabled={isInvalid}>
                  {editingId ? 'Mettre à jour' : mergeTarget ? "Ajouter l'arrêt au gabarit" : 'Créer le gabarit'}
                </Button>
                <Button type="button" variant="ghost" icon={X} onClick={() => setFormOpen(false)}>
                  Annuler
                </Button>
              </div>
            </form>
        </ModalBody>
      </Modal>

      <Modal open={Boolean(generateTemplateId)} onClose={() => setGenerateTemplateId(null)} maxWidth={700} labelledBy="gabarit-generate-title">
        <ModalHeader eyebrow="Génération" title={generatingTemplate?.label ?? ''} titleId="gabarit-generate-title" onClose={() => setGenerateTemplateId(null)} />
        <ModalBody>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <ChipGroup
                options={[
                  { value: 'day', label: "Aujourd'hui" },
                  { value: 'week', label: 'Cette semaine' },
                  { value: 'custom', label: "Période personnalisée (jusqu'à 1 mois)" },
                ]}
                value={generatePeriod}
                onChange={(value) => applyPeriodPreset(value as 'day' | 'week' | 'custom')}
              />

              <div className="form-row">
                <Input
                  label="Du"
                  type="date"
                  value={genStartDate}
                  onChange={(e) => {
                    setGenStartDate(e.target.value);
                    setPreview(null);
                  }}
                  disabled={generatePeriod !== 'custom'}
                />
                <Input
                  label="Au"
                  type="date"
                  value={genEndDate}
                  onChange={(e) => {
                    setGenEndDate(e.target.value);
                    setPreview(null);
                  }}
                  disabled={generatePeriod !== 'custom'}
                />
              </div>

              <Button type="button" variant="ghost" icon={Eye} onClick={handlePreview} disabled={previewLoading}>
                {previewLoading ? 'Calcul...' : 'Voir l’aperçu'}
              </Button>

              {preview && (
                <div className="panel" style={{ padding: '0.75rem' }}>
                  <p className="card__meta">{preview.occurrences.length} intervention(s) seront créées :</p>
                  {(() => {
                    const occurrencesByDate = new Map<string, typeof preview.occurrences>();
                    preview.occurrences.forEach((occ) => {
                      const list = occurrencesByDate.get(occ.date) ?? [];
                      list.push(occ);
                      occurrencesByDate.set(occ.date, list);
                    });
                    const days = buildCalendarDays(genStartDate, genEndDate);

                    return (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
                          {DAYS.map((d) => (
                            <div
                              key={d.value}
                              style={{ fontSize: '0.7rem', fontWeight: 600, textAlign: 'center', color: 'var(--color-muted)' }}
                            >
                              {d.label.slice(0, 3)}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                          {days.map((day) => {
                            const inRange = day >= genStartDate && day <= genEndDate;
                            const dayOccurrences = occurrencesByDate.get(day) ?? [];
                            return (
                              <div
                                key={day}
                                style={{
                                  minHeight: '64px',
                                  border: '1px solid #eef1f4',
                                  borderRadius: '6px',
                                  padding: '0.25rem',
                                  background: inRange ? '#fff' : '#fafafa',
                                  opacity: inRange ? 1 : 0.45,
                                }}
                              >
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{Number(day.slice(8, 10))}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                  {dayOccurrences.map((occ, index) => (
                                    <div
                                      key={index}
                                      title={`${occ.startTime}–${occ.endTime}`}
                                      style={{
                                        fontSize: '0.65rem',
                                        color: '#fff',
                                        background: '#0f98eb',
                                        borderRadius: '4px',
                                        padding: '1px 4px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {occ.startTime}–{occ.endTime}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="form-actions">
                <Button type="button" icon={Check} onClick={handleGenerate} disabled={!preview?.occurrences.length || generating}>
                  {generating ? 'Génération...' : 'Confirmer la génération'}
                </Button>
                <Button type="button" variant="ghost" icon={X} onClick={() => setGenerateTemplateId(null)}>
                  Annuler
                </Button>
              </div>
            </div>
        </ModalBody>
      </Modal>
    </div>
  );
};
