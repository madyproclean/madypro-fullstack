import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { listLoginHistory, LoginHistoryPage as LoginHistoryPageType } from '../../services/api/auth.api';
import { formatDateTime } from '../../utils/datetime';

export const LoginHistoryPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [pageData, setPageData] = useState<LoginHistoryPageType>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    listLoginHistory(token, page, pageSize)
      .then(setPageData)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger le journal des connexions';
        notify(message, 'error');
      })
      .finally(() => setLoading(false));
  }, [token, page]);

  return (
    <div>
      <div className="page-header">
        <span className="pill">Audit</span>
        <h2>Journal des connexions</h2>
        <p>Qui s’est connecté, quand, et depuis où — distinct du journal d’audit métier.</p>
      </div>

      <section className="panel">
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="journal des connexions">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Email</th>
                  <th>Résultat</th>
                  <th>Raison</th>
                  <th>IP</th>
                  <th>Agent</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.createdAt)}</td>
                    <td>{event.email}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.6rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#fff',
                          background: event.success ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {event.success ? 'Succès' : 'Échec'}
                      </span>
                    </td>
                    <td>{event.reason ?? '—'}</td>
                    <td>{event.ip ?? '—'}</td>
                    <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {event.userAgent ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="pagination" style={{ marginTop: '1rem' }}>
        <button className="btn btn--ghost" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Précédent
        </button>
        <span className="card__meta">Page {page}</span>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => {
            const maxPage = Math.ceil(pageData.total / pageSize) || 1;
            setPage((p) => (p < maxPage ? p + 1 : p));
          }}
          disabled={page * pageSize >= pageData.total}
        >
          Suivant
        </button>
        <span className="card__meta">{pageData.total} résultats</span>
      </div>
    </div>
  );
};
