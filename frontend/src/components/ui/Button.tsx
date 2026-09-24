import React from 'react';
import { LucideIcon } from 'lucide-react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
};

export const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  loading = false,
  disabled,
  icon: Icon,
  iconPosition = 'left',
  ...props
}) => {
  const iconEl = Icon && !loading ? <Icon size={16} className="btn__icon" aria-hidden="true" /> : null;
  return (
    <button
      className={`btn btn--${variant} ${loading ? 'btn--loading' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      {iconEl && iconPosition === 'left' && iconEl}
      {children}
      {iconEl && iconPosition === 'right' && iconEl}
    </button>
  );
};
