import React, { useEffect, useMemo, useState } from 'react';
import { Download, Clock, CheckCircle2, CalendarX, TrendingUp, AlertTriangle, Wallet } from 'lucide-react';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { useAuthContext } from '../../context/AuthContext';
import { downloadSiteDossierPdf, getSiteDossierReport } from '../../services/api/reports.api';
import { listSites } from '../../services/api/sites.api';
import { SiteDossierReport } from '../../types/report';
import { Site } from '../../types/site';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const today = new Date();
const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);

const minutesToHoursLabel = (minutes: number) => `${(minutes / 60).toFixed(1)} h`;
const pct = (value: number | null) => (value === null ? '—' : `${value}%`);

export const SupervisorHoursQuotaPage: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const [filters, setFilters] = useState({ startDate: formatDate(defaultStart), endDate: formatDate(today) });
  const [siteId, setSiteId] = useState('all');
  const [sites, setSites] = useState<Site[]>([]);
  const [data, setData] = useState<SiteDossierReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    listSites(token, { pageSize: 200 })
      .then((res) => setSites(res.items))
      .catch(() => setSites([]));
  }, [token]);

  const siteOptions = useMemo(() => {
    const mine = user ? sites.filter((s) => s.supervisorIds?.includes(user.id)) : sites;
    return [{ value: 'all', label: 'Tous mes sites' }].concat(mine.map((s) => ({ value: s.id, label: s.name })));
  }, [sites, user]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getSiteDossierReport(token, { ...filters, siteId })
      .then(setData)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger le rapport';
        notify(message, 'error');
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [token, filters.startDate, filters.endDate, siteId, notify]);

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleDownloadPdf = async (targetSiteId?: string) => {
    if (!token) return;
    try {
      await downloadSiteDossierPdf(token, { ...filters, siteId: targetSiteId ?? siteId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de générer le PDF';
      notify(message, 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Dossier de site — mes sites"
        subtitle="Heures, ponctualité, complétion, anomalies et facturation pour les sites dont vous avez la charge."
      />

      <div className="filter-grid">
        <label className="filter-field filter-card">
          Du
          <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
        </label>
        <label className="filter-field filter-card">
          Au
          <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
        </label>
        <label className="filter-field filter-card">
          Site
          <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
            {siteOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p>Chargement du rapport...</p>}

      {data && !loading && (
        <>
          <div className="form-actions" style={{ marginBottom: '1rem' }}>
            <Button type="button" variant="ghost" icon={Download} onClick={() => handleDownloadPdf()}>
              Télécharger le dossier PDF
            </Button>
          </div>

          {data.sites.length === 0 && <p style={{ color: 'var(--color-muted)' }}>Aucune donnée pour cette période.</p>}

          {data.sites.map((site) => (
            <section className="panel" key={site.siteId} style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <h3>{site.siteName}</h3>
                <Button type="button" variant="ghost" icon={Download} onClick={() => handleDownloadPdf(site.siteId)}>
                  PDF de ce site
                </Button>
              </div>
              <div className="page-grid">
                <StatCard icon={Clock} badgeTone="blue" value={minutesToHoursLabel(site.totalMinutes)} label="Heures réalisées" />
                <StatCard icon={CheckCircle2} badgeTone="green" value={pct(site.punctualityRate)} label="Ponctualité" />
                <StatCard icon={CalendarX} badgeTone="orange" value={site.uncoveredDays} label="Jours non couverts" />
                <StatCard icon={TrendingUp} badgeTone="blue" value={pct(site.completionRate)} label="Taux de complétion" />
                <StatCard icon={AlertTriangle} badgeTone="red" value={site.anomalyCount} label="Anomalies" />
                <StatCard
                  icon={Wallet}
                  badgeTone="green"
                  value={`${site.billableHours} h / ${site.internalHours} h`}
                  label="Heures facturables / internes"
                />
              </div>
              <div className="table-wrapper">
                <table className="table" aria-label={`quota d'heures — ${site.siteName}`}>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Heures prévues</th>
                      <th>Heures réalisées</th>
                      <th>% accompli</th>
                      <th>Pénalité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {site.quota.agents.map((agent) => (
                      <tr key={agent.userId}>
                        <td>{agent.name}</td>
                        <td>{minutesToHoursLabel(agent.plannedMinutes)}</td>
                        <td>{minutesToHoursLabel(agent.realizedMinutes)}</td>
                        <td>{pct(agent.accomplishmentRate)}</td>
                        <td>
                          {agent.meetsQuota ? (
                            <Badge tone="success">Quota atteint</Badge>
                          ) : (
                            <Badge tone="danger">-{minutesToHoursLabel(agent.penaltyMinutes)}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                    {site.quota.agents.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                          Aucun agent sur la période.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};
