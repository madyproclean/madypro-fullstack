import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Filter, Download, Eye, Pencil, Copy, X } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { AssignmentSuggestion, DurationEstimate, Intervention, InterventionStatus, InterventionType } from '../../types/intervention';
import { isApprovalRequest } from '../../types/approval';
import {
  listInterventions,
  updateIntervention,
  duplicateIntervention,
  cancelIntervention,
  getAssignmentSuggestions,
  estimateDuration,
  InterventionFilters,
  CreateInterventionPayload,
} from '../../services/api/interventions.api';
import { listSites, listSiteCategories } from '../../services/api/sites.api';
import { listUsers } from '../../services/api/users.api';
import { SiteCategory } from '../../types/category';
import { Site } from '../../types/site';
import { User } from '../../types/user';
import { Button } from '../../components/ui/Button';
import { FilterBar, FilterField } from '../../components/ui/FilterBar';
import { PromptModal } from '../../components/ui/PromptModal';
import { StatusChip } from '../../components/ui/StatusChip';
import { InterventionFormModal } from '../../components/interventions/InterventionFormModal';
import { InterventionViewModal } from '../../components/interventions/InterventionViewModal';
import { GabaritsPage } from './GabaritsPage';
import { SupervisorPlanningPage } from '../supervision/SupervisorPlanningPage';

const STATUS_OPTIONS: { value: InterventionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous statuts' },
  { value: 'PLANNED', label: 'Planifiée' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'COMPLETED', label: 'Terminée' },
  { value: 'NEEDS_REVIEW', label: 'À valider' },
  { value: 'CANCELLED', label: 'Annulée' },
  { value: 'NO_SHOW', label: 'Non effectuée' },
];

const TYPE_OPTIONS: { value: InterventionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous types' },
  { value: 'REGULAR', label: 'Régulier' },
  { value: 'PONCTUAL', label: 'Ponctuel' },
];

const today = new Date();
const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const defaultFilters = () => ({
  startDate: formatDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)),
  endDate: formatDate(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)),
  type: 'all' as InterventionType | 'all',
  subType: '',
  siteId: 'all',
  agentId: 'all',
  status: 'all' as InterventionStatus | 'all',
});

const createFormDefaults: CreateInterventionPayload = {
  type: 'REGULAR',
  siteId: '',
  date: formatDate(today),
  startTime: '08:00',
  endTime: '10:00',
  agentIds: [],
  truckLabels: [],
  label: '',
  subType: undefined,
  observation: '',
};

export const InterventionsPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [tab, setTab] = useState<'planning' | 'weekly' | 'templates'>('planning');
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateInterventionPayload>(createFormDefaults);
  const [siteCategoriesBySite, setSiteCategoriesBySite] = useState<Record<string, SiteCategory[]>>({});
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [observationOnly, setObservationOnly] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [viewing, setViewing] = useState<Intervention | null>(null);
  const [suggestions, setSuggestions] = useState<AssignmentSuggestion | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [durationEstimate, setDurationEstimate] = useState<DurationEstimate | null>(null);
  const [duplicatePromptFor, setDuplicatePromptFor] = useState<Intervention | null>(null);
  const [cancelPromptFor, setCancelPromptFor] = useState<Intervention | null>(null);
  const needsReviewCount = useMemo(
    () => interventions.filter((i) => i.status === 'NEEDS_REVIEW').length,
    [interventions],
  );
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [gabaritCreateSignal, setGabaritCreateSignal] = useState(0);
  const openTemplateCreateForm = () => {
    setTab('templates');
    setGabaritCreateSignal((n) => n + 1);
  };

  const ensureSiteCategoriesLoaded = (siteId: string) => {
    if (!token || !siteId || siteCategoriesBySite[siteId]) return;
    listSiteCategories(token, siteId)
      .then((cats) => setSiteCategoriesBySite((prev) => ({ ...prev, [siteId]: cats })))
      .catch(() => setSiteCategoriesBySite((prev) => ({ ...prev, [siteId]: [] })));
  };

  useEffect(() => {
    if (!token) return;
    Promise.all([listSites(token), listUsers(token, { role: 'AGENT', status: 'active' })])
      .then(([sitePage, userData]) => {
        const siteItems = Array.isArray((sitePage as any)?.items)
          ? (sitePage as any).items
          : Array.isArray(sitePage as any)
          ? (sitePage as any)
          : [];
        const agentItems = Array.isArray((userData as any)?.items)
          ? (userData as any).items
          : Array.isArray(userData as any)
          ? (userData as any)
          : [];
        setSites(siteItems);
        setUsers(agentItems);
        setForm((prev) => ({
          ...prev,
          siteId: prev.siteId || siteItems[0]?.id || '',
          agentIds: prev.agentIds.length ? prev.agentIds : agentItems[0] ? [agentItems[0].id] : [],
        }));
      })
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les référentiels', 'error'));
  }, [token, notify]);

  const fetchInterventions = (options?: { silent?: boolean }) => {
    if (!token) return;
    if (!options?.silent) setLoading(true);
    const query: InterventionFilters = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      siteId: filters.siteId !== 'all' ? filters.siteId : undefined,
      type: filters.type,
      subType: filters.subType || undefined,
      agentId: filters.agentId !== 'all' ? filters.agentId : undefined,
      status: filters.status,
      page,
      pageSize,
    };
    listInterventions(token, query)
      .then((data) => {
        const items = Array.isArray((data as any)?.items)
          ? (data as any).items
          : Array.isArray(data)
          ? (data as any)
          : [];
        setInterventions(items);
        setTotal((data as any)?.total ?? items.length);
      })
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les interventions', 'error'))
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  };

  const exportCsv = () => {
    const rows = [
      ['Date', 'Site', 'Début', 'Fin', 'Type', 'Statut', 'Agents', 'Camions'],
      ...interventions.map((i) => [
        i.date,
        i.siteName,
        i.startTime,
        i.endTime,
        i.type,
        i.status,
        i.agents.map((a) => a.name).join(' / '),
        i.truckLabels.join(' / '),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `interventions-${filters.startDate || 'all'}-${filters.endDate || 'all'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchInterventions();
  }, [token, filters.startDate, filters.endDate, filters.siteId, filters.type, filters.subType, filters.agentId, filters.status, page]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      fetchInterventions({ silent: true });
    }, 20000);
    return () => clearInterval(id);
  }, [token, filters.startDate, filters.endDate, filters.siteId, filters.type, filters.subType, filters.agentId, filters.status, page]);

  useEffect(() => {
    if (!token || !formVisible || !form.siteId) {
      setDurationEstimate(null);
      return;
    }
    const apiType = form.type === 'PONCTUAL' ? 'PUNCTUAL' : form.type;
    estimateDuration(token, form.siteId, apiType)
      .then(setDurationEstimate)
      .catch(() => setDurationEstimate(null));
  }, [token, formVisible, form.siteId, form.type]);

  const fetchSuggestions = async () => {
    if (!token || !editingId) return;
    setSuggestionsLoading(true);
    try {
      const result = await getAssignmentSuggestions(token, editingId);
      setSuggestions(result);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de charger les suggestions', 'error');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const addSuggestedAgent = (agentId: string) => {
    setForm((prev) => (prev.agentIds.includes(agentId) ? prev : { ...prev, agentIds: [...prev.agentIds, agentId] }));
  };

  const siteOptions = useMemo(() => [{ value: 'all', label: 'Tous les sites' }].concat(sites.map((site) => ({ value: site.id, label: site.name }))), [sites]);
  const agentOptions = useMemo(() => [{ value: 'all', label: 'Tous les agents' }].concat(users.map((user) => ({ value: user.id, label: user.name }))), [users]);
  const hasStarted = (intervention: Intervention) => {
    const planned = new Date(`${intervention.date}T${intervention.startTime}:00`);
    return Date.now() >= planned.getTime();
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !editingId) return;
    if (!form.siteId || !form.date) {
      notify('Site et date requis', 'error');
      return;
    }
    if (!form.agentIds.length && form.type === 'REGULAR') {
      notify('Sélectionnez au moins un agent', 'error');
      return;
    }
    setCreating(true);
    try {
      const payload = observationOnly ? { observation: form.observation } : form;
      const result = await updateIntervention(token, editingId, payload);
      notify(isApprovalRequest(result) ? 'Demande envoyée pour validation admin' : 'Intervention mise à jour');
      setForm((prev) => ({ ...prev, label: '', truckLabels: [], agentIds: form.agentIds, observation: '' }));
      setEditingId(null);
      setObservationOnly(false);
      fetchInterventions();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Enregistrement impossible', 'error');
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (intervention: Intervention) => {
    if (intervention.status === 'CANCELLED') {
      notify("Impossible de modifier une intervention annulée", 'error');
      return;
    }
    const obsOnly = intervention.status === 'COMPLETED' || intervention.status === 'NO_SHOW';
    if (obsOnly) {
      notify('Seule l’observation peut être modifiée sur une intervention terminée ou non effectuée.');
    }
    setObservationOnly(obsOnly);
    setEditingId(intervention.id);
    setSuggestions(null);
    setForm({
      type: intervention.type,
      siteId: intervention.siteId,
      date: intervention.date,
      startTime: intervention.startTime,
      endTime: intervention.endTime,
      label: intervention.label,
      subType: intervention.subType,
      agentIds: intervention.agentIds,
      truckLabels: intervention.truckLabels,
      observation: intervention.observation,
    });
    setFormVisible(true);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setObservationOnly(false);
    setForm((prev) => ({ ...createFormDefaults, siteId: prev.siteId, agentIds: prev.agentIds }));
  };

  const duplicate = (intervention: Intervention) => setDuplicatePromptFor(intervention);

  const confirmDuplicate = async (date: string) => {
    if (!token || !duplicatePromptFor) return;
    const intervention = duplicatePromptFor;
    setDuplicatePromptFor(null);
    try {
      await duplicateIntervention(token, intervention.id, date);
      notify('Intervention dupliquée');
      fetchInterventions();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Duplication impossible', 'error');
    }
  };

  const cancel = (intervention: Intervention) => setCancelPromptFor(intervention);

  const confirmCancel = async (observation: string) => {
    if (!token || !cancelPromptFor) return;
    const intervention = cancelPromptFor;
    setCancelPromptFor(null);
    try {
      const result = await cancelIntervention(token, intervention.id, observation);
      notify(isApprovalRequest(result) ? 'Demande d’annulation envoyée pour validation admin' : 'Intervention annulée');
      fetchInterventions();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Annulation impossible', 'error');
    }
  };

  return (
    <div className="interventions-page">
      <div className="page-header">
        <span className="pill">Interventions</span>
        <h2>Vue terrain concrète</h2>
        <p>Planifiez les missions régulières ou ponctuelles, les règles récurrentes et les tournées multi-sites.</p>
        {tab === 'planning' && (
          <>
            <Button type="button" icon={Plus} onClick={openTemplateCreateForm}>
              Nouvelle intervention
            </Button>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
              <span className="pill" style={{ background: '#fff5e0', color: '#b15b00' }}>
                À valider : {needsReviewCount}
              </span>
              <Button
                type="button"
                variant="ghost"
                icon={Filter}
                onClick={() => setFilters((prev) => ({ ...prev, status: 'NEEDS_REVIEW' }))}
              >
                Filtrer "À valider"
              </Button>
              <Button type="button" variant="ghost" icon={Download} onClick={exportCsv}>
                Export CSV
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="chips" style={{ margin: '1rem 0' }}>
        <button type="button" className={`chip ${tab === 'planning' ? 'chip--selected' : ''}`} onClick={() => setTab('planning')}>
          Planning
        </button>
        <button type="button" className={`chip ${tab === 'weekly' ? 'chip--selected' : ''}`} onClick={() => setTab('weekly')}>
          Vue hebdomadaire
        </button>
        <button type="button" className={`chip ${tab === 'templates' ? 'chip--selected' : ''}`} onClick={() => setTab('templates')}>
          Gabarits
        </button>
      </div>

      {tab === 'weekly' && <SupervisorPlanningPage embedded />}
      {tab === 'templates' && <GabaritsPage embedded openCreateSignal={gabaritCreateSignal} />}

      {tab === 'planning' && (
      <>
      <FilterBar>
        <FilterField label="Du">
          <input type="date" value={filters.startDate} onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))} />
        </FilterField>
        <FilterField label="Au">
          <input type="date" value={filters.endDate} onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))} />
        </FilterField>
        <FilterField label="Site">
          <select value={filters.siteId} onChange={(event) => setFilters((prev) => ({ ...prev, siteId: event.target.value }))}>
            {siteOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Type">
          <select value={filters.type} onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value as InterventionType | 'all' }))}>
            {TYPE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Sous-type">
          <input
            type="text"
            value={filters.subType}
            onChange={(event) => setFilters((prev) => ({ ...prev, subType: event.target.value }))}
            placeholder="Ponctuel"
          />
        </FilterField>
        <FilterField label="Agent">
          <select value={filters.agentId} onChange={(event) => setFilters((prev) => ({ ...prev, agentId: event.target.value }))}>
            {agentOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Statut">
          <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as InterventionStatus | 'all' }))}>
            {STATUS_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
        <div className="pagination">
          <Button type="button" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Précédent
          </Button>
          <span className="card__meta">Page {page}</span>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const maxPage = Math.ceil(total / pageSize) || 1;
              setPage((p) => (p < maxPage ? p + 1 : p));
            }}
            disabled={page * pageSize >= total}
          >
            Suivant
          </Button>
          <span className="card__meta">{total} résultats</span>
        </div>
      </FilterBar>

      <InterventionFormModal
        open={formVisible}
        onClose={() => { cancelEditing(); setFormVisible(false); }}
        editingId={editingId}
        observationOnly={observationOnly}
        submitting={creating}
        sites={sites}
        agentOptions={users.map((user) => ({ id: user.id, name: user.name }))}
        siteCategoriesBySite={siteCategoriesBySite}
        form={form}
        setForm={setForm}
        onSiteChange={ensureSiteCategoriesLoaded}
        onSubmit={submitForm}
        onReset={cancelEditing}
        durationEstimate={durationEstimate}
        suggestions={suggestions}
        suggestionsLoading={suggestionsLoading}
        onFetchSuggestions={fetchSuggestions}
        onAddSuggestedAgent={addSuggestedAgent}
      />

      <section className="panel">
        <h3>Interventions planifiées</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="liste interventions">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Heures</th>
                  <th>Site</th>
                  <th>Type</th>
                  <th>Agents</th>
                  <th>Camions</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {interventions.map((intervention) => (
                  <tr
                    key={intervention.id}
                    className={intervention.status === 'IN_PROGRESS' ? 'row-pulse' : undefined}
                  >
                    <td>{intervention.date}</td>
                    <td>
                      {intervention.startTime} – {intervention.endTime}
                    </td>
                  <td>
                    <strong>{intervention.siteName}</strong>
                  </td>
                    <td>
                      {intervention.type === 'REGULAR'
                        ? 'Régulier'
                        : `Ponctuel - ${intervention.subType ?? 'Sans sous-type'}`}
                    </td>
                    <td>{intervention.agents.map((agent) => agent.name).join(', ') || '—'}</td>
                    <td>{intervention.truckLabels.join(', ') || '—'}</td>
                    <td>
                      <StatusChip status={intervention.status} pulse />
                    </td>
                    <td>
                      <div className="table-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={Eye}
                          onClick={() => setViewing(intervention)}
                        >
                          Visualiser
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={Pencil}
                          onClick={() => startEditing(intervention)}
                          disabled={
                            intervention.status === 'COMPLETED' ||
                            intervention.status === 'CANCELLED' ||
                            intervention.status === 'NO_SHOW'
                          }
                        >
                          Éditer
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={Copy}
                          onClick={() => duplicate(intervention)}
                          disabled={
                            intervention.status === 'COMPLETED' ||
                            intervention.status === 'CANCELLED' ||
                            intervention.status === 'NO_SHOW'
                          }
                        >
                          Dupliquer
                        </Button>
                        <Button type="button" variant="ghost" className="btn--compact" icon={X} onClick={() => cancel(intervention)}>
                          Annuler
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="pagination" style={{ marginTop: '1rem' }}>
        <Button type="button" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Précédent
        </Button>
        <span className="card__meta">Page {page}</span>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            const maxPage = Math.ceil(total / pageSize) || 1;
            setPage((p) => (p < maxPage ? p + 1 : p));
          }}
          disabled={page * pageSize >= total}
        >
          Suivant
        </Button>
        <span className="card__meta">{total} résultats</span>
      </div>

      <InterventionViewModal
        viewing={viewing}
        onClose={() => setViewing(null)}
        agentOptions={users.map((user) => ({ id: user.id, name: user.name }))}
        onUpdated={(updated) => {
          setViewing(updated);
          setInterventions((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        }}
      />
      </>
      )}
      <PromptModal
        open={duplicatePromptFor !== null}
        title="Dupliquer l'intervention"
        label="Nouvelle date"
        type="date"
        required
        defaultValue={duplicatePromptFor?.date}
        confirmLabel="Dupliquer"
        onConfirm={confirmDuplicate}
        onCancel={() => setDuplicatePromptFor(null)}
      />
      <PromptModal
        open={cancelPromptFor !== null}
        title="Motif d'annulation"
        label="Motif"
        required
        confirmLabel="Annuler l'intervention"
        onConfirm={confirmCancel}
        onCancel={() => setCancelPromptFor(null)}
      />
    </div>
  );
};
