import React from 'react';

export const FilterBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="filter-grid" role="search">
    {children}
  </div>
);

type FilterFieldProps = {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
};

/**
 * Unifie le wrapper répété dans ~9 pages (`<label className="filter-field filter-card">`)
 * autour des champs de filtre existants — les contrôles restent des <input>/<select>
 * natifs compacts, volontairement distincts des composants de formulaire complets.
 */
export const FilterField: React.FC<FilterFieldProps> = ({ label, children, wide }) => (
  <label className={`filter-field filter-card ${wide ? 'filter-card--wide' : ''}`.trim()}>
    {label}
    {children}
  </label>
);
