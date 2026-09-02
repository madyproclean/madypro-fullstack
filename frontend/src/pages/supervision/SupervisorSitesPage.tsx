import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { listSites } from '../../services/api/sites.api';
import { Site } from '../../types/site';
import { Button } from '../../components/ui/Button';
import { Eye } from 'lucide-react';

export const SupervisorSitesPage: React.FC = () => {
  const { token, user, notify } = useAuthContext();
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    listSites(token, { pageSize: 200 })
      .then((res) => setSites(res.items))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les sites';
        notify(message, 'error');
      })
      .finally(() => setLoading(false));
  }, [token, notify]);

  const supervisedSites = useMemo(() => {
    if (!user || user.role?.toUpperCase() !== 'SUPERVISOR') return sites;
    return sites.filter((site) => site.supervisorIds?.includes(user.id));
  }, [sites, user]);

  return (
    <div className="page">
      <div className="page-header">
        <span className="pill">Supervision</span>
        <h2>Mes sites</h2>
        <p>Liste des sites dont vous êtes responsable, avec accès direct à la présence temps réel.</p>
      </div>
      <div className="panel">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="sites supervisés">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Adresse</th>
                  <th>Superviseurs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {supervisedSites.map((site) => (
                  <tr key={site.id}>
                    <td>{site.name}</td>
                    <td>{site.address}</td>
                    <td>{site.supervisors?.map((s) => s.name).join(', ') || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <Link to={`/supervision/sites/${site.id}`} className="btn btn--ghost btn--compact">
                          Fiche complète
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={Eye}
                          onClick={() => navigate('/supervision/presence')}
                        >
                          Présence
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {supervisedSites.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      Aucun site supervisé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
