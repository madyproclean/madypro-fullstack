import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { getUser } from '../../services/api/users.api';
import { listAttendance } from '../../services/api/attendance.api';
import { listInterventions } from '../../services/api/interventions.api';
import { listAbsences } from '../../services/api/absences.api';
import { listSites } from '../../services/api/sites.api';
import { listCertifications, listEmployeeDocuments, listBadgeAwards } from '../../services/api/team.api';
import { User } from '../../types/user';
import { Attendance } from '../../types/attendance';
import { Intervention } from '../../types/intervention';
import { Absence } from '../../types/absence';
import { Site } from '../../types/site';
import { Certification, EmployeeDocument, UserBadge } from '../../types/team';
import { Button } from '../../components/ui/Button';
import { List, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateTime } from '../../utils/datetime';

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Admin', SUPERVISOR: 'Superviseur', AGENT: 'Agent' };
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
const DOCUMENT_TYPE_LABELS: Record<string, string> = { CONTRACT: 'Contrat', BADGE: 'Badge', LICENSE: 'Permis', OTHER: 'Autre' };
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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
  const startWeekday = (first.getDay() + 6) % 7; // lundi = 0
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

export const AgentProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token, notify } = useAuthContext();

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [planningView, setPlanningView] = useState<PlanningView>('liste');
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));

  useEffect(() => {
    if (!token || !id) return;
    setLoadingUser(true);
    getUser(token, id)
      .then(setUser)
      .catch((err) => notify(err instanceof Error ? err.message : 'Agent introuvable', 'error'))
      .finally(() => setLoadingUser(false));
  }, [token, id, notify]);

  useEffect(() => {
    if (!token || !id) return;
    listSites(token, { pageSize: 500 }).then((res) => setSites(res.items)).catch(() => setSites([]));
    listCertifications(token, id).then(setCertifications).catch(() => setCertifications([]));
    listEmployeeDocuments(token, id).then(setDocuments).catch(() => setDocuments([]));
    listBadgeAwards(token, id).then(setBadges).catch(() => setBadges([]));
    listAttendance(token, { agentId: id, pageSize: 100 })
      .then((res) => setAttendance(res.items))
      .catch(() => setAttendance([]));
    listAbsences(token, { agentId: id, status: 'all', pageSize: 100 })
      .then((res) => setAbsences(res.items))
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
    listInterventions(token, { agentId: id, startDate: rangeStart, endDate: rangeEnd, pageSize: 500 })
      .then((res) => setInterventions(res.items))
      .catch(() => setInterventions([]));
  }, [token, id, rangeStart, rangeEnd]);

  const assignedSites = useMemo(() => {
    const fromInterventions = new Map<string, string>();
    interventions.forEach((i) => fromInterventions.set(i.siteId, i.siteName));
    const supervised = sites.filter((s) => s.supervisorIds?.includes(id ?? ''));
    return { intervened: Array.from(fromInterventions.values()), supervised };
  }, [interventions, sites, id]);

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

  if (loadingUser && !user) {
    return (
      <div className="page">
        <p>Chargement de la fiche agent...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <div className="page-header">
          <span className="pill">Équipes</span>
          <h2>Agent introuvable</h2>
        </div>
        <Link to="/users" className="btn btn--ghost">
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <span className="pill">Équipes</span>
        <h2>
          {user.firstName} {user.lastName}
        </h2>
        <p>Fiche complète : coordonnées, sites, planning, pointages, absences et documents RH.</p>
      </div>

      <div className="panel" style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="status-chip status-chip--info">{ROLE_LABELS[user.role?.toUpperCase()] ?? user.role}</span>
          <span className={`status-chip ${user.active ? 'status-chip--success' : 'status-chip--warning'}`}>
            {user.active ? 'Actif' : 'Inactif'}
          </span>
        </div>
        <p className="card__meta">Email : {user.email}</p>
        <p className="card__meta">Téléphone : {user.phone || '—'}</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to={`/users/${user.id}/edit`} className="btn btn--ghost">
            Modifier le compte
          </Link>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3>Sites</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {assignedSites.supervised.map((s) => (
            <span key={s.id} className="status-chip status-chip--info">
              {s.name} (supervisé)
            </span>
          ))}
          {assignedSites.intervened.map((name) => (
            <span key={name} className="status-chip status-chip--success">
              {name}
            </span>
          ))}
          {assignedSites.supervised.length === 0 && assignedSites.intervened.length === 0 && (
            <span className="card__meta">Aucun site associé pour la période affichée.</span>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '1rem' }}>
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
            <table className="table" aria-label="planning agent">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Horaire</th>
                  <th>Site</th>
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
                    <td>{i.siteName}</td>
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
                      <div key={iv.id} style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginTop: '0.15rem' }} title={iv.siteName}>
                        {iv.startTime} {iv.siteName}
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

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3>Pointages</h3>
        <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
          <table className="table" aria-label="pointages agent">
            <thead>
              <tr>
                <th>Date</th>
                <th>Site</th>
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
                  <td>{att.site.name}</td>
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

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3>Absences</h3>
        <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
          <table className="table" aria-label="absences agent">
            <thead>
              <tr>
                <th>Période</th>
                <th>Type</th>
                <th>Motif</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {absences.map((abs) => (
                <tr key={abs.id}>
                  <td>
                    {abs.from} → {abs.to}
                  </td>
                  <td>{ABSENCE_TYPE_LABELS[abs.type] ?? abs.type}</td>
                  <td>{abs.reason}</td>
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

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3>Habilitations</h3>
        <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
          <table className="table" aria-label="habilitations agent">
            <thead>
              <tr>
                <th>Libellé</th>
                <th>Expiration</th>
              </tr>
            </thead>
            <tbody>
              {certifications.map((cert) => {
                const expiringSoon =
                  cert.expiresAt && new Date(cert.expiresAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
                return (
                  <tr key={cert.id}>
                    <td>{cert.label}</td>
                    <td style={expiringSoon ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                      {cert.expiresAt ? cert.expiresAt.slice(0, 10) : '—'}
                    </td>
                  </tr>
                );
              })}
              {certifications.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucune habilitation enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h3>Documents RH</h3>
        <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
          <table className="table" aria-label="documents agent">
            <thead>
              <tr>
                <th>Type</th>
                <th>Libellé</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</td>
                  <td>{doc.label}</td>
                  <td>
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="btn btn--ghost btn--compact">
                      Ouvrir
                    </a>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                    Aucun document enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Badges</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {badges.map((b) => (
            <span key={b.id} className="status-chip status-chip--success" title={b.badge.description}>
              {b.badge.label}
            </span>
          ))}
          {badges.length === 0 && <span className="card__meta">Aucun badge reçu.</span>}
        </div>
      </div>
    </div>
  );
};
