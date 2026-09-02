import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { AuditLog, AuditAction } from '../../types/audit';
import { listAuditLogs, exportAuditCsv, AuditPage as AuditPageType } from '../../services/api/audit.api';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { formatDateTime } from '../../utils/datetime';
import { Download } from 'lucide-react';

const ACTION_OPTIONS: { value: AuditAction | 'all'; label: string }[] = [
  { value: 'all', label: 'Toutes les actions' },
  { value: 'CREATE_NOTIFICATION', label: 'Notification envoyée' },
  { value: 'CREATE_ABSENCE', label: 'Création absence' },
  { value: 'UPDATE_ABSENCE_STATUS', label: 'Validation absence' },
  { value: 'CREATE_MANUAL_ATTENDANCE', label: 'Pointage manuel' },
  { value: 'UPDATE_ATTENDANCE', label: 'Maj pointage' },
  { value: 'CANCEL_ATTENDANCE', label: 'Annulation pointage' },
  { value: 'UPDATE_SETTINGS', label: 'Paramètres' },
  { value: 'CREATE_USER', label: 'Création utilisateur' },
  { value: 'UPDATE_USER', label: 'Maj utilisateur' },
  { value: 'UPDATE_USER_STATUS', label: 'Activation/désactivation utilisateur' },
  { value: 'RESET_USER_PASSWORD', label: 'Réinitialisation mot de passe' },
  { value: 'CREATE_SITE', label: 'Création site' },
  { value: 'UPDATE_SITE', label: 'Maj site' },
  { value: 'DELETE_SITE', label: 'Suppression site' },
  { value: 'CREATE_INTERVENTION', label: 'Création intervention' },
  { value: 'UPDATE_INTERVENTION', label: 'Maj intervention' },
  { value: 'UPDATE_INTERVENTION_STATUS', label: 'Changement statut intervention' },
  { value: 'CANCEL_INTERVENTION', label: 'Annulation intervention' },
  { value: 'DUPLICATE_INTERVENTION', label: 'Duplication intervention' },
  { value: 'CREATE_TEMPLATE_STOP', label: "Ajout d'un arrêt de gabarit" },
  { value: 'UPDATE_TEMPLATE_STOP_AGENTS', label: "Changement d'agent sur un arrêt" },
  { value: 'DELETE_TEMPLATE_STOP', label: "Suppression d'un arrêt de gabarit" },
];

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const today = new Date();

export const AuditPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [pageData, setPageData] = useState<AuditPageType>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    actorId: '',
    action: 'all' as AuditAction | 'all',
    startDate: formatDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)),
    endDate: formatDate(today),
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const csv = await exportAuditCsv(token, filters);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-export-${filters.startDate}-${filters.endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de générer l'export";
      notify(message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const fetchLogs = () => {
    if (!token) return;
    setLoading(true);
    listAuditLogs(token, { ...filters, page, pageSize })
      .then((data) => setPageData(data))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les logs';
        notify(message, 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, [token, filters.startDate, filters.endDate, filters.actorId, filters.action, page, pageSize]);

  return (
    <div className="audit-page">
      <div className="page-header">
        <span className="pill">Audit</span>
        <h2>Historique des actions sensibles</h2>
        <p>Suivez qui a modifié quoi dans l’écosystème Madypro Clean.</p>
        <Button type="button" variant="ghost" icon={Download} onClick={handleExportCsv} disabled={exporting}>
          {exporting ? 'Export...' : 'Export RGPD (CSV)'}
        </Button>
      </div>

      <div className="filter-grid" role="search">
        <Input
          id="actorFilter"
          name="actorId"
          label="Utilisateur (email/id)"
          value={filters.actorId}
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, actorId: event.target.value }));
            setPage(1);
          }}
          placeholder="admin@madyproclean.com"
        />
        <label className="filter-field filter-card">
          Action
          <select
            value={filters.action}
            onChange={(event) => {
              setFilters((prev) => ({ ...prev, action: event.target.value as AuditAction | 'all' }));
              setPage(1);
            }}
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field filter-card">
          Début
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => {
              setFilters((prev) => ({ ...prev, startDate: event.target.value }));
              setPage(1);
            }}
          />
        </label>
        <label className="filter-field filter-card">
          Fin
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => {
              setFilters((prev) => ({ ...prev, endDate: event.target.value }));
              setPage(1);
            }}
          />
        </label>
        <div className="pagination">
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Précédent
          </button>
          <span className="card__meta">Page {page}</span>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              const maxPage = Math.ceil(pageData.total / pageSize) || 1;
              setPage((p) => (p < maxPage ? p + 1 : p));
            }}
            disabled={page * pageSize >= pageData.total}
          >
            Suivant
          </button>
          <span className="card__meta">{pageData.total} résultats</span>
        </div>
      </div>

      <section className="panel">
        <h3>Journal des actions</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="journal des actions">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Utilisateur</th>
                  <th>Action</th>
                  <th>Entité</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((log) => {
                  const hasDiff = Boolean(log.before || log.after);
                  const isExpanded = expandedId === log.id;
                  const diffKeys = hasDiff
                    ? Array.from(new Set([...Object.keys(log.before ?? {}), ...Object.keys(log.after ?? {})]))
                    : [];
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => hasDiff && setExpandedId(isExpanded ? null : log.id)}
                        style={hasDiff ? { cursor: 'pointer' } : undefined}
                      >
                        <td>{formatDateTime(log.createdAt)}</td>
                        <td>{log.actorId}</td>
                        <td>{ACTION_OPTIONS.find((option) => option.value === log.action)?.label ?? log.action}</td>
                        <td>
                          {log.entityType}
                          {log.entityId ? ` · ${log.entityId}` : ''}
                        </td>
                        <td>
                          {log.details ?? '—'}
                          {hasDiff && (isExpanded ? ' ▲' : ' ▼')}
                        </td>
                      </tr>
                      {isExpanded && hasDiff && (
                        <tr>
                          <td colSpan={5}>
                            <div className="detail-grid">
                              {diffKeys.map((key) => (
                                <div className="detail-grid__item" key={key}>
                                  <span>{key}</span>
                                  <strong>
                                    <span style={{ textDecoration: 'line-through', color: 'var(--color-muted)' }}>
                                      {JSON.stringify((log.before as any)?.[key] ?? '—')}
                                    </span>
                                    {' → '}
                                    <span style={{ color: '#16a34a' }}>{JSON.stringify((log.after as any)?.[key] ?? '—')}</span>
                                  </strong>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="pagination" style={{ marginTop: '1rem' }}>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Précédent
        </button>
        <span className="card__meta">Page {page}</span>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => {
            const maxPage = Math.ceil(pageData.total / pageSize) || 1;
            setPage((p) => (p < maxPage ? p + 1 : p));
          }}
          disabled={page * pageSize >= pageData.total}
        >
          Suivant
        </button>
        <span className="card__meta">{pageData.total} résultats</span>
      </div>
    </div>
  );
};
