import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { listUsers } from '../../services/api/users.api';
import { listSites } from '../../services/api/sites.api';
import { listInterventions } from '../../services/api/interventions.api';
import { listAttendance } from '../../services/api/attendance.api';
import { listAbsences } from '../../services/api/absences.api';
import { User } from '../../types/user';
import { Site } from '../../types/site';
import { Intervention } from '../../types/intervention';
import { Attendance } from '../../types/attendance';
import { Absence } from '../../types/absence';
import { Input } from '../../components/ui/Input';

const toISODate = (d: Date) => {
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
};
const today = toISODate(new Date());
const rangeStart = toISODate(new Date(new Date().setDate(new Date().getDate() - 90)));
const rangeEnd = toISODate(new Date(new Date().setDate(new Date().getDate() + 60)));

type PresenceState = 'present' | 'late' | 'absent' | 'unknown';

export const MyTeamPage: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const [sites, setSites] = useState<Site[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]);
  const [pendingAbsences, setPendingAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ search: string; siteId: string; status: 'all' | PresenceState }>({
    search: '',
    siteId: 'all',
    status: 'all',
  });

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      listSites(token, { pageSize: 500 }).catch(() => ({ items: [] as Site[] })),
      listUsers(token, { role: 'AGENT', status: 'all', pageSize: 500 }).catch(() => ({ items: [] as User[] })),
      listInterventions(token, { startDate: rangeStart, endDate: rangeEnd, pageSize: 1000 }).catch(() => ({
        items: [] as Intervention[],
      })),
      listAttendance(token, { startDate: today, endDate: today, pageSize: 500 }).catch(() => ({
        items: [] as Attendance[],
      })),
      listAbsences(token, { status: 'PENDING', pageSize: 200 }).catch(() => ({ items: [] as Absence[] })),
    ])
      .then(([sitesRes, agentsRes, interventionsRes, attendanceRes, absencesRes]) => {
        setSites(sitesRes.items);
        setAgents(agentsRes.items);
        setInterventions(interventionsRes.items);
        setTodayAttendance(attendanceRes.items);
        setPendingAbsences(absencesRes.items);
      })
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger l’équipe', 'error'))
      .finally(() => setLoading(false));
  }, [token, notify]);

  const supervisedSites = useMemo(() => {
    if (!user) return [];
    if (user.role?.toUpperCase() !== 'SUPERVISOR') return sites;
    return sites.filter((s) => s.supervisorIds?.includes(user.id));
  }, [sites, user]);
  const supervisedSiteIds = useMemo(() => new Set(supervisedSites.map((s) => s.id)), [supervisedSites]);

  const scopedInterventions = useMemo(
    () => interventions.filter((i) => supervisedSiteIds.has(i.siteId)),
    [interventions, supervisedSiteIds],
  );

  const team = useMemo(() => {
    const agentIdsAtMySites = new Set<string>();
    const sitesByAgent = new Map<string, Map<string, string>>();
    const nextInterventionByAgent = new Map<string, Intervention>();
    const todayStr = today;

    scopedInterventions.forEach((intervention) => {
      intervention.agentIds.forEach((agentId) => {
        agentIdsAtMySites.add(agentId);
        const siteMap = sitesByAgent.get(agentId) ?? new Map<string, string>();
        siteMap.set(intervention.siteId, intervention.siteName);
        sitesByAgent.set(agentId, siteMap);
        if (intervention.date >= todayStr) {
          const current = nextInterventionByAgent.get(agentId);
          if (!current || `${intervention.date}${intervention.startTime}` < `${current.date}${current.startTime}`) {
            nextInterventionByAgent.set(agentId, intervention);
          }
        }
      });
    });

    const attendanceByAgent = new Map(todayAttendance.map((att) => [att.agent.id, att]));
    const pendingAbsenceByAgent = new Map(pendingAbsences.map((abs) => [abs.agent.id, abs]));

    return agents
      .filter((agent) => agentIdsAtMySites.has(agent.id))
      .map((agent) => {
        const att = attendanceByAgent.get(agent.id);
        let presence: PresenceState = 'unknown';
        const hasInterventionToday = scopedInterventions.some(
          (i) => i.date === todayStr && i.agentIds.includes(agent.id),
        );
        if (att?.checkInTime) {
          presence = att.plannedStart && att.checkInTime > att.plannedStart ? 'late' : 'present';
        } else if (hasInterventionToday) {
          presence = 'absent';
        }
        return {
          agent,
          sites: Array.from((sitesByAgent.get(agent.id) ?? new Map()).values()),
          nextIntervention: nextInterventionByAgent.get(agent.id),
          presence,
          pendingAbsence: pendingAbsenceByAgent.get(agent.id),
        };
      })
      .sort((a, b) => `${a.agent.firstName} ${a.agent.lastName}`.localeCompare(`${b.agent.firstName} ${b.agent.lastName}`));
  }, [agents, scopedInterventions, todayAttendance, pendingAbsences]);

  const filteredTeam = useMemo(() => {
    return team.filter((entry) => {
      if (filters.search) {
        const target = `${entry.agent.firstName} ${entry.agent.lastName} ${entry.agent.email}`.toLowerCase();
        if (!target.includes(filters.search.toLowerCase())) return false;
      }
      if (filters.siteId !== 'all') {
        const site = supervisedSites.find((s) => s.id === filters.siteId);
        if (!site || !entry.sites.includes(site.name)) return false;
      }
      if (filters.status !== 'all' && entry.presence !== filters.status) return false;
      return true;
    });
  }, [team, filters, supervisedSites]);

  const stats = useMemo(
    () => ({
      total: team.length,
      present: team.filter((t) => t.presence === 'present' || t.presence === 'late').length,
      late: team.filter((t) => t.presence === 'late').length,
      pendingAbsences: team.filter((t) => t.pendingAbsence).length,
    }),
    [team],
  );

  const presenceMeta: Record<PresenceState, { label: string; tone: string }> = {
    present: { label: 'Présent', tone: 'status-chip--success' },
    late: { label: 'En retard', tone: 'status-chip--warning' },
    absent: { label: 'Absent', tone: 'status-chip--warning' },
    unknown: { label: 'Pas de mission aujourd’hui', tone: 'status-chip--info' },
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="pill">Supervision</span>
        <h2>Mon équipe</h2>
        <p>Tous les agents intervenant sur vos sites, avec présence du jour, planning et absences.</p>
      </div>

      <div className="page-grid">
        <article className="card">
          <span className="card__meta">Agents dans l’équipe</span>
          <p className="card__value">{stats.total}</p>
          <p className="card__meta">{loading ? 'Chargement...' : `${supervisedSites.length} site(s) suivi(s)`}</p>
        </article>
        <article className="card">
          <span className="card__meta">Présents aujourd’hui</span>
          <p className="card__value">{stats.present}</p>
          <p className="card__meta">Dont {stats.late} en retard</p>
        </article>
        <article className="card">
          <span className="card__meta">Absences en attente</span>
          <p className="card__value">{stats.pendingAbsences}</p>
          <p className="card__meta">À valider</p>
        </article>
      </div>

      <div className="filter-grid" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <Input
          label="Recherche"
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          placeholder="Nom, prénom, email"
        />
        <label className="filter-field filter-card">
          Site
          <select
            value={filters.siteId}
            onChange={(e) => setFilters((prev) => ({ ...prev, siteId: e.target.value }))}
          >
            <option value="all">Tous</option>
            {supervisedSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field filter-card">
          Statut aujourd’hui
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as any }))}
          >
            <option value="all">Tous</option>
            <option value="present">Présents</option>
            <option value="late">En retard</option>
            <option value="absent">Absents</option>
            <option value="unknown">Pas de mission</option>
          </select>
        </label>
      </div>

      <div className="page-grid">
        {filteredTeam.map(({ agent, sites: agentSites, nextIntervention, presence, pendingAbsence }) => (
          <article key={agent.id} className="card">
            <span className="card__meta">Agent</span>
            <h3>
              {agent.firstName} {agent.lastName}
            </h3>
            <p>
              <span className={`status-chip ${presenceMeta[presence].tone}`}>{presenceMeta[presence].label}</span>
              {pendingAbsence && (
                <span className="status-chip status-chip--warning" style={{ marginLeft: '0.4rem' }}>
                  Absence en attente
                </span>
              )}
            </p>
            <p>Tél : {agent.phone || '—'}</p>
            <p>Email : {agent.email}</p>
            <p className="card__meta">Sites : {agentSites.length ? agentSites.join(', ') : '—'}</p>
            <p className="card__meta">
              Prochaine mission :{' '}
              {nextIntervention
                ? `${nextIntervention.date} · ${nextIntervention.startTime}–${nextIntervention.endTime} · ${nextIntervention.siteName}`
                : 'Aucune à venir'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <Link to={`/supervision/agents/${agent.id}`} className="btn btn--ghost">
                Fiche complète
              </Link>
            </div>
          </article>
        ))}
        {!loading && filteredTeam.length === 0 && (
          <p className="card__meta">Aucun agent ne correspond aux filtres sélectionnés.</p>
        )}
      </div>
    </div>
  );
};
