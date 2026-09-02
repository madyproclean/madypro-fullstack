import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { Availability } from '../../types/team';
import { listAvailability } from '../../services/api/team.api';

const formatDate = (value: Date) => value.toISOString().slice(0, 10);
const today = new Date();

export const AvailabilityPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [items, setItems] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(formatDate(today));
  const [to, setTo] = useState(formatDate(new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)));

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    listAvailability(token, from, to)
      .then(setItems)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger', 'error'))
      .finally(() => setLoading(false));
  }, [token, from, to]);

  return (
    <div>
      <div className="page-header">
        <span className="pill">Équipes</span>
        <h2>Disponibilités déclarées</h2>
        <p>Vue consolidée des disponibilités et indisponibilités déclarées par les agents.</p>
      </div>

      <div className="filter-grid" role="search">
        <label className="filter-field filter-card">
          Du
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="filter-field filter-card">
          Au
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>

      <section className="panel">
        {loading ? (
          <p>Chargement...</p>
        ) : items.length === 0 ? (
          <p className="card__meta">Aucune disponibilité déclarée sur cette période.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="disponibilités">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.user ? `${item.user.firstName} ${item.user.lastName}` : item.userId}
                    </td>
                    <td>{item.date.slice(0, 10)}</td>
                    <td>{item.type === 'AVAILABLE' ? 'Disponible' : 'Indisponible'}</td>
                    <td>{item.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
