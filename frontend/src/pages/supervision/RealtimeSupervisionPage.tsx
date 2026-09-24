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
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
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
                        <Badge tone={isPresent ? (isLate ? 'warning' : 'success') : 'info'}>
                          {isPresent ? (isLate ? 'En retard' : 'Présent') : 'Absent / non pointé'}
                        </Badge>
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

const MAP_COLORS = { agent: '#0f98eb', siteActive: '#1f7a4d', siteIdle: '#8a94a6', ink: '#020912' };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

// Contenu de popup construit en DOM (pas de setHTML) : les noms viennent de la base
const popupContent = (title: string, lines: string[]) => {
  const root = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = title;
  root.appendChild(strong);
  lines.forEach((line) => {
    const div = document.createElement('div');
    div.textContent = line;
    root.appendChild(div);
  });
  return root;
};

// Étiquette toujours visible sous (ou au-dessus d'un) repère
const mapLabel = (text: string, position: 'above' | 'below') => {
  const label = document.createElement('div');
  label.textContent = text;
  Object.assign(label.style, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    [position === 'above' ? 'bottom' : 'top']: 'calc(100% + 4px)',
    whiteSpace: 'nowrap',
    background: '#fff',
    color: MAP_COLORS.ink,
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1.2',
    padding: '3px 8px',
    borderRadius: '999px',
    boxShadow: '0 1px 4px rgba(2, 9, 18, 0.25)',
    pointerEvents: 'none',
  });
  return label;
};

const LiveMapView: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const idleLabels = useRef<HTMLDivElement[]>([]);
  const hasFitted = useRef(false);
  const [entries, setEntries] = useState<LiveMapEntry[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);

  // Noms des sites sans agent : masqués en vue d'ensemble pour éviter les chevauchements
  const updateIdleLabels = () => {
    const show = (map.current?.getZoom() ?? 0) >= 11;
    idleLabels.current.forEach((label) => {
      label.style.display = show ? 'block' : 'none';
    });
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapboxgl.accessToken = env.mapboxToken;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [2.3522, 48.8566],
      zoom: 10,
    });
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.current.on('zoomend', updateIdleLabels);
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
    if (!token) return;
    listSites(token, { pageSize: 200 })
      .then((res) => setSites(res.items))
      .catch(() => setSites([]));
  }, [token]);

  // Superviseur : uniquement ses sites (même règle que la vue liste)
  const visibleSites = useMemo(() => {
    const isSupervisor = user?.role?.toUpperCase() === 'SUPERVISOR';
    return sites.filter(
      (site) =>
        site.active &&
        site.latitude != null &&
        site.longitude != null &&
        (!isSupervisor || site.supervisorIds?.includes(user!.id)),
    );
  }, [sites, user]);

  useEffect(() => {
    if (!map.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    idleLabels.current = [];
    const bounds = new mapboxgl.LngLatBounds();

    const agentsBySite = new Map<string, LiveMapEntry[]>();
    entries.forEach((entry) => agentsBySite.set(entry.siteId, [...(agentsBySite.get(entry.siteId) ?? []), entry]));

    visibleSites.forEach((site) => {
      const onSite = agentsBySite.get(site.id) ?? [];
      const color = onSite.length ? MAP_COLORS.siteActive : MAP_COLORS.siteIdle;
      const el = document.createElement('div');
      Object.assign(el.style, {
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        background: color,
        border: '3px solid #fff',
        boxShadow: '0 1px 5px rgba(2, 9, 18, 0.4)',
        cursor: 'pointer',
      });
      const label = mapLabel(onSite.length ? `${site.name} · ${onSite.length} en mission` : site.name, 'above');
      if (!onSite.length) {
        idleLabels.current.push(label);
        el.addEventListener('mouseenter', () => { label.style.display = 'block'; });
        el.addEventListener('mouseleave', () => { label.style.display = (map.current?.getZoom() ?? 0) >= 11 ? 'block' : 'none'; });
      } else {
        el.style.zIndex = '2';
      }
      el.appendChild(label);
      const popup = new mapboxgl.Popup({ offset: 18 }).setDOMContent(
        popupContent(site.name, [site.address, onSite.length ? onSite.map((a) => a.agentName).join(', ') : 'Aucun agent en mission']),
      );
      markers.current.push(
        new mapboxgl.Marker(el).setLngLat([site.longitude as number, site.latitude as number]).setPopup(popup).addTo(map.current as mapboxgl.Map),
      );
      bounds.extend([site.longitude as number, site.latitude as number]);
    });

    // Agents d'un même site : alignés côte à côte sous l'épingle pour ne pas se superposer
    const withCoords = entries.filter((e) => e.latitude != null && e.longitude != null);
    const groups = new Map<string, LiveMapEntry[]>();
    withCoords.forEach((entry) => groups.set(entry.siteId, [...(groups.get(entry.siteId) ?? []), entry]));
    groups.forEach((group) => {
      group.forEach((entry, index) => {
        const dx = Math.round((index - (group.length - 1) / 2) * 84);
        const el = document.createElement('div');
        Object.assign(el.style, {
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          background: MAP_COLORS.agent,
          border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(2, 9, 18, 0.45)',
          color: '#fff',
          fontSize: '13px',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        });
        el.textContent = initials(entry.agentName);
        el.appendChild(mapLabel(entry.agentName.split(/\s+/)[0], 'below'));
        const popup = new mapboxgl.Popup({ offset: 22 }).setDOMContent(
          popupContent(entry.agentName, [entry.siteName, `Dernière position : ${new Date(entry.lastSeenAt).toLocaleTimeString('fr-FR')}`]),
        );
        markers.current.push(
          new mapboxgl.Marker({ element: el, offset: [dx, 34] })
            .setLngLat([entry.longitude as number, entry.latitude as number])
            .setPopup(popup)
            .addTo(map.current as mapboxgl.Map),
        );
        bounds.extend([entry.longitude as number, entry.latitude as number]);
      });
    });

    // Cadrage uniquement au premier affichage : le rafraîchissement (30 s) ne doit pas annuler le zoom de l'utilisateur
    if (!bounds.isEmpty() && !hasFitted.current) {
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 500 });
      hasFitted.current = entries.length > 0 || visibleSites.length > 0;
    }
    updateIdleLabels();
  }, [entries, visibleSites]);

  const legendDot = (color: string, size = 12): React.CSSProperties => ({
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    border: '2px solid #fff',
    boxShadow: '0 0 0 1px rgba(2, 9, 18, 0.2)',
    marginRight: 6,
    verticalAlign: 'middle',
  });

  return (
    <>
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div ref={mapContainer} style={{ width: '100%', height: '560px' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
        <span><span style={legendDot(MAP_COLORS.agent, 16)} />Agent en mission</span>
        <span><span style={legendDot(MAP_COLORS.siteActive)} />Site avec agents en mission</span>
        <span><span style={legendDot(MAP_COLORS.siteIdle)} />Site sans agent en ce moment</span>
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
      <PageHeader
        title="Présence & carte temps réel"
        subtitle="Suivi des agents en temps réel : liste des pointages ou position sur la carte."
      />

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
