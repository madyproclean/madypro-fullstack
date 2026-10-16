import React from 'react';
import { FormField } from './FormField';

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string;
  helperText?: string;
  error?: string;
};

export const DateInput: React.FC<DateInputProps> = ({ label, helperText, error, id, required, ...props }) => {
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <FormField label={label} htmlFor={id} required={required} error={error} helperText={helperText}>
      <input
        type="date"
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
      />
    </FormField>
  );
};
