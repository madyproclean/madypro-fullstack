import React from 'react';
import classNames from 'classnames';

interface CardProps {
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, className, children }) => {
  return (
    <div className={classNames('card', className)}>
      {title && (
        <div className="card__header">
          <h2 className="card__title">{title}</h2>
        </div>
      )}
      <div className="card__body">{children}</div>
    </div>
  );
};