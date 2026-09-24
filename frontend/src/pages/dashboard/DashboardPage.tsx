import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Settings, Users, UserCheck, UserX, MapPinOff, PackageX, AlertTriangle } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { getDashboardSummary, getDashboardLayout, setDashboardLayout, DashboardWidgetConfig } from '../../services/api/reports.api';
import { listLowStockInventory } from '../../services/api/inventory.api';
import { DashboardSummary } from '../../types/dashboard';
import { InventoryItem } from '../../types/inventory';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { Checkbox } from '../../components/ui/Checkbox';
import { StatCard, StatCardBadgeTone } from '../../components/ui/StatCard';
import { Badge, BadgeTone } from '../../components/ui/Badge';
import { BarChartCard } from '../../components/charts/BarChartCard';
import { DonutChartCard } from '../../components/charts/DonutChartCard';
import { env } from '../../config/env';

const METRIC_ICONS: Record<string, { icon: typeof Users; tone: StatCardBadgeTone }> = {
  'Agents planifiés': { icon: Users, tone: 'blue' },
  'Agents pointés': { icon: UserCheck, tone: 'green' },
  'Agents absents': { icon: UserX, tone: 'red' },
  'Sites impactés': { icon: MapPinOff, tone: 'orange' },
};

const PLANNING_STATUS_TONE: Record<DashboardSummary['planning'][number]['status'], BadgeTone> = {
  ON_TIME: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
};

const PLANNING_STATUS_LABEL: Record<DashboardSummary['planning'][number]['status'], (checkIn?: string) => string> = {
  ON_TIME: (checkIn) => `Présent ${checkIn ?? ''}`.trim(),
  LATE: (checkIn) => `Retard ${checkIn ?? ''}`.trim(),
  ABSENT: () => 'Absent',
};

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
    getDashboardSummary(token, filters?.date)
      .then((data) => {
        setSummary(data);
        setFilters((prev) => prev ?? createDefaultFilters(data.defaultDate));
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Impossible de charger le tableau de bord");
      })
      .finally(() => setLoading(false));
  }, [token, refreshTick, filters?.date]);

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
    // Ne pas fermer la connexion ici : EventSource se reconnecte automatiquement
    // après une coupure (redémarrage backend, réseau) tant qu'on ne l'a pas fermée
    // nous-mêmes. Fermer sur erreur désactivait silencieusement les mises à jour
    // en direct après la première coupure.
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

  const filteredAlerts = useMemo(() => {
    if (!summary || !filters) return [];
    return summary.alerts.filter((alert) => {
      if (filters.site !== 'all' && alert.site !== filters.site) return false;
      if (filters.supervisor !== 'all' && alert.supervisor !== filters.supervisor) return false;
      if (filters.search) {
        const term = filters.search.toLowerCase();
        const target = `${alert.agent} ${alert.site} ${alert.supervisor}`.toLowerCase();
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

  // Agrégats dérivés des mêmes enregistrements filtrés (pas de nouvelle source
  // de données) pour alimenter les graphiques — répartition présents/absents
  // par site, et répartition des statuts de pointage.
  const siteBreakdown = useMemo(() => {
    const bySite = new Map<string, { site: string; Présents: number; Absents: number }>();
    filteredRecords.forEach((record) => {
      const entry = bySite.get(record.site) ?? { site: record.site, Présents: 0, Absents: 0 };
      if (record.status === 'ABSENT') entry.Absents += 1;
      else entry.Présents += 1;
      bySite.set(record.site, entry);
    });
    return Array.from(bySite.values());
  }, [filteredRecords]);

  const statusBreakdown = useMemo(() => {
    if (filteredRecords.length === 0) return [];
    const counts = { ON_TIME: 0, LATE: 0, ABSENT: 0 };
    filteredRecords.forEach((record) => {
      counts[record.status] += 1;
    });
    const total = filteredRecords.length;
    const toPercent = (count: number) => Math.round((count / total) * 100);
    return [
      { label: 'À l’heure', value: toPercent(counts.ON_TIME) },
      { label: 'En retard', value: toPercent(counts.LATE) },
      { label: 'Absents', value: toPercent(counts.ABSENT) },
    ].filter((entry) => entry.value > 0);
  }, [filteredRecords]);

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
      <PageHeader
        title="Vue synthétique"
        subtitle="Suivez le plan de charge, la présence terrain et les alertes critiques en temps réel."
        actions={
          <Button type="button" variant="ghost" icon={Settings} onClick={() => setEditMode((v) => !v)}>
            {editMode ? 'Terminer la configuration' : 'Configurer le tableau de bord'}
          </Button>
        }
      />

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
                {metrics.map((metric) => {
                  const meta = METRIC_ICONS[metric.title];
                  return (
                    <StatCard
                      key={metric.title}
                      icon={meta?.icon ?? Users}
                      badgeTone={meta?.tone ?? 'blue'}
                      value={metric.value}
                      label={metric.title}
                    />
                  );
                })}
              </div>
              {(siteBreakdown.length > 0 || statusBreakdown.length > 0) && (
                <div className="page-grid page-grid--charts">
                  {siteBreakdown.length > 0 && (
                    <BarChartCard
                      title="Présence par site"
                      data={siteBreakdown}
                      xKey="site"
                      series={['Présents', 'Absents']}
                    />
                  )}
                  {statusBreakdown.length > 0 && (
                    <DonutChartCard
                      title="Répartition des pointages"
                      data={statusBreakdown}
                      centerValue={filteredRecords.length}
                      centerLabel="agents"
                    />
                  )}
                </div>
              )}
            </div>
          );
        }

        if (widget.id === 'lowStock') {
          if (!editMode && lowStock.length === 0) return null;
          return (
            <div key={widget.id}>
              {editControls}
              <section className="panel">
                <h3>Réapprovisionnement nécessaire</h3>
                {lowStock.length === 0 ? (
                  <p className="card__meta">Aucune alerte de stock.</p>
                ) : (
                  <ul className="list-line">
                    {lowStock.map((item) => (
                      <li key={item.id}>
                        <span>{item.site?.name ?? '—'}</span>
                        <Badge tone="warning" icon={PackageX}>
                          {item.name} · {item.quantity}/{item.minThreshold} {item.unit}
                        </Badge>
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
                  {filteredAlerts.length === 0 && <li>Aucune alerte.</li>}
                  {filteredAlerts.map((alert) => (
                    <li key={alert.id}>
                      <Badge
                        tone={alert.severity === 'error' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'info'}
                        icon={AlertTriangle}
                      >
                        {alert.type}
                      </Badge>
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
                            <Badge tone={PLANNING_STATUS_TONE[record.status]}>
                              {PLANNING_STATUS_LABEL[record.status](record.checkIn)}
                            </Badge>
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
