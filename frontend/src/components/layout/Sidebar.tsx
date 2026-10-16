import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LucideIcon,
  LayoutDashboard,
  MapPin,
  Users,
  ClipboardList,
  ClipboardCheck,
  Radar,
  Clock,
  CalendarX,
  Bell,
  BarChart3,
  FileText,
  FileEdit,
  Settings,
  History,
  CalendarDays,
  ChevronDown,
  Inbox,
  TrendingUp,
} from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';

type NavItem =
  | { type: 'link'; to: string; label: string; icon: LucideIcon }
  | { type: 'group'; label: string; icon: LucideIcon; children: { to: string; label: string }[] };

type MenuSection = { label: string; items: NavItem[] };

const ADMIN_MENU: MenuSection[] = [
  {
    label: 'Opérations',
    items: [
      { type: 'link', to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { type: 'link', to: '/a-traiter', label: 'À traiter', icon: Inbox },
      { type: 'link', to: '/pilotage', label: 'Pilotage', icon: TrendingUp },
      { type: 'link', to: '/sites', label: 'Sites', icon: MapPin },
      { type: 'link', to: '/interventions', label: 'Interventions', icon: ClipboardList },
      { type: 'link', to: '/approvals', label: 'Demandes de validation', icon: ClipboardCheck },
      { type: 'link', to: '/supervision/carte', label: 'Présence & carte temps réel', icon: Radar },
      { type: 'link', to: '/attendance', label: 'Pointages', icon: Clock },
      { type: 'link', to: '/absences', label: 'Absences', icon: CalendarX },
    ],
  },
  {
    label: 'Équipe',
    items: [
      {
        type: 'group',
        label: 'Équipes',
        icon: Users,
        children: [
          { to: '/users', label: 'Liste' },
          { to: '/equipe/echanges', label: 'Échanges de shift' },
          { to: '/equipe/actualites', label: 'Fil d’actualité' },
          { to: '/equipe/badges', label: 'Badges' },
          { to: '/equipe/onboarding', label: 'Onboarding' },
          { to: '/equipe/disponibilites', label: 'Disponibilités' },
          { to: '/equipe/messages', label: 'Messages' },
        ],
      },
      { type: 'link', to: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Gestion',
    items: [
      { type: 'link', to: '/reports', label: 'Rapports', icon: BarChart3 },
      {
        type: 'group',
        label: 'Devis & facturation',
        icon: FileText,
        children: [
          { to: '/devis', label: 'Devis' },
          { to: '/factures', label: 'Factures' },
        ],
      },
      { type: 'link', to: '/formulaires', label: 'Formulaires', icon: FileEdit },
    ],
  },
  {
    label: 'Système',
    items: [
      {
        type: 'group',
        label: 'Paramètres',
        icon: Settings,
        children: [
          { to: '/settings', label: 'Général' },
          { to: '/settings/security', label: 'Sécurité' },
          { to: '/settings/webhooks', label: 'Webhooks' },
          { to: '/settings/api-keys', label: 'Clés API' },
          { to: '/settings/categories', label: 'Catégories d’intervention' },
        ],
      },
      {
        type: 'group',
        label: 'Audit',
        icon: History,
        children: [
          { to: '/audit', label: 'Journal d’audit' },
          { to: '/audit/login-history', label: 'Connexions' },
          { to: '/erreurs', label: 'Erreurs techniques' },
        ],
      },
    ],
  },
];

const SUPERVISOR_MENU: MenuSection[] = [
  {
    label: 'Opérations',
    items: [
      { type: 'link', to: '/supervision/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { type: 'link', to: '/supervision/sites', label: 'Mes sites', icon: MapPin },
      { type: 'link', to: '/supervision/equipe', label: 'Mon équipe', icon: Users },
      { type: 'link', to: '/supervision/presence', label: 'Présence & carte temps réel', icon: Radar },
      { type: 'link', to: '/supervision/planning', label: 'Planning équipes', icon: CalendarDays },
      { type: 'link', to: '/supervision/interventions', label: 'Interventions', icon: ClipboardList },
      { type: 'link', to: '/supervision/absences', label: 'Absences', icon: CalendarX },
    ],
  },
  {
    label: 'Suivi',
    items: [
      { type: 'link', to: '/supervision/pilotage', label: 'Pilotage', icon: TrendingUp },
      { type: 'link', to: '/supervision/rapports', label: 'Rapports', icon: BarChart3 },
    ],
  },
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { logout, user } = useAuthContext();
  const navigate = useNavigate();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const isSupervisor = user?.role?.toUpperCase() === 'SUPERVISOR';
  const menuSections = isSupervisor ? SUPERVISOR_MENU : ADMIN_MENU;

  const handleLogout = () => {
    logout();
    onClose();
    navigate('/login');
  };

  return (
    <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        <img src="/logo-full.png" alt="Madypro Clean" className="sidebar__logo" />
      </div>
      <nav className="sidebar__nav" onClick={() => onClose()}>
        {menuSections.map((section) => (
          <div key={section.label} className="sidebar__section">
            <p className="sidebar__section-label">{section.label}</p>
            {section.items.map((item) => {
              const Icon = item.icon;
              if (item.type === 'link') {
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                    }
                  >
                    <Icon size={16} className="sidebar__link-icon" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              }
              // group
              const isGroupOpen = openGroup === item.label;
              return (
                <div key={item.label}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`sidebar__link${isGroupOpen ? ' sidebar__link--active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenGroup((prev) => (prev === item.label ? null : item.label));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenGroup((prev) => (prev === item.label ? null : item.label));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <Icon size={16} className="sidebar__link-icon" aria-hidden="true" />
                    <span className="sidebar__link-label">{item.label}</span>
                    <ChevronDown
                      size={15}
                      className={`sidebar__chevron${isGroupOpen ? ' sidebar__chevron--open' : ''}`}
                      aria-hidden="true"
                    />
                  </div>
                  {isGroupOpen && (
                    <div className="sidebar__sublinks">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) =>
                            `sidebar__link sidebar__link--sub${isActive ? ' sidebar__link--active' : ''}`
                          }
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">
        <button type="button" className="btn btn--primary" onClick={handleLogout}>
          Déconnexion
        </button>
      </div>
    </aside>
  );
};
