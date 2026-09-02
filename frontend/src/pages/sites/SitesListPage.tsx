import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Site } from '../../types/site';
import { Button } from '../../components/ui/Button';
import { SitesTable } from './SitesTable';
import { Plus } from 'lucide-react';

export const SitesListPage: React.FC = () => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);

  const portfolio = useMemo(() => {
    const active = sites.filter((site) => site.active).length;
    const inactive = sites.length - active;
    return [
      { label: 'Sites actifs', value: `${String(active).padStart(2, '0')}` },
      { label: 'Sites inactifs', value: `${String(inactive).padStart(2, '0')}` },
    ];
  }, [sites]);

  return (
    <div className="page-container sites-page" style={{ maxWidth: '100%', width: '100%' }}>
      <div className="page-hero">
        <div className="page-hero__content">
          <span className="pill">Gestion des sites</span>
          <h2>Cartographie terrain</h2>
          <p>Centralisez les implantations à nettoyer, les responsables locaux et les fenêtres horaires.</p>
          <Button type="button" icon={Plus} onClick={() => navigate('/sites/new')}>
            Créer un site
          </Button>
        </div>
        <div className="page-hero__accent">
          <h3>Portefeuille</h3>
          <ul className="list-line">
            {portfolio.length === 0 && <li>Aucun site.</li>}
            {portfolio.map((item) => (
              <li key={item.label}>
                {item.label} <span>{item.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <SitesTable onLoaded={setSites} />
    </div>
  );
};
