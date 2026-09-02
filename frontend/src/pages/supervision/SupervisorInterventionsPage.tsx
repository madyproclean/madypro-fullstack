import React, { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { listInterventions, updateIntervention, cancelIntervention } from '../../services/api/interventions.api';
import { listSites } from '../../services/api/sites.api';
import { listUsers } from '../../services/api/users.api';
import { Intervention } from '../../types/intervention';
import { isApprovalRequest } from '../../types/approval';
import { Site } from '../../types/site';
import { User } from '../../types/user';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Plus, Eye, Play, CheckCheck, X } from 'lucide-react';
import { PromptModal } from '../../components/ui/PromptModal';
import { StatusChip } from '../../components/ui/StatusChip';
import { InterventionViewModal } from '../../components/interventions/InterventionViewModal';
import { GabaritsPage } from '../interventions/GabaritsPage';
import { useSupervisedSiteIds } from '../../hooks/useSupervisedSiteIds';
import { formatDateTime } from '../../utils/datetime';

const todayLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const today = todayLocal();

export const SupervisorInterventionsPage: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const [tab, setTab] = useState<'list' | 'templates'>('list');
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<Intervention | null>(null);
  const [agents, setAgents] = useState<User[]>([]);
  const [gabaritCreateSignal, setGabaritCreateSignal] = useState(0);
  const [cancelPromptFor, setCancelPromptFor] = useState<Intervention | null>(null);
  const [filters, setFilters] = useState<{ siteId: string; date: string; status: string }>({
    siteId: 'all',
    date: today,
    status: 'all',
  });

  const fetchInterventions = (options?: { silent?: boolean }) => {
    if (!token) return;
    if (!options?.silent) setLoading(true);
    Promise.all([
      listInterventions(token, {
        startDate: filters.date,
        endDate: filters.date,
        status: filters.status !== 'all' ? (filters.status as any) : undefined,
        pageSize: 200,
      }).catch(() => ({
        items: [],
      })),
      listSites(token, { pageSize: 200 }).catch(() => ({ items: [] as Site[] })),
    ])
      .then(([intRes, sitesRes]) => {
        setInterventions((intRes as any).items ?? (Array.isArray(intRes) ? intRes : []));
        setSites(sitesRes.items);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les interventions';
        notify(message, 'error');
      })
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  };

  useEffect(() => {
    fetchInterventions();
  }, [token, filters.date, filters.status]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => fetchInterventions({ silent: true }), 20000);
    return () => clearInterval(id);
  }, [token, filters.date, filters.status]);

  const supervisedSiteIds = useSupervisedSiteIds(sites, user);

  const filtered = useMemo(() => {
    return interventions.filter((i) => {
      if (supervisedSiteIds && !supervisedSiteIds.has(i.siteId)) return false;
      if (filters.siteId !== 'all' && i.siteId !== filters.siteId) return false;
      if (filters.status !== 'all' && i.status !== filters.status) return false;
      return true;
    });
  }, [filters.siteId, filters.status, interventions, supervisedSiteIds]);

  useEffect(() => {
    if (!token) return;
    listUsers(token, { role: 'AGENT', status: 'active', pageSize: 500 })
      .then((res) => setAgents(res.items))
      .catch(() => setAgents([]));
  }, [token]);

  const confirmCancel = async (observation: string) => {
    if (!token || !cancelPromptFor) return;
    const intervention = cancelPromptFor;
    setCancelPromptFor(null);
    try {
      const result = await cancelIntervention(token, intervention.id, observation);
      if (isApprovalRequest(result)) {
        notify('Demande d’annulation envoyée pour validation admin');
        return;
      }
      setInterventions((prev) => prev.map((i) => (i.id === intervention.id ? result : i)));
      notify('Intervention annulée');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Annulation impossible', 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="pill">Supervision</span>
        <h2>Interventions</h2>
        <p>Gestion des interventions (planifiées, en cours, terminées) sur vos sites.</p>
        {tab === 'list' && (
          <Button
            type="button"
            icon={Plus}
            onClick={() => {
              setTab('templates');
              setGabaritCreateSignal((n) => n + 1);
            }}
          >
            Nouvelle intervention
          </Button>
        )}
      </div>

      <div className="chips" style={{ margin: '1rem 0' }}>
        <button type="button" className={`chip ${tab === 'list' ? 'chip--selected' : ''}`} onClick={() => setTab('list')}>
          Interventions
        </button>
        <button type="button" className={`chip ${tab === 'templates' ? 'chip--selected' : ''}`} onClick={() => setTab('templates')}>
          Gabarits
        </button>
      </div>

      {tab === 'templates' && <GabaritsPage embedded restrictToSiteIds={supervisedSiteIds} openCreateSignal={gabaritCreateSignal} />}

      {tab === 'list' && (
      <>
      <div className="filter-grid" style={{ marginBottom: '1rem' }}>
        <label className="filter-field filter-card">
          Site
          <select
            value={filters.siteId}
            onChange={(e) => setFilters((prev) => ({ ...prev, siteId: e.target.value }))}
          >
            <option value="all">Tous</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          type="date"
          label="Date"
          value={filters.date}
          onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value }))}
        />
        <label className="filter-field filter-card">
          Statut
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="all">Tous</option>
            <option value="PLANNED">Planifiée</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="COMPLETED">Terminée</option>
            <option value="NEEDS_REVIEW">À valider</option>
            <option value="CANCELLED">Annulée</option>
            <option value="NO_SHOW">Non effectuée</option>
          </select>
        </label>
      </div>

      <div className="panel">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="interventions supervisées">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Horaire</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Agents</th>
                  <th>Observation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((intervention) => (
                  <tr
                    key={intervention.id}
                    className={intervention.status === 'IN_PROGRESS' ? 'row-pulse' : undefined}
                  >
                    <td>
                      <strong>{intervention.siteName}</strong>
                    </td>
                    <td>
                      {formatDateTime(intervention.date)} · {intervention.startTime} – {intervention.endTime}
                    </td>
                    <td>{intervention.type === 'REGULAR' ? 'Régulière' : 'Ponctuelle'}</td>
                    <td>
                      <StatusChip status={intervention.status} pulse />
                    </td>
                    <td>{intervention.agents.map((a) => a.name).join(', ') || '—'}</td>
                    <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {intervention.observation ?? '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
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
                          icon={Play}
                          disabled={
                            intervention.status === 'COMPLETED' ||
                            intervention.status === 'CANCELLED' ||
                            intervention.status === 'IN_PROGRESS' ||
                            intervention.status === 'NO_SHOW'
                          }
                          onClick={async () => {
                            if (!token) return;
                            try {
                              const updated = await updateIntervention(token, intervention.id, { status: 'IN_PROGRESS' });
                              if (isApprovalRequest(updated)) {
                                notify('Demande envoyée pour validation admin');
                                return;
                              }
                              setInterventions((prev) => prev.map((i) => (i.id === intervention.id ? updated : i)));
                              notify('Marquée en cours');
                            } catch (err) {
                              const message = err instanceof Error ? err.message : 'Action impossible';
                              notify(message, 'error');
                            }
                          }}
                        >
                          Démarrer
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={CheckCheck}
                          disabled={
                            intervention.status === 'COMPLETED' ||
                            intervention.status === 'CANCELLED' ||
                            intervention.status === 'NO_SHOW' ||
                            intervention.status === 'PLANNED'
                          }
                          onClick={async () => {
                            if (!token) return;
                            try {
                              const updated = await updateIntervention(token, intervention.id, { status: 'COMPLETED' });
                              if (isApprovalRequest(updated)) {
                                notify('Demande envoyée pour validation admin');
                                return;
                              }
                              setInterventions((prev) => prev.map((i) => (i.id === intervention.id ? updated : i)));
                              notify('Marquée terminée');
                            } catch (err) {
                              const message = err instanceof Error ? err.message : 'Action impossible';
                              notify(message, 'error');
                            }
                          }}
                        >
                          Terminer
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={X}
                          disabled={intervention.status === 'COMPLETED' || intervention.status === 'CANCELLED'}
                          onClick={() => setCancelPromptFor(intervention)}
                        >
                          Annuler
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      Aucune intervention pour les filtres sélectionnés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      <InterventionViewModal
        viewing={viewing}
        onClose={() => setViewing(null)}
        agentOptions={agents.map((agent) => ({ id: agent.id, name: agent.name }))}
        onUpdated={(updated) => {
          setViewing(updated);
          setInterventions((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        }}
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
