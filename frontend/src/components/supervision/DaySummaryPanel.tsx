import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { DaySummary, getDaySummary } from '../../services/api/supervision.api';

/** Bilan de la journée : ce qui est fait, ce qui reste, ce qui a posé problème. */
export const DaySummaryPanel: React.FC<{ missionsPath?: string }> = ({ missionsPath }) => {
  const { token } = useAuthContext();
  const [data, setData] = useState<DaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getDaySummary(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Bilan indisponible'));
  }, [token]);

  if (error) {
    return (
      <div className="panel" style={{ marginTop: '1rem' }}>
        <p className="card__meta">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="panel" style={{ marginTop: '1rem' }}>
        <p className="card__meta">Bilan du jour en cours de calcul…</p>
      </div>
    );
  }

  const tiles: [string, string | number][] = [
    ['Missions faites', `${data.missions.completed + data.missions.toValidate} / ${data.missions.total}`],
    ['À valider', data.missions.toValidate],
    ['Non faites', data.missions.notDone],
    ['Arrivées à l’heure', data.punctuality.onTimeRate === null ? '—' : `${data.punctuality.onTimeRate} %`],
    ['Heures faites / prévues', `${data.hours.worked} h / ${data.hours.planned} h`],
    ['Anomalies ouvertes', data.anomalyCount.open],
  ];
  const list = (title: string, items: string[], empty: string) => (
    <div>
      <strong>{title}</strong>
      {items.length ? (
        <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem' }}>
          {items.slice(0, 8).map((text, index) => (
            <li key={index} style={{ fontSize: '0.9rem' }}>
              {text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="card__meta" style={{ margin: '0.25rem 0 0' }}>
          {empty}
        </p>
      )}
    </div>
  );

  return (
    <div className="panel" style={{ marginTop: '1rem' }} aria-label="bilan du jour">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Bilan du jour</h3>
        {missionsPath && data.missions.toValidate > 0 && <Link to={missionsPath}>Voir les missions à valider</Link>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', margin: '0.75rem 0' }}>
        {tiles.map(([label, value]) => (
          <div key={label} className="card" style={{ padding: '0.75rem' }}>
            <span className="card__meta">{label}</span>
            <p className="card__value" style={{ fontSize: '1.4rem', margin: '0.2rem 0 0' }}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {list('Retards', data.late.map((l) => `${l.agentName} · ${l.siteName} (${l.startTime}) · ${l.minutesLate} min`), 'Aucun retard.')}
        {list('Non faites', data.notDone.map((m) => `${m.siteName} à ${m.startTime} · ${m.agents.join(', ') || 'aucun agent'}`), 'Aucune.')}
        {list('Anomalies', data.anomalies.map((a) => `${a.siteName} · ${a.title}${a.status === 'NEW' ? ' (à traiter)' : ''}`), 'Aucune anomalie.')}
        {list('Absents', data.absences.map((a) => a.agentName), 'Personne.')}
      </div>
    </div>
  );
};
