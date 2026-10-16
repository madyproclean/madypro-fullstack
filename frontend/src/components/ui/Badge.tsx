import React from 'react';
import classNames from 'classnames';
import { LucideIcon } from 'lucide-react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

type BadgeProps = {
  tone?: BadgeTone;
  icon?: LucideIcon;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
};

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', icon: Icon, pulse, className, children }) => {
  return (
    <span className={classNames('badge', `badge--${tone}`, { 'status-pulse': pulse }, className)}>
      {Icon && <Icon size={13} className="badge__icon" aria-hidden="true" />}
      {children}
    </span>
  );
};
