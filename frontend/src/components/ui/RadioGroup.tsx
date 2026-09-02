import React, { useId } from 'react';
import { Radio } from './Radio';

type RadioGroupOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type RadioGroupProps = {
  name: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioGroupOption[];
  error?: string;
  helperText?: string;
  required?: boolean;
  direction?: 'row' | 'column';
};

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  label,
  value,
  onChange,
  options,
  error,
  helperText,
  required,
  direction = 'row',
}) => {
  const groupId = useId();
  const labelId = label ? `${groupId}-label` : undefined;
  const errorId = error ? `${groupId}-error` : undefined;
  return (
    <div
      className={`form-field ${error ? 'form-field--invalid' : ''}`.trim()}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={errorId}
      aria-required={required}
    >
      {label && (
        <span id={labelId}>
          {label}
          {required && <em className="form-field__required">*</em>}
        </span>
      )}
      <div className={`ui-radio-group ui-radio-group--${direction}`}>
        {options.map((option) => (
          <Radio
            key={option.value}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={onChange}
            label={option.label}
            disabled={option.disabled}
          />
        ))}
      </div>
      {error ? (
        <small id={errorId} className="form-field__error" role="alert">
          {error}
        </small>
      ) : helperText ? (
        <small>{helperText}</small>
      ) : null}
    </div>
  );
};
