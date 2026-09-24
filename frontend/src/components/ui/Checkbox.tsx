import React, { useId } from 'react';

type CheckboxProps = {
  id?: string;
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  helperText?: string;
  error?: string;
};

export const Checkbox: React.FC<CheckboxProps> = ({
  id,
  name,
  checked,
  onChange,
  label,
  disabled,
  helperText,
  error,
}) => {
  const reactId = useId();
  const inputId = id ?? reactId;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={`ui-checkbox-field ${error ? 'form-field--invalid' : ''}`.trim()}>
      <label htmlFor={inputId} className={`ui-checkbox ${disabled ? 'ui-checkbox--disabled' : ''}`.trim()}>
        <input
          type="checkbox"
          id={inputId}
          name={name}
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="ui-checkbox__control" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="11" height="11">
            <path d="M2 8.5l3.5 3.5L14 3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="ui-checkbox__label">{label}</span>
      </label>
      {error ? (
        <small id={errorId} className="form-field__error" role="alert">
          {error}
        </small>
      ) : helperText ? (
        <small className="ui-checkbox__helper">{helperText}</small>
      ) : null}
    </div>
  );
};
