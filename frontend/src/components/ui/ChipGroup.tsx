import React, { useId } from 'react';
import { LucideIcon } from 'lucide-react';
import { Chip } from './Chip';

type ChipOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  icon?: LucideIcon;
};

type ChipGroupCommonProps = {
  options: ChipOption[];
  label?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
};

type ChipGroupProps =
  | (ChipGroupCommonProps & { multiple: true; value: string[]; onChange: (value: string[]) => void })
  | (ChipGroupCommonProps & { multiple?: false; value: string; onChange: (value: string) => void });

/**
 * Formalise le pattern manuel `.includes(id) ? 'chip--selected' : ''`
 * dupliqué dans GabaritsPage/SiteFormPage/InterventionsPage/SitesListPage.
 */
export const ChipGroup: React.FC<ChipGroupProps> = (props) => {
  const { options, label, helperText, error, required } = props;
  const groupId = useId();
  const labelId = label ? `${groupId}-label` : undefined;
  const errorId = error ? `${groupId}-error` : undefined;

  const isSelected = (value: string) => (props.multiple ? props.value.includes(value) : props.value === value);

  const toggle = (value: string) => {
    if (props.multiple) {
      const next = props.value.includes(value) ? props.value.filter((v) => v !== value) : [...props.value, value];
      props.onChange(next);
    } else {
      props.onChange(value);
    }
  };

  return (
    <div
      className={`form-field ${error ? 'form-field--invalid' : ''}`.trim()}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={errorId}
    >
      {label && (
        <span id={labelId}>
          {label}
          {required && <em className="form-field__required">*</em>}
        </span>
      )}
      <div className="chips">
        {options.map((option) => (
          <Chip
            key={option.value}
            selected={isSelected(option.value)}
            onClick={() => toggle(option.value)}
            disabled={option.disabled}
            icon={option.icon}
          >
            {option.label}
          </Chip>
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
