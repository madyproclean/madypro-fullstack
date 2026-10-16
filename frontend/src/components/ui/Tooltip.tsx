import React from 'react';
import classNames from 'classnames';

type TooltipProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

export const Tooltip: React.FC<TooltipProps> = ({ label, children, className }) => (
  <span className={classNames('tooltip', className)}>
    {children}
    <span className="tooltip__bubble" role="tooltip">
      {label}
    </span>
  </span>
);
