import React, { useId } from 'react';

type RadioProps = {
  id?: string;
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: React.ReactNode;
  disabled?: boolean;
};

export const Radio: React.FC<RadioProps> = ({ id, name, value, checked, onChange, label, disabled }) => {
  const reactId = useId();
  const inputId = id ?? reactId;
  return (
    <label htmlFor={inputId} className={`ui-radio ${disabled ? 'ui-radio--disabled' : ''}`.trim()}>
      <input
        type="radio"
        id={inputId}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span className="ui-radio__control" aria-hidden="true" />
      <span className="ui-radio__label">{label}</span>
    </label>
  );
};
