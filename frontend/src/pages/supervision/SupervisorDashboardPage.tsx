import React, { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { listAttendance } from '../../services/api/attendance.api';
import { listInterventions } from '../../services/api/interventions.api';
import { listSites } from '../../services/api/sites.api';
import { Attendance } from '../../types/attendance';
import { Intervention } from '../../types/intervention';
import { Site } from '../../types/site';
import { formatDateTime } from '../../utils/datetime';

const todayISO = new Date().toISOString().slice(0, 10);

export const SupervisorDashboardPage: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const [sites, setSites] = useState<Site[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(false);

  const supervisedSites = useMemo(() => {
    if (!user) return sites;
    if (user.role?.toUpperCase() !== 'SUPERVISOR') return sites;
    return sites.filter((site) => site.supervisorIds?.includes(user.id));
  }, [sites, user]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      listSites(token, { pageSize: 200 }).catch(() => ({ items: [] as Site[] })),
      listAttendance(token, { startDate: todayISO, endDate: todayISO }).catch(() => [] as Attendance[]),
      listInterventions(token, { startDate: todayISO, endDate: todayISO, pageSize: 100 }).catch(() => ({
        items: [] as Intervention[],
      })),
    ])
      .then(([sitesRes, attendanceRes, interventionsRes]) => {
        setSites(sitesRes.items);
        setAttendance(Array.isArray(attendanceRes) ? attendanceRes : (attendanceRes as any).items ?? []);
        const items = (interventionsRes as any).items ?? (Array.isArray(interventionsRes) ? interventionsRes : []);
        setInterventions(items);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les données supervision';
        notify(message, 'error');
      })
      .finally(() => setLoading(false));
  }, [token, notify]);

  const presenceStats = useMemo(() => {
    const scopedSiteIds = new Set(supervisedSites.map((s) => s.id));
    const items = attendance.filter((a) => scopedSiteIds.size === 0 || scopedSiteIds.has(a.site.id));
    let present = 0;
    let late = 0;
    items.forEach((att) => {
      const isPresent = Boolean(att.checkInTime);
      if (isPresent) present += 1;
      if (att.plannedStart && att.checkInTime && att.checkInTime > att.plannedStart) {
        late += 1;
      }
    });
    return { present, late, absent: Math.max(0, items.length - present) };
  }, [attendance, supervisedSites]);

  const interventionsToday = useMemo(() => {
    const scopedSiteIds = new Set(supervisedSites.map((s) => s.id));
    return interventions.filter((i) => scopedSiteIds.size === 0 || scopedSiteIds.has(i.siteId));
  }, [interventions, supervisedSites]);

  return (
    <div className="page">
      <div className="page-header">
        <span className="pill">Supervision</span>
        <h2>Tableau de bord superviseur</h2>
        <p>Suivi synthétique : présence actuelle, interventions du jour et raccourcis planning.</p>
      </div>

      <div className="page-grid">
        <article className="card">
          <span className="card__meta">Présence actuelle</span>
          <p className="card__value">{presenceStats.present}</p>
          <p className="card__meta">Retards : {presenceStats.late} · Absents : {presenceStats.absent}</p>
        </article>
        <article className="card">
          <span className="card__meta">Interventions du jour</span>
          <p className="card__value">{interventionsToday.length}</p>
          <p className="card__meta">
            En cours : {interventionsToday.filter((i) => i.status === 'IN_PROGRESS').length} · Planifiées :{' '}
            {interventionsToday.filter((i) => i.status === 'PLANNED').length} · Terminées :{' '}
            {interventionsToday.filter((i) => i.status === 'COMPLETED').length}
          </p>
        </article>
        <article className="card">
          <span className="card__meta">Sites suivis</span>
          <p className="card__value">{supervisedSites.length || sites.length}</p>
          <p className="card__meta">{loading ? 'Chargement...' : 'Mise à jour jour J'}</p>
        </article>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="card__meta">Interventions du jour</p>
            <h3 style={{ margin: 0 }}>Dernières interventions</h3>
          </div>
        </div>
        <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
          <table className="table" aria-label="interventions du jour">
            <thead>
              <tr>
                <th>Site</th>
                <th>Horaire</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Agents</th>
                <th>Observation</th>
              </tr>
            </thead>
            <tbody>
              {interventionsToday.slice(0, 8).map((intervention) => (
                <tr key={intervention.id}>
                  <td>
                    <strong>{intervention.siteName}</strong>
                  </td>
                  <td>
                    {intervention.date} · {intervention.startTime} – {intervention.endTime}
                  </td>
                  <td>{intervention.type === 'REGULAR' ? 'Régulière' : 'Ponctuelle'}</td>
                  <td>
                    <span className={`status-chip ${intervention.status === 'COMPLETED' ? 'status-chip--success' : intervention.status === 'IN_PROGRESS' ? 'status-chip--warning' : 'status-chip--info'}`}>
                      {{
                        PLANNED: 'Planifiée',
                        IN_PROGRESS: 'En cours',
                        COMPLETED: 'Terminée',
                        NEEDS_REVIEW: 'À valider',
                        CANCELLED: 'Annulée',
                        NO_SHOW: 'Non effectuée',
                      }[intervention.status] || intervention.status}
                    </span>
                  </td>
                  <td>{intervention.agents.map((agent) => agent.name).join(', ') || '—'}</td>
                  <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {intervention.observation ?? '—'}
                  </td>
                </tr>
              ))}
              {interventionsToday.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucune intervention programmée aujourd'hui.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
