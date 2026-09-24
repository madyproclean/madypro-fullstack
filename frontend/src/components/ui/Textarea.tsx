import React from 'react';
import { FormField } from './FormField';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  helperText?: string;
  error?: string;
};

export const Textarea: React.FC<TextareaProps> = ({ label, helperText, error, id, required, ...props }) => {
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <FormField label={label} htmlFor={id} required={required} error={error} helperText={helperText}>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
      />
    </FormField>
  );
};
