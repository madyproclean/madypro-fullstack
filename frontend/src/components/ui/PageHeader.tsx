import React from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

/**
 * En-tête de page GXON : titre + sous-titre à gauche, action(s) à droite —
 * remplace l'ancien bandeau .page-hero (encart crème/sauge avec pastille
 * "pill"), absent de la référence.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="page-top">
    <div className="page-top__text">
      <h2>{title}</h2>
      {subtitle && <p className="page-top__subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="page-top__actions">{actions}</div>}
  </div>
);
