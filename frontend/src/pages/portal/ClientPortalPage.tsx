import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../services/api/client';

type Portal = {
  site: { id: string; name: string; address: string };
  recentInterventions: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    prestation: string | null;
    agents: string[];
    arrivedAt: string | null;
    leftAt: string | null;
  }[];
  upcoming: { date: string; startTime: string; endTime: string; prestation: string | null }[];
  inspections: { date: string; score: number }[];
  reportMonths: string[];
};

const STATUS: Record<string, string> = {
  PLANNED: 'Prévu',
  IN_PROGRESS: 'En cours',
  NEEDS_REVIEW: 'Réalisé',
  COMPLETED: 'Réalisé',
  CANCELLED: 'Annulé',
  NO_SHOW: 'Non réalisé',
};
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabel = (m: string) => {
  const label = new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** Espace client en lecture seule, ouvert par un lien personnel propre à un site. */
export const ClientPortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = API_BASE_URL.replace(/\/$/, '');

  useEffect(() => {
    if (!token) return;
    fetch(`${base}/public-api/portal/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Ce lien n’est plus valide.' : 'Espace indisponible pour le moment.');
        setData(await res.json());
      })
      .catch((err) => setError(err.message));
  }, [token, base]);

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px', fontFamily: 'inherit' }}>
      <header style={{ marginBottom: 24 }}>
        <p className="card__meta" style={{ margin: 0 }}>Mady Proclean · espace client</p>
        <h1 style={{ margin: '4px 0' }}>{data?.site.name ?? 'Votre site'}</h1>
        {data && <p className="card__meta" style={{ margin: 0 }}>{data.site.address}</p>}
      </header>
      {error && <div className="panel"><p>{error}</p></div>}
      {!data && !error && <p className="card__meta">Chargement…</p>}
      {data && (
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="panel">
            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Prochains passages</h2>
            {data.upcoming.length === 0 ? (
              <p className="card__meta">Aucun passage prévu dans les 14 prochains jours.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {data.upcoming.slice(0, 14).map((u, i) => (
                  <li key={i}>
                    {day(u.date)} · {u.startTime}–{u.endTime}
                    {u.prestation ? ` · ${u.prestation}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Passages récents</h2>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Prévu</th>
                    <th>Arrivée / départ</th>
                    <th>Intervenants</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentInterventions.map((i) => (
                    <tr key={i.id}>
                      <td>{day(i.date)}</td>
                      <td>
                        {i.startTime}–{i.endTime}
                        {i.prestation ? ` · ${i.prestation}` : ''}
                      </td>
                      <td>{i.arrivedAt ? `${i.arrivedAt} – ${i.leftAt ?? '…'}` : '—'}</td>
                      <td>{i.agents.join(', ') || '—'}</td>
                      <td>{i.status === 'PLANNED' && i.date.slice(0, 10) < today ? 'Non réalisé' : STATUS[i.status] ?? i.status}</td>
                    </tr>
                  ))}
                  {!data.recentInterventions.length && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                        Aucun passage récent.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Contrôles qualité</h2>
            {data.inspections.length === 0 ? (
              <p className="card__meta">Aucun contrôle publié pour l’instant.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {data.inspections.map((q, i) => (
                  <li key={i}>
                    {new Date(q.date).toLocaleDateString('fr-FR')} : {q.score} / 100
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Comptes rendus mensuels</h2>
            <div className="chips">
              {data.reportMonths.map((m) => (
                <a
                  key={m}
                  className="chip"
                  href={`${base}/public-api/portal/${encodeURIComponent(token ?? '')}/report.pdf?month=${m}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {monthLabel(m)} (PDF)
                </a>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
