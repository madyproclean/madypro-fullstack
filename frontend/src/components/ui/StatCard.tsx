import React from 'react';
import classNames from 'classnames';
import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export type StatCardBadgeTone = 'orange' | 'blue' | 'yellow' | 'green' | 'red';

type StatCardTrend = {
  direction: 'up' | 'down';
  percent: number;
  /** ex. "vs mois dernier" */
  period?: string;
};

type StatCardProps = {
  icon: LucideIcon;
  badgeTone?: StatCardBadgeTone;
  value: React.ReactNode;
  label: string;
  trend?: StatCardTrend;
  className?: string;
};

export const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  badgeTone = 'blue',
  value,
  label,
  trend,
  className,
}) => {
  return (
    <div className={classNames('stat-card', className)}>
      <span className={`stat-card__badge stat-card__badge--${badgeTone}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="stat-card__body">
        <span className="stat-card__value">{value}</span>
        <span className="stat-card__label">{label}</span>
      </div>
      {trend && (
        <span className={`stat-card__trend stat-card__trend--${trend.direction}`}>
          {trend.direction === 'up' ? (
            <ArrowUpRight size={14} aria-hidden="true" />
          ) : (
            <ArrowDownRight size={14} aria-hidden="true" />
          )}
          {trend.percent}%{trend.period ? ` ${trend.period}` : ''}
        </span>
      )}
    </div>
  );
};
