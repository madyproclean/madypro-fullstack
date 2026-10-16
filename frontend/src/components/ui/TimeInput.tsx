import React from 'react';
import { FormField } from './FormField';

type TimeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string;
  helperText?: string;
  error?: string;
};

export const TimeInput: React.FC<TimeInputProps> = ({ label, helperText, error, id, required, ...props }) => {
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <FormField label={label} htmlFor={id} required={required} error={error} helperText={helperText}>
      <input
        type="time"
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
      />
    </FormField>
  );
};
