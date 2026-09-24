import React from 'react';
import classNames from 'classnames';

type AvatarProps = {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md', className }) => {
  return (
    <span className={classNames('avatar', `avatar--${size}`, className)} title={name}>
      {src ? (
        <img src={src} alt="" className="avatar__img" />
      ) : (
        <span className="avatar__initials" aria-hidden="true">
          {initials(name) || '?'}
        </span>
      )}
    </span>
  );
};
