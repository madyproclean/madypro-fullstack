import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { getSteering, Steering } from '../../services/api/supervision.api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';

const pct = (v: number | null) => (v === null ? '—' : `${v} %`);
const trend = (now: number | null, before: number | null) => {
  if (now === null || before === null) return '';
  const diff = now - before;
  return diff === 0 ? ' (stable)' : ` (${diff > 0 ? '+' : ''}${diff} pts)`;
};
const tone = (v: number | null) => (v === null ? 'neutral' : v >= 90 ? 'success' : v >= 75 ? 'warning' : 'danger');

/** Pilotage : ponctualité, missions faites, heures, par agent et par site, comparé à la période précédente. */
export const SteeringPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Steering | null>(null);

  useEffect(() => {
    if (!token) return;
    setData(null);
    getSteering(token, days)
      .then(setData)
      .catch((err) => notify(err instanceof Error ? err.message : 'Chargement impossible', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, days]);

  return (
    <div className="page">
      <PageHeader title="Pilotage" subtitle="Les indicateurs clés de l’activité, par agent et par site." />
      <div className="chips" style={{ margin: '1rem 0' }}>
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" className={`chip ${days === d ? 'chip--selected' : ''}`} onClick={() => setDays(d)}>
            {d} jours
          </button>
        ))}
      </div>
      {!data ? (
        <p className="card__meta">Calcul en cours…</p>
      ) : (
        <>
          <div className="page-grid">
            <article className="card">
              <span className="card__meta">Arrivées à l’heure</span>
              <p className="card__value">{pct(data.current.onTimeRate)}</p>
              <p className="card__meta">{trend(data.current.onTimeRate, data.previous.onTimeRate) || 'pas de comparaison'}</p>
            </article>
            <article className="card">
              <span className="card__meta">Missions réalisées</span>
              <p className="card__value">{pct(data.current.completionRate)}</p>
              <p className="card__meta">
                {data.current.done} faites · {data.current.missed} non faites{trend(data.current.completionRate, data.previous.completionRate)}
              </p>
            </article>
            <article className="card">
              <span className="card__meta">Missions sur la période</span>
              <p className="card__value">{data.current.missions}</p>
              <p className="card__meta">
                du {new Date(data.period.startDate).toLocaleDateString('fr-FR')} au {new Date(data.period.endDate).toLocaleDateString('fr-FR')}
              </p>
            </article>
          </div>

          <div className="panel" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Par agent</h3>
            <div className="table-wrapper">
              <table className="table" aria-label="pilotage par agent">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Missions</th>
                    <th>Non faites</th>
                    <th>Retards</th>
                    <th>À l’heure</th>
                    <th>Heures faites / prévues</th>
                    <th>Pointages corrigés</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((a) => (
                    <tr key={a.agentId}>
                      <td>{a.agentName}</td>
                      <td>{a.missions}</td>
                      <td>{a.missed || '—'}</td>
                      <td>{a.late || '—'}</td>
                      <td>
                        <Badge tone={tone(a.onTimeRate)}>{pct(a.onTimeRate)}</Badge>
                      </td>
                      <td>
                        {a.workedHours} h / {a.plannedHours} h
                      </td>
                      <td>{a.corrections || '—'}</td>
                    </tr>
                  ))}
                  {!data.agents.length && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                        Aucune mission sur la période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Par site</h3>
            <div className="table-wrapper">
              <table className="table" aria-label="pilotage par site">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Missions</th>
                    <th>Réalisées</th>
                    <th>Non faites</th>
                    <th>Anomalies</th>
                    <th>Heures faites / prévues</th>
                    <th>Note qualité</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sites.map((s) => (
                    <tr key={s.siteId}>
                      <td>{s.siteName}</td>
                      <td>{s.missions}</td>
                      <td>
                        <Badge tone={tone(s.completionRate)}>{pct(s.completionRate)}</Badge>
                      </td>
                      <td>{s.missed || '—'}</td>
                      <td>{s.anomalies || '—'}</td>
                      <td>
                        {s.workedHours} h / {s.plannedHours} h
                      </td>
                      <td>{s.quality === null ? '—' : `${s.quality} / 100`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
