import React, { useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { getRouteOptimization } from '../../services/api/interventions.api';
import { RouteOptimizationResult } from '../../types/intervention';
import { Button } from '../ui/Button';

type RouteOptimizationPanelProps = {
  agentOptions: { id: string; name: string }[];
  title?: string;
};

export const RouteOptimizationPanel: React.FC<RouteOptimizationPanelProps> = ({
  agentOptions,
  title = 'Optimisation de tournée',
}) => {
  const { token, notify } = useAuthContext();
  const [routeAgentId, setRouteAgentId] = useState('');
  const [routeDate, setRouteDate] = useState(new Date().toISOString().slice(0, 10));
  const [route, setRoute] = useState<RouteOptimizationResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const fetchRoute = async () => {
    if (!token || !routeAgentId || !routeDate) return;
    setRouteLoading(true);
    try {
      const result = await getRouteOptimization(token, routeAgentId, routeDate);
      setRoute(result);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Optimisation impossible', 'error');
    } finally {
      setRouteLoading(false);
    }
  };

  return (
    <div className="panel" style={{ marginBottom: '1rem' }}>
      <h3>{title}</h3>
      <div className="filter-grid">
        <label className="filter-field filter-card">
          Agent
          <select value={routeAgentId} onChange={(e) => setRouteAgentId(e.target.value)}>
            <option value="">Sélectionner</option>
            {agentOptions.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field filter-card">
          Date
          <input type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} />
        </label>
        <div className="filter-card" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Button type="button" onClick={fetchRoute} disabled={!routeAgentId || routeLoading}>
            {routeLoading ? 'Calcul...' : 'Optimiser'}
          </Button>
        </div>
      </div>
      {route && (
        <div style={{ marginTop: '0.75rem' }}>
          <p className="card__meta">
            Distance totale estimée : {(route.totalDistanceMeters / 1000).toFixed(1)} km
          </p>
          {route.stops.length === 0 ? (
            <p>Aucune intervention géolocalisée ce jour-là.</p>
          ) : (
            <ol className="list-line">
              {route.stops.map((stop) => (
                <li key={stop.interventionId}>
                  <span>{stop.startTime}</span>
                  <span>{stop.siteName}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
};
