import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

type DropdownProps = {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
};

/** Popover léger (pas un Modal plein écran) — menu profil/notifications de la Topbar. */
export const Dropdown: React.FC<DropdownProps> = ({ trigger, children, align = 'right', className }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={classNames('dropdown', className)} ref={rootRef}>
      <button
        type="button"
        className="dropdown__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open && (
        <div className="dropdown__panel" style={{ [align]: 0 }} role="menu">
          {children}
        </div>
      )}
    </div>
  );
};

export const DropdownItem: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }
> = ({ icon, children, className, ...props }) => (
  <button type="button" className={classNames('dropdown__item', className)} role="menuitem" {...props}>
    {icon}
    {children}
  </button>
);

export const DropdownSeparator: React.FC = () => <div className="dropdown__separator" role="separator" />;
