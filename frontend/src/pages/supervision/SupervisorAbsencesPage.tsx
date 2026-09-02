import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { listAbsences, updateAbsenceStatus } from '../../services/api/absences.api';
import { listSites } from '../../services/api/sites.api';
import { Absence } from '../../types/absence';
import { Site } from '../../types/site';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Check, X } from 'lucide-react';
import { formatDateTime } from '../../utils/datetime';

const TYPE_LABELS: Record<Absence['type'], string> = {
  SICK: 'Arrêt maladie',
  PAID_LEAVE: 'Congés payés',
  UNPAID: 'Sans solde',
  OTHER: 'Autre',
};

export const SupervisorAbsencesPage: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ siteId: string; status: string }>({ siteId: 'all', status: 'PENDING' });

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      listAbsences(token, { status: filters.status as any, pageSize: 200 }).catch(() => ({ items: [] as Absence[] })),
      listSites(token, { pageSize: 200 }).catch(() => ({ items: [] as Site[] })),
    ])
      .then(([absRes, sitesRes]) => {
        setAbsences(absRes.items);
        setSites(sitesRes.items);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les absences';
        notify(message, 'error');
      })
      .finally(() => setLoading(false));
  }, [token, filters.status, notify]);

  const supervisedSiteIds = useMemo(() => {
    if (!user || user.role?.toUpperCase() !== 'SUPERVISOR') return null;
    return new Set(sites.filter((s) => s.supervisorIds?.includes(user.id)).map((s) => s.id));
  }, [sites, user]);

  const filtered = useMemo(() => {
    return absences.filter((abs) => {
      const siteId = abs.site?.id;
      if (supervisedSiteIds && siteId && !supervisedSiteIds.has(siteId)) return false;
      if (filters.siteId !== 'all' && siteId && siteId !== filters.siteId) return false;
      return true;
    });
  }, [absences, filters.siteId, supervisedSiteIds]);

  const handleStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    if (!token) return;
    try {
      await updateAbsenceStatus(token, id, { status, validatedBy: user?.name ?? 'SUPERVISOR' });
      setAbsences((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      notify(`Absence ${status === 'APPROVED' ? 'validée' : 'refusée'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de mettre à jour l’absence';
      notify(message, 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="pill">Supervision</span>
        <h2>Absences des agents</h2>
        <p>Validation, refus et historique des absences filtrées par site.</p>
      </div>

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
        <label className="filter-field filter-card">
          Statut
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="PENDING">En attente</option>
            <option value="APPROVED">Validées</option>
            <option value="REJECTED">Refusées</option>
            <option value="all">Toutes</option>
          </select>
        </label>
      </div>

      <div className="panel">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="absences agents">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Site</th>
                  <th>Période</th>
                  <th>Type</th>
                  <th>Motif</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((abs) => (
                  <tr key={abs.id}>
                    <td>
                      {abs.agent?.id ? (
                        <Link to={`/supervision/agents/${abs.agent.id}`}>{abs.agent.name}</Link>
                      ) : (
                        abs.agent?.name
                      )}
                    </td>
                    <td>{abs.site?.name ?? '—'}</td>
                    <td>
                      {formatDateTime(abs.from)} → {formatDateTime(abs.to)}
                    </td>
                    <td>{TYPE_LABELS[abs.type] ?? abs.type}</td>
                    <td>{abs.reason}</td>
                    <td>
                      <span
                        className={`status-chip ${
                          abs.status === 'APPROVED'
                            ? 'status-chip--success'
                            : abs.status === 'PENDING'
                            ? 'status-chip--info'
                            : 'status-chip--warning'
                        }`}
                      >
                        {abs.status === 'APPROVED'
                          ? 'Validée'
                          : abs.status === 'REJECTED'
                          ? 'Refusée'
                          : 'En attente'}
                      </span>
                    </td>
                    <td>
                      {abs.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button type="button" variant="ghost" className="btn--compact" icon={Check} onClick={() => handleStatus(abs.id, 'APPROVED')}>
                            Valider
                          </Button>
                          <Button type="button" variant="ghost" className="btn--compact" icon={X} onClick={() => handleStatus(abs.id, 'REJECTED')}>
                            Refuser
                          </Button>
                        </div>
                      ) : (
                        <small style={{ color: 'var(--color-muted)' }}>
                          {abs.validatedBy ? `Par ${abs.validatedBy}` : '—'}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      Aucune absence pour les filtres sélectionnés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
