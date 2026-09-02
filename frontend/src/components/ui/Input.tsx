import React from 'react';
import { FormField } from './FormField';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
  error?: string;
};

export const Input: React.FC<InputProps> = ({ label, helperText, error, id, required, ...props }) => {
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <FormField label={label} htmlFor={id} required={required} error={error} helperText={helperText}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
      />
    </FormField>
  );
};
