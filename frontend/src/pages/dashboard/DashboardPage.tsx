import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Settings } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { getDashboardSummary, getDashboardLayout, setDashboardLayout, DashboardWidgetConfig } from '../../services/api/reports.api';
import { listLowStockInventory } from '../../services/api/inventory.api';
import { DashboardSummary } from '../../types/dashboard';
import { InventoryItem } from '../../types/inventory';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { env } from '../../config/env';

const WIDGET_LABELS: Record<string, string> = {
  metrics: 'Indicateurs',
  lowStock: 'Réapprovisionnement',
  alerts: 'Alertes',
  planning: 'Planning du jour',
};

const DEFAULT_LAYOUT: DashboardWidgetConfig[] = [
  { id: 'metrics', visible: true, order: 0 },
  { id: 'lowStock', visible: true, order: 1 },
  { id: 'alerts', visible: true, order: 2 },
  { id: 'planning', visible: true, order: 3 },
];

type FilterState = {
  date: string;
  site: string;
  supervisor: string;
  search: string;
};

const createDefaultFilters = (defaultDate: string): FilterState => ({
  date: defaultDate,
  site: 'all',
  supervisor: 'all',
  search: '',
});

export const DashboardPage: React.FC = () => {
  const { token } = useAuthContext();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [filters, setFilters] = useState<FilterState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [layout, setLayout] = useState<DashboardWidgetConfig[]>(DEFAULT_LAYOUT);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (!token) return;
    listLowStockInventory(token).then(setLowStock).catch(() => setLowStock([]));
  }, [token, refreshTick]);

  useEffect(() => {
    if (!token) return;
    getDashboardLayout(token)
      .then((saved) => setLayout(saved && saved.length ? saved : DEFAULT_LAYOUT))
      .catch(() => setLayout(DEFAULT_LAYOUT));
  }, [token]);

  const persistLayout = (next: DashboardWidgetConfig[]) => {
    setLayout(next);
    if (token) setDashboardLayout(token, next).catch(() => {});
  };

  const toggleWidgetVisible = (id: string) => {
    persistLayout(layout.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  };

  const moveWidget = (id: string, direction: -1 | 1) => {
    const sorted = [...layout].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((w) => w.id === id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return;
    [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
    persistLayout(sorted.map((w, i) => ({ ...w, order: i })));
  };

  const orderedLayout = useMemo(() => [...layout].sort((a, b) => a.order - b.order), [layout]);
  const isWidgetVisible = (id: string) => editMode || layout.find((w) => w.id === id)?.visible !== false;

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getDashboardSummary(token)
      .then((data) => {
        setSummary(data);
        setFilters((prev) => prev ?? createDefaultFilters(data.defaultDate));
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Impossible de charger le tableau de bord");
      })
      .finally(() => setLoading(false));
  }, [token, refreshTick]);

  useEffect(() => {
    if (!token) return;
    const source = new EventSource(`${env.apiUrl}/realtime/stream?token=${token}`);
    const handler = () => setRefreshTick((prev) => prev + 1);
    source.addEventListener('attendance.arrival', handler);
    source.addEventListener('attendance.checkin', handler);
    source.addEventListener('attendance.checkout', handler);
    source.addEventListener('intervention.status', handler);
    source.addEventListener('intervention.created', handler);
    source.addEventListener('intervention.updated', handler);
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [token]);

  const filteredRecords = useMemo(() => {
    if (!summary || !filters) return [];
    return summary.planning.filter((record) => {
      if (filters.site !== 'all' && record.site !== filters.site) return false;
      if (filters.supervisor !== 'all' && record.supervisor !== filters.supervisor) return false;
      if (filters.search) {
        const term = filters.search.toLowerCase();
        const target = `${record.agent} ${record.site} ${record.supervisor}`.toLowerCase();
        if (!target.includes(term)) return false;
      }
      return true;
    });
  }, [summary, filters]);

  const metrics = useMemo(() => {
    if (!summary || !filters) return [];
    const planned = filteredRecords.filter((record) => record.planned).length;
    const present = filteredRecords.filter((record) => record.checkIn).length;
    const absents = filteredRecords.filter((record) => record.status === 'ABSENT').length;
    const absSites = new Set(
      filteredRecords.filter((record) => record.status === 'ABSENT').map((record) => record.site)
    );
    return [
      { title: 'Agents planifiés', value: planned },
      { title: 'Agents pointés', value: present },
      { title: 'Agents absents', value: absents },
      { title: 'Sites impactés', value: absSites.size },
    ];
  }, [filteredRecords, summary, filters]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  if (!loading && error && (!summary || !filters)) {
    return <p className="form-error">{error}</p>;
  }

  if (loading || !summary || !filters) {
    return <p>Chargement du tableau de bord...</p>;
  }

  return (
    <div>
      <div className="page-hero">
        <div className="page-hero__content">
          <span className="pill">Tableau de bord Madypro Clean</span>
          <h2>Vue synthétique</h2>
          <p>Suivez le plan de charge, la présence terrain et les alertes critiques en temps réel.</p>
        </div>
        <div className="page-hero__accent">
          <h3>Filtres</h3>
          <div className="filter-grid" role="search">
            <label className="filter-field filter-card filter-card--wide">
              Recherche
              <input
                type="text"
                placeholder="Agent, site..."
                value={filters.search}
                onChange={(event) => handleFilterChange('search', event.target.value)}
              />
            </label>
            <label className="filter-field filter-card">
              Date
              <input
                type="date"
                value={filters.date}
                onChange={(event) => handleFilterChange('date', event.target.value)}
              />
            </label>
            <label className="filter-field filter-card">
              Site
              <select
                value={filters.site}
                onChange={(event) => handleFilterChange('site', event.target.value)}
              >
                {['all', ...summary.filterOptions.sites].map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'Tous' : option}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field filter-card">
              Superviseur
              <select
                value={filters.supervisor}
                onChange={(event) => handleFilterChange('supervisor', event.target.value)}
              >
                {['all', ...summary.filterOptions.supervisors].map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'Tous' : option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0.5rem 0' }}>
        <Button type="button" variant="ghost" icon={Settings} onClick={() => setEditMode((v) => !v)}>
          {editMode ? 'Terminer la configuration' : 'Configurer le tableau de bord'}
        </Button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {orderedLayout.map((widget) => {
        if (!isWidgetVisible(widget.id)) return null;
        const editControls = editMode && (
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className="pill">{WIDGET_LABELS[widget.id] ?? widget.id}</span>
            <Button type="button" variant="ghost" className="btn--compact" icon={ArrowUp} onClick={() => moveWidget(widget.id, -1)} aria-label="Monter" />
            <Button type="button" variant="ghost" className="btn--compact" icon={ArrowDown} onClick={() => moveWidget(widget.id, 1)} aria-label="Descendre" />
            <Checkbox checked={widget.visible} onChange={() => toggleWidgetVisible(widget.id)} label="Visible" />
          </div>
        );

        if (widget.id === 'metrics') {
          return (
            <div key={widget.id}>
              {editControls}
              <div className="page-grid">
                {metrics.map((metric) => (
                  <article key={metric.title} className="card">
                    <span className="card__meta">{metric.title}</span>
                    <p className="card__value">{metric.value}</p>
                  </article>
                ))}
              </div>
            </div>
          );
        }

        if (widget.id === 'lowStock') {
          if (!editMode && lowStock.length === 0) return null;
          return (
            <div key={widget.id}>
              {editControls}
              <section className="panel" style={{ borderColor: '#f59e0b' }}>
                <h3>Réapprovisionnement nécessaire</h3>
                {lowStock.length === 0 ? (
                  <p className="card__meta">Aucune alerte de stock.</p>
                ) : (
                  <ul className="list-line">
                    {lowStock.map((item) => (
                      <li key={item.id}>
                        <span>{item.site?.name ?? '—'}</span>
                        <span style={{ color: '#b45309' }}>
                          {item.name} : {item.quantity} / {item.minThreshold} {item.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          );
        }

        if (widget.id === 'alerts') {
          return (
            <div key={widget.id}>
              {editControls}
              <section className="panel">
                <h3>Alertes</h3>
                <ul className="list-line">
                  {summary.alerts.map((alert) => (
                    <li key={alert.id}>
                      <span>{alert.type}</span>
                      <span>{alert.description}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          );
        }

        if (widget.id === 'planning') {
          return (
            <div key={widget.id}>
              {editControls}
              <section className="panel">
                <h3>Planning du jour</h3>
                <div className="table-wrapper">
                  <table className="table" aria-label="planning synthétique">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Site</th>
                        <th>Superviseur</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((record) => (
                        <tr key={record.id}>
                          <td>{record.agent}</td>
                          <td>{record.site}</td>
                          <td>{record.supervisor}</td>
                          <td>
                            <span
                              className={`status-chip ${
                                record.status === 'ON_TIME'
                                  ? 'status-chip--success'
                                  : record.status === 'LATE'
                                  ? 'status-chip--warning'
                                  : 'status-chip--info'
                              }`}
                            >
                              {record.status === 'ON_TIME'
                                ? `Présent ${record.checkIn}`
                                : record.status === 'LATE'
                                ? `Retard ${record.checkIn}`
                                : 'Absent'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
