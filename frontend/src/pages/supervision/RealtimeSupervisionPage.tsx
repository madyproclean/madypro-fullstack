import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuthContext } from '../../context/AuthContext';
import { listAttendance, getLiveMap } from '../../services/api/attendance.api';
import { listSites } from '../../services/api/sites.api';
import { listInterventions } from '../../services/api/interventions.api';
import { Attendance, LiveMapEntry } from '../../types/attendance';
import { Site } from '../../types/site';
import { Intervention } from '../../types/intervention';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { List, Map as MapIcon } from 'lucide-react';
import { formatDateTime } from '../../utils/datetime';
import { env } from '../../config/env';

type View = 'liste' | 'carte';

const todayLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const today = todayLocal();

const PresenceListView: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [filters, setFilters] = useState<{ siteId: string; date: string; search: string }>({
    siteId: 'all',
    date: today,
    search: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = (silent?: boolean) => {
      if (!token) return;
      if (!silent) setLoading(true);
      Promise.all([
        listAttendance(token, { startDate: filters.date, endDate: filters.date, pageSize: 200 }).catch(() => ({ items: [] as Attendance[] })),
        listSites(token, { pageSize: 200 }).catch(() => ({ items: [] as Site[] })),
        listInterventions(token, { startDate: filters.date, endDate: filters.date, pageSize: 500 }).catch(() => ({ items: [] as Intervention[] })),
      ])
        .then(([attendanceRes, sitesRes, interventionsRes]) => {
          const interventionsList = interventionsRes.items;
          const mergePlannedFromIntervention = (att: Attendance) => {
            const match = interventionsList.find(
              (intervention) =>
                intervention.siteId === att.site.id &&
                intervention.date === filters.date &&
                intervention.agents?.some((a) => a.id === att.agent.id),
            );
            if (!match) return att;
            return {
              ...att,
              plannedStart: att.plannedStart ?? match.startTime,
              plannedEnd: att.plannedEnd ?? match.endTime,
            };
          };
          setAttendance(attendanceRes.items.map(mergePlannedFromIntervention));
          setSites(sitesRes.items);
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Impossible de charger la présence';
          notify(message, 'error');
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    };
    fetchData();
    const interval = setInterval(() => fetchData(true), 20000);
    return () => clearInterval(interval);
  }, [token, filters.date, notify]);

  const supervisedSiteIds = useMemo(() => {
    if (!user || user.role?.toUpperCase() !== 'SUPERVISOR') return null;
    const ids = sites.filter((s) => s.supervisorIds?.includes(user.id)).map((s) => s.id);
    return ids.length ? new Set(ids) : null;
  }, [sites, user]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter((att) => {
      if (supervisedSiteIds && !supervisedSiteIds.has(att.site.id)) return false;
      if (filters.siteId !== 'all' && att.site.id !== filters.siteId) return false;
      if (filters.search) {
        const target = `${att.agent.name} ${att.site.name}`.toLowerCase();
        if (!target.includes(filters.search.toLowerCase())) return false;
      }
      return true;
    });
  }, [attendance, filters.search, filters.siteId, supervisedSiteIds]);

  return (
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
        <Input
          label="Recherche (agent/site)"
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          placeholder="Nom de l’agent ou du site"
        />
      </div>

      <div className="panel">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="présence en temps réel">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Site</th>
                  <th>Check-in</th>
                  <th>Prévu</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.map((att) => {
                  const isPresent = Boolean(att.checkInTime);
                  const isLate =
                    isPresent && att.plannedStart && att.checkInTime && att.checkInTime > att.plannedStart;
                  return (
                    <tr key={att.id}>
                      <td>
                        <Link to={`/supervision/agents/${att.agent.id}`}>{att.agent.name}</Link>
                      </td>
                      <td>{att.site.name}</td>
                      <td>{att.checkInTime ? formatDateTime(att.checkInTime) : '—'}</td>
                      <td>
                        {att.plannedStart || att.plannedEnd
                          ? `${att.plannedStart ?? '—'}${att.plannedEnd ? ` → ${att.plannedEnd}` : ''}`
                          : '—'}
                      </td>
                      <td>
                        <span
                          className={`status-chip ${
                            isPresent ? (isLate ? 'status-chip--warning' : 'status-chip--success') : 'status-chip--info'
                          }`}
                        >
                          {isPresent ? (isLate ? 'En retard' : 'Présent') : 'Absent / non pointé'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredAttendance.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      Aucune présence pour les filtres sélectionnés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

const LiveMapView: React.FC = () => {
  const { token, notify } = useAuthContext();
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [entries, setEntries] = useState<LiveMapEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapboxgl.accessToken = env.mapboxToken;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [2.3522, 48.8566],
      zoom: 10,
    });
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const fetchLiveMap = (silent?: boolean) => {
      if (!token) return;
      if (!silent) setLoading(true);
      getLiveMap(token)
        .then(setEntries)
        .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger la carte', 'error'))
        .finally(() => {
          if (!silent) setLoading(false);
        });
    };
    fetchLiveMap();
    const id = setInterval(() => fetchLiveMap(true), 30000);
    return () => clearInterval(id);
  }, [token, notify]);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const withCoords = entries.filter((e) => e.latitude != null && e.longitude != null);
    withCoords.forEach((entry) => {
      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.style.background = '#0f98eb';
      el.style.border = '2px solid #fff';
      el.style.boxShadow = '0 0 0 2px rgba(15,152,235,0.35)';
      const popup = new mapboxgl.Popup({ offset: 16 }).setHTML(
        `<strong>${entry.agentName}</strong><br/>${entry.siteName}<br/><small>${new Date(entry.lastSeenAt).toLocaleTimeString('fr-FR')}</small>`,
      );
      const marker = new mapboxgl.Marker(el)
        .setLngLat([entry.longitude as number, entry.latitude as number])
        .setPopup(popup)
        .addTo(map.current as mapboxgl.Map);
      markers.current.push(marker);
    });
    if (withCoords.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      withCoords.forEach((entry) => bounds.extend([entry.longitude as number, entry.latitude as number]));
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 500 });
    }
  }, [entries]);

  return (
    <>
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div ref={mapContainer} style={{ width: '100%', height: '520px' }} />
      </div>
      <div className="panel" style={{ marginTop: '1rem' }}>
        <h3>Agents en mission {loading ? '…' : `(${entries.length})`}</h3>
        <ul className="list-line">
          {entries.map((entry) => (
            <li key={entry.userId}>
              <span>
                <Link to={`/supervision/agents/${entry.userId}`}>{entry.agentName}</Link>
              </span>
              <span>{entry.siteName}</span>
              <span className="card__meta">{new Date(entry.lastSeenAt).toLocaleTimeString('fr-FR')}</span>
            </li>
          ))}
          {entries.length === 0 && !loading && (
            <li>
              <span>Aucun agent en mission actuellement.</span>
            </li>
          )}
        </ul>
      </div>
    </>
  );
};

export const RealtimeSupervisionPage: React.FC = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultView: View = location.pathname === '/supervision/carte' ? 'carte' : 'liste';
  const view: View = searchParams.get('view') === 'carte' || searchParams.get('view') === 'liste'
    ? (searchParams.get('view') as View)
    : defaultView;

  const setView = (next: View) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('view', next);
      return params;
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="pill">Supervision</span>
        <h2>Présence &amp; carte temps réel</h2>
        <p>Suivi des agents en temps réel : liste des pointages ou position sur la carte.</p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <Button type="button" variant={view === 'liste' ? 'primary' : 'ghost'} icon={List} onClick={() => setView('liste')}>
          Liste
        </Button>
        <Button type="button" variant={view === 'carte' ? 'primary' : 'ghost'} icon={MapIcon} onClick={() => setView('carte')}>
          Carte
        </Button>
      </div>

      {view === 'liste' ? <PresenceListView /> : <LiveMapView />}
    </div>
  );
};
