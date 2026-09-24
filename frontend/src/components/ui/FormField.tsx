import React from 'react';

export type FormFieldProps = {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  className?: string;
  children: React.ReactNode;
  as?: 'label' | 'div';
};

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  required,
  error,
  helperText,
  className = '',
  children,
  as = 'label',
}) => {
  const Tag = as;
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <Tag
      className={`form-field ${error ? 'form-field--invalid' : ''} ${className}`.trim()}
      {...(as === 'label' ? { htmlFor } : {})}
    >
      {label && (
        <span>
          {label}
          {required && <em className="form-field__required">*</em>}
        </span>
      )}
      {children}
      {error ? (
        <small id={errorId} className="form-field__error" role="alert">
          {error}
        </small>
      ) : helperText ? (
        <small>{helperText}</small>
      ) : null}
    </Tag>
  );
};
