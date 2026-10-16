import React from 'react';
import { LucideIcon } from 'lucide-react';

type ChipProps = {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  icon?: LucideIcon;
};

export const Chip: React.FC<ChipProps> = ({ selected, onClick, children, disabled, icon: Icon }) => (
  <button
    type="button"
    className={`chip ${selected ? 'chip--selected' : ''}`.trim()}
    aria-pressed={selected}
    disabled={disabled}
    onClick={onClick}
  >
    {Icon && <Icon size={13} className="chip__icon" aria-hidden="true" />}
    {children}
  </button>
);
