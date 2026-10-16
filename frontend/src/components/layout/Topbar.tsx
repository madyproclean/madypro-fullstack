import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Search, Settings } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { Dropdown, DropdownItem, DropdownSeparator } from '../ui/Dropdown';

type TopbarProps = {
  onMenuToggle?: () => void;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  SUPERVISOR: 'Superviseur',
  AGENT: 'Agent',
};

// Titre dépendant de la route — le plus long préfixe correspondant l'emporte
// (ex. "/settings/security" matche "/settings" à défaut d'entrée dédiée).
const ROUTE_TITLES: [string, string][] = [
  ['/dashboard', 'Suivi temps réel des équipes Madypro Clean'],
  ['/sites', 'Sites clients'],
  ['/equipe', 'Équipes'],
  ['/users', 'Équipes'],
  ['/interventions', 'Interventions'],
  ['/approvals', 'Demandes de validation'],
  ['/supervision/carte', 'Présence & carte temps réel'],
  ['/supervision/dashboard', 'Suivi temps réel des équipes Madypro Clean'],
  ['/supervision/sites', 'Mes sites'],
  ['/supervision/equipe', 'Mon équipe'],
  ['/supervision/presence', 'Présence & carte temps réel'],
  ['/supervision/planning', 'Planning équipes'],
  ['/supervision/interventions', 'Interventions'],
  ['/supervision/absences', 'Absences'],
  ['/supervision/rapports', 'Rapports'],
  ['/attendance', 'Pointages'],
  ['/absences', 'Absences'],
  ['/notifications', 'Notifications'],
  ['/reports', 'Rapports'],
  ['/devis', 'Devis & facturation'],
  ['/factures', 'Devis & facturation'],
  ['/formulaires', 'Formulaires'],
  ['/settings', 'Paramètres'],
  ['/audit', 'Audit'],
];

const titleForPath = (pathname: string) => {
  const match = ROUTE_TITLES.filter(([prefix]) => pathname.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  return match?.[1] ?? 'Suivi temps réel des équipes Madypro Clean';
};

export const Topbar: React.FC<TopbarProps> = ({ onMenuToggle }) => {
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="topbar">
      <div className="topbar__headline">
        <button
          type="button"
          className="topbar__menu-button"
          onClick={onMenuToggle}
          aria-label="Ouvrir la navigation"
        >
          <span />
          <span />
          <span />
        </button>
        <div>
          <p className="topbar__eyebrow">Cockpit propreté</p>
          <h1 className="topbar__title">{titleForPath(location.pathname)}</h1>
        </div>
      </div>
      <div className="topbar__actions">
        <form
          className="topbar__search"
          role="search"
          onSubmit={(event) => {
            // Recherche globale : pas encore branchée à une API dédiée
            // (chaque page a son propre filtre local pour l'instant) —
            // suivi backend à prévoir pour une recherche cross-entités.
            event.preventDefault();
          }}
        >
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="Rechercher..." aria-label="Recherche" />
        </form>

        <button
          type="button"
          className="topbar__icon-btn"
          aria-label="Notifications"
          onClick={() => navigate('/notifications')}
        >
          <Bell size={18} aria-hidden="true" />
        </button>

        <Dropdown
          trigger={
            <div className="topbar__profile">
              <Avatar name={user?.name ?? '?'} size="sm" />
              <div className="topbar__profile-text">
                <span>{user?.name}</span>
                <small>{user?.role ? ROLE_LABELS[user.role.toUpperCase()] ?? user.role : ''}</small>
              </div>
            </div>
          }
        >
          <DropdownItem icon={<Settings size={16} aria-hidden="true" />} onClick={() => navigate('/settings')}>
            Paramètres
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem icon={<LogOut size={16} aria-hidden="true" />} onClick={handleLogout}>
            Déconnexion
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
};
