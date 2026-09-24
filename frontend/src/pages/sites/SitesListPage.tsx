import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { DonutChartCard } from '../../components/charts/DonutChartCard';
import { SitesTable } from './SitesTable';
import { MapPin, MapPinOff, Plus } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { listSites } from '../../services/api/sites.api';

export const SitesListPage: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useAuthContext();
  const [counts, setCounts] = useState({ active: 0, inactive: 0 });

  useEffect(() => {
    if (!token) return;
    Promise.all([
      listSites(token, { active: true, pageSize: 1 }),
      listSites(token, { active: false, pageSize: 1 }),
    ])
      .then(([activeRes, inactiveRes]) => setCounts({ active: activeRes.total, inactive: inactiveRes.total }))
      .catch(() => {});
  }, [token]);

  const total = counts.active + counts.inactive;
  const breakdown = useMemo(() => {
    if (total === 0) return [];
    return [
      { label: 'Actifs', value: Math.round((counts.active / total) * 100) },
      { label: 'Inactifs', value: Math.round((counts.inactive / total) * 100) },
    ].filter((entry) => entry.value > 0);
  }, [counts, total]);

  return (
    <div className="page-container sites-page" style={{ maxWidth: '100%', width: '100%' }}>
      <PageHeader
        title="Cartographie terrain"
        subtitle="Centralisez les implantations à nettoyer, les responsables locaux et les fenêtres horaires."
        actions={
          <Button type="button" icon={Plus} onClick={() => navigate('/sites/new')}>
            Créer un site
          </Button>
        }
      />

      <div className="page-grid" style={{ marginBottom: '1.5rem' }}>
        <StatCard icon={MapPin} badgeTone="green" value={counts.active} label="Sites actifs" />
        <StatCard icon={MapPinOff} badgeTone="red" value={counts.inactive} label="Sites inactifs" />
      </div>

      {breakdown.length > 0 && (
        <div style={{ maxWidth: 420, marginBottom: '1.5rem' }}>
          <DonutChartCard title="Répartition du portefeuille" data={breakdown} centerValue={total} centerLabel="sites" />
        </div>
      )}

      <SitesTable />
    </div>
  );
};
