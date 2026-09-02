import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import {
  getSite,
  listSiteCategories,
  listSiteContracts,
  listSiteZones,
  getSiteIncidents,
  getSiteQualityScore,
  getSiteQrCode,
} from '../../services/api/sites.api';
import { listInventory } from '../../services/api/inventory.api';
import { listInterventions, getSiteRoster } from '../../services/api/interventions.api';
import { listAttendance } from '../../services/api/attendance.api';
import { PhotoGrid } from '../../components/ui/PhotoGrid';
import { listAbsences } from '../../services/api/absences.api';
import { Site } from '../../types/site';
import { SiteCategory, SiteRoster } from '../../types/category';
import { SiteContract, SiteZone, SiteIncident, SiteQualityScore, SiteQrCode } from '../../types/siteAdvanced';
import { InventoryItem } from '../../types/inventory';
import { Intervention } from '../../types/intervention';
import { Attendance } from '../../types/attendance';
import { Absence } from '../../types/absence';
import { Button } from '../../components/ui/Button';
import { List, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { formatDateTime } from '../../utils/datetime';

const PROFILE_TABS = [
  { id: 'general', label: 'Informations générales' },
  { id: 'quality', label: 'Qualité & agents' },
  { id: 'planning', label: 'Planning' },
  { id: 'attendance', label: 'Pointages' },
  { id: 'absences', label: 'Absences' },
  { id: 'categories', label: 'Catégories & checklist' },
  { id: 'roster', label: 'Équipe' },
  { id: 'contracts', label: 'Contrats & incidents' },
  { id: 'zones', label: 'Zones & plan' },
  { id: 'inventory', label: 'Inventaire' },
  { id: 'qr', label: 'QR code' },
];

const INTERVENTION_STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planifiée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  NEEDS_REVIEW: 'À valider',
  CANCELLED: 'Annulée',
  NO_SHOW: 'Non effectuée',
};
const ABSENCE_TYPE_LABELS: Record<string, string> = {
  SICK: 'Arrêt maladie',
  PAID_LEAVE: 'Congés payés',
  UNPAID: 'Sans solde',
  OTHER: 'Autre',
};
const ABSENCE_STATUS_LABELS: Record<string, string> = { PENDING: 'En attente', APPROVED: 'Approuvé', REJECTED: 'Rejeté' };
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

type PlanningView = 'liste' | 'calendrier';

const toISODate = (d: Date) => {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthLabel = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

const buildCalendarGrid = (month: Date) => {
  const first = startOfMonth(month);
  const startWeekday = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startWeekday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
};

export const SiteProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token, notify } = useAuthContext();

  const [site, setSite] = useState<Site | null>(null);
  const [loadingSite, setLoadingSite] = useState(false);
  const [siteCategories, setSiteCategories] = useState<SiteCategory[]>([]);
  const [roster, setRoster] = useState<SiteRoster | null>(null);
  const [contracts, setContracts] = useState<SiteContract[]>([]);
  const [zones, setZones] = useState<SiteZone[]>([]);
  const [incidents, setIncidents] = useState<SiteIncident[]>([]);
  const [qualityScore, setQualityScore] = useState<SiteQualityScore | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [qrCode, setQrCode] = useState<SiteQrCode | null>(null);

  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [planningView, setPlanningView] = useState<PlanningView>('liste');
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    if (!token || !id) return;
    setLoadingSite(true);
    getSite(token, id)
      .then(setSite)
      .catch((err) => notify(err instanceof Error ? err.message : 'Site introuvable', 'error'))
      .finally(() => setLoadingSite(false));
  }, [token, id, notify]);

  useEffect(() => {
    if (!token || !id) return;
    listSiteCategories(token, id).then(setSiteCategories).catch(() => setSiteCategories([]));
    getSiteRoster(token, id).then(setRoster).catch(() => setRoster(null));
    listSiteContracts(token, id).then(setContracts).catch(() => setContracts([]));
    listSiteZones(token, id).then(setZones).catch(() => setZones([]));
    getSiteIncidents(token, id).then(setIncidents).catch(() => setIncidents([]));
    getSiteQualityScore(token, id).then(setQualityScore).catch(() => setQualityScore(null));
    listInventory(token, id).then(setInventory).catch(() => setInventory([]));
    getSiteQrCode(token, id).then(setQrCode).catch(() => setQrCode(null));
    listAttendance(token, { siteId: id, pageSize: 100 })
      .then((res) => setAttendance(res.items))
      .catch(() => setAttendance([]));
    listAbsences(token, { status: 'all', pageSize: 500 })
      .then((res) => setAbsences(res.items.filter((abs) => abs.site?.id === id)))
      .catch(() => setAbsences([]));
  }, [token, id]);

  const rangeStart = useMemo(
    () => toISODate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 2, 1)),
    [calendarMonth],
  );
  const rangeEnd = useMemo(
    () => toISODate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 3, 0)),
    [calendarMonth],
  );

  useEffect(() => {
    if (!token || !id) return;
    listInterventions(token, { siteId: id, startDate: rangeStart, endDate: rangeEnd, pageSize: 500 })
      .then((res) => setInterventions(res.items))
      .catch(() => setInterventions([]));
  }, [token, id, rangeStart, rangeEnd]);

  const agentsAtSite = useMemo(() => {
    const map = new Map<string, string>();
    interventions.forEach((i) => i.agents.forEach((a) => map.set(a.id, a.name)));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [interventions]);

  const sortedInterventions = useMemo(
    () => [...interventions].sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`)),
    [interventions],
  );

  const calendarDays = useMemo(() => buildCalendarGrid(calendarMonth), [calendarMonth]);
  const interventionsByDate = useMemo(() => {
    const map = new Map<string, Intervention[]>();
    interventions.forEach((i) => {
      const list = map.get(i.date) ?? [];
      list.push(i);
      map.set(i.date, list);
    });
    return map;
  }, [interventions]);

  if (loadingSite && !site) {
    return (
      <div className="page">
        <p>Chargement de la fiche site...</p>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="page">
        <div className="page-header">
          <span className="pill">Sites</span>
          <h2>Site introuvable</h2>
        </div>
        <Link to="/sites" className="btn btn--ghost">
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <span className="pill">Sites</span>
        <h2>{site.name}</h2>
        <p>Fiche complète : coordonnées, superviseurs, planning, pointages, absences, qualité et logistique.</p>
      </div>

      <Tabs tabs={PROFILE_TABS} active={activeTab} onChange={setActiveTab} />

      <TabPanel active={activeTab === 'general'}>
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`status-chip ${site.active ? 'status-chip--success' : 'status-chip--warning'}`}>
            {site.active ? 'Actif' : 'Inactif'}
          </span>
          {site.timeWindow && <span className="status-chip status-chip--info">{site.timeWindow}</span>}
        </div>
        <p className="card__meta" style={{ marginTop: '0.5rem' }}>
          Adresse : {site.address}
        </p>
        {(site.latitude != null || site.longitude != null) && (
          <p className="card__meta">
            GPS : {site.latitude?.toFixed(5)}, {site.longitude?.toFixed(5)}
          </p>
        )}
        <p className="card__meta">Contact sur place : {site.contactName || '—'} · {site.contactPhone || '—'}</p>
        <p className="card__meta">Instructions d'accès : {site.accessInstructions || '—'}</p>
        <p className="card__meta">Code d'accès : {site.accessCode || '—'}</p>
        <p className="card__meta">
          Règles de pointage : rayon {site.gpsDistanceMeters ?? '—'} m · tolérance {site.toleranceMinutes ?? '—'} min ·
          durée min. {site.minimumDurationMinutes ?? '—'} min
        </p>
        <p className="card__meta">
          Superviseurs : {site.supervisors?.map((s) => s.name).join(', ') || 'Aucun'}
        </p>
        {site.photos && site.photos.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <PhotoGrid images={site.photos} onAdd={() => {}} onRemove={() => {}} disabled />
          </div>
        )}
        <div style={{ marginTop: '0.75rem' }}>
          <Link to={`/sites/${site.id}/edit`} className="btn btn--ghost">
            Modifier le site
          </Link>
        </div>
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'quality'}>
      {qualityScore && (
        <div className="page-grid" style={{ marginBottom: '1rem' }}>
          <article className="card">
            <span className="card__meta">Score qualité ({qualityScore.periodDays}j)</span>
            <p className="card__value">{qualityScore.score} / 100</p>
          </article>
          <article className="card">
            <span className="card__meta">Interventions</span>
            <p className="card__value">
              {qualityScore.interventionsCompleted}/{qualityScore.interventionsTotal}
            </p>
          </article>
          <article className="card">
            <span className="card__meta">No-show</span>
            <p className="card__value">{qualityScore.noShowCount}</p>
          </article>
          <article className="card">
            <span className="card__meta">Anomalies</span>
            <p className="card__value">{qualityScore.anomalyCount}</p>
          </article>
        </div>
      )}

      <div className="panel">
        <h3>Agents intervenant sur ce site</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {agentsAtSite.map(([agentId, name]) => (
            <Link key={agentId} to={`/supervision/agents/${agentId}`} className="status-chip status-chip--info">
              {name}
            </Link>
          ))}
          {agentsAtSite.length === 0 && <span className="card__meta">Aucun agent sur la période affichée.</span>}
        </div>
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'planning'}>
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3>Planning</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button type="button" variant={planningView === 'liste' ? 'primary' : 'ghost'} icon={List} onClick={() => setPlanningView('liste')}>
              Liste
            </Button>
            <Button
              type="button"
              variant={planningView === 'calendrier' ? 'primary' : 'ghost'}
              icon={Calendar}
              onClick={() => setPlanningView('calendrier')}
            >
              Calendrier
            </Button>
          </div>
        </div>

        {planningView === 'liste' ? (
          <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
            <table className="table" aria-label="planning site">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Horaire</th>
                  <th>Agents</th>
                  <th>Type</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {sortedInterventions.map((i) => (
                  <tr key={i.id}>
                    <td>{i.date}</td>
                    <td>
                      {i.startTime} – {i.endTime}
                    </td>
                    <td>{i.agents.map((a) => a.name).join(', ') || '—'}</td>
                    <td>{i.type === 'REGULAR' ? 'Régulier' : `Ponctuel${i.subType ? ` - ${i.subType}` : ''}`}</td>
                    <td>{INTERVENTION_STATUS_LABELS[i.status] ?? i.status}</td>
                  </tr>
                ))}
                {sortedInterventions.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      Aucune intervention sur la période affichée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <Button
                type="button"
                variant="ghost"
                icon={ChevronLeft}
                onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              >
                ‹ Précédent
              </Button>
              <strong style={{ textTransform: 'capitalize' }}>{monthLabel(calendarMonth)}</strong>
              <Button
                type="button"
                variant="ghost"
                icon={ChevronRight}
                iconPosition="right"
                onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              >
                Suivant ›
              </Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem' }}>
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="card__meta" style={{ textAlign: 'center' }}>
                  {label}
                </div>
              ))}
              {calendarDays.map((day) => {
                const iso = toISODate(day);
                const dayInterventions = interventionsByDate.get(iso) ?? [];
                const inMonth = day.getMonth() === calendarMonth.getMonth();
                return (
                  <div
                    key={iso}
                    style={{
                      minHeight: '84px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      padding: '0.35rem',
                      opacity: inMonth ? 1 : 0.4,
                      background: dayInterventions.length ? '#f5fbf7' : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{day.getDate()}</div>
                    {dayInterventions.slice(0, 3).map((iv) => (
                      <div key={iv.id} style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginTop: '0.15rem' }}>
                        {iv.startTime} {iv.agents.map((a) => a.name).join(', ')}
                      </div>
                    ))}
                    {dayInterventions.length > 3 && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>+{dayInterventions.length - 3}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'attendance'}>
      <div className="panel">
        <h3>Pointages</h3>
        <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
          <table className="table" aria-label="pointages site">
            <thead>
              <tr>
                <th>Date</th>
                <th>Agent</th>
                <th>Arrivée</th>
                <th>Départ</th>
                <th>Durée</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((att) => (
                <tr key={att.id}>
                  <td>{att.date}</td>
                  <td>
                    <Link to={`/supervision/agents/${att.agent.id}`}>{att.agent.name}</Link>
                  </td>
                  <td>{att.checkInTime ? formatDateTime(att.checkInTime) : '—'}</td>
                  <td>{att.checkOutTime ? formatDateTime(att.checkOutTime) : '—'}</td>
                  <td>{att.durationMinutes != null ? `${att.durationMinutes} min` : '—'}</td>
                  <td>{{ PENDING: 'En attente', COMPLETED: 'Terminé', CANCELLED: 'Annulé' }[att.status] ?? att.status}</td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucun pointage enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'absences'}>
      <div className="panel">
        <h3>Absences liées à ce site</h3>
        <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
          <table className="table" aria-label="absences site">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Période</th>
                <th>Type</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {absences.map((abs) => (
                <tr key={abs.id}>
                  <td>
                    <Link to={`/supervision/agents/${abs.agent.id}`}>{abs.agent.name}</Link>
                  </td>
                  <td>
                    {abs.from} → {abs.to}
                  </td>
                  <td>{ABSENCE_TYPE_LABELS[abs.type] ?? abs.type}</td>
                  <td>{ABSENCE_STATUS_LABELS[abs.status] ?? abs.status}</td>
                </tr>
              ))}
              {absences.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucune absence enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'categories'}>
      <div className="panel">
        <h3>Catégories d'intervention & checklist</h3>
        {siteCategories.map((sc) => (
          <div key={sc.id} style={{ marginTop: '0.75rem' }}>
            <strong>
              {sc.category.label} <span className="card__meta">({sc.startTime}–{sc.endTime})</span>
            </strong>
            <ul className="list-line" style={{ marginTop: '0.25rem' }}>
              {sc.checklist.map((item) => (
                <li key={item.id}>• {item.label}</li>
              ))}
              {sc.checklist.length === 0 && <li>Aucune tâche définie.</li>}
            </ul>
          </div>
        ))}
        {siteCategories.length === 0 && <p className="card__meta" style={{ marginTop: '0.5rem' }}>Aucune catégorie associée à ce site.</p>}
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'roster'}>
      <div className="panel">
        <h3>Équipe (dérivée des gabarits actifs)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
          {roster &&
            [1, 2, 3, 4, 5, 6, 0].map((day) => {
              const entries = roster[String(day)] ?? [];
              if (!entries.length) return null;
              return (
                <div key={day} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                  <strong style={{ minWidth: '90px' }}>{DAY_LABELS[day]}</strong>
                  <span className="card__meta">
                    {entries.map((e) => `${e.agentName} (${e.startTime}–${e.endTime})`).join(', ')}
                  </span>
                </div>
              );
            })}
          {roster && Object.values(roster).every((entries) => entries.length === 0) && (
            <p className="card__meta">Aucun gabarit actif ne couvre ce site.</p>
          )}
        </div>
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'contracts'}>
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3>Contrats / SLA</h3>
        <ul className="list-line" style={{ marginTop: '0.5rem' }}>
          {contracts.map((contract) => {
            const expiringSoon = new Date(contract.endDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
            return (
              <li key={contract.id} style={expiringSoon ? { color: '#dc2626' } : undefined}>
                {contract.label} · {contract.startDate.slice(0, 10)} → {contract.endDate.slice(0, 10)}
                {contract.slaDetails ? ` · ${contract.slaDetails}` : ''}
              </li>
            );
          })}
          {contracts.length === 0 && <li>Aucun contrat enregistré.</li>}
        </ul>
      </div>

      {incidents.length > 0 && (
        <div className="panel">
          <h3>Incidents récents</h3>
          <ul className="list-line" style={{ marginTop: '0.5rem' }}>
            {incidents.slice(0, 10).map((incident) => (
              <li key={incident.id}>
                {incident.interventionDate.slice(0, 10)} · {incident.type} — {incident.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      </TabPanel>

      <TabPanel active={activeTab === 'zones'}>
      <div className="panel">
        <h3>Zones & plan des locaux</h3>
        <ul className="list-line" style={{ marginTop: '0.5rem' }}>
          {zones.map((zone) => (
            <li key={zone.id}>
              {zone.completed ? '✓' : '•'} {zone.label} {zone.floor ? `(${zone.floor})` : ''}
            </li>
          ))}
          {zones.length === 0 && <li>Aucune zone définie.</li>}
        </ul>
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'inventory'}>
      <div className="panel">
        <h3>Inventaire</h3>
        <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
          <table className="table" aria-label="inventaire site">
            <thead>
              <tr>
                <th>Article</th>
                <th>Quantité</th>
                <th>Seuil</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const low = item.quantity <= item.minThreshold;
                return (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td style={low ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                      {item.quantity} {item.unit}
                    </td>
                    <td>{item.minThreshold}</td>
                  </tr>
                );
              })}
              {inventory.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucun article enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </TabPanel>

      <TabPanel active={activeTab === 'qr'}>
      {qrCode ? (
        <div className="panel">
          <h3>QR code de pointage</h3>
          <img src={qrCode.qrCodeDataUrl} alt="QR code de pointage" style={{ width: 140, height: 140, marginTop: '0.5rem' }} />
        </div>
      ) : (
        <p className="card__meta">QR code non disponible pour ce site.</p>
      )}
      </TabPanel>
    </div>
  );
};
