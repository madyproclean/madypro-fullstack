import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { getQualityOverview, QualityOverview } from '../../services/api/supervision.api';
import { Badge } from '../ui/Badge';

/** Notes des contrôles qualité par site sur 90 jours, les sites les plus faibles en premier. */
export const QualityOverviewPanel: React.FC = () => {
  const { token } = useAuthContext();
  const [data, setData] = useState<QualityOverview | null>(null);

  useEffect(() => {
    if (!token) return;
    getQualityOverview(token).then(setData).catch(() => setData(null));
  }, [token]);

  if (!data) return null;
  return (
    <div className="panel" style={{ marginTop: '1rem' }} aria-label="contrôles qualité">
      <h3 style={{ marginTop: 0 }}>Contrôles qualité (90 jours)</h3>
      {data.sites.length === 0 ? (
        <p className="card__meta">
          Aucun contrôle enregistré. Les superviseurs notent les sites depuis la tablette ou la fiche site (onglet « Suivi &
          contrôles »).
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Note moyenne</th>
                <th>Dernier contrôle</th>
                <th>Contrôles</th>
              </tr>
            </thead>
            <tbody>
              {data.sites.map((s) => (
                <tr key={s.siteId}>
                  <td>{s.siteName}</td>
                  <td>
                    <Badge tone={s.average >= 80 ? 'success' : s.average >= 60 ? 'warning' : 'danger'}>{s.average} / 100</Badge>
                  </td>
                  <td>
                    {s.lastScore} / 100 · {new Date(s.lastAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td>{s.inspections}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
