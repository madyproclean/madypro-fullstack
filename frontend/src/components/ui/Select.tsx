import React, { useEffect, useId, useRef, useState } from 'react';
import { FormField } from './FormField';

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  id?: string;
  name?: string;
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  helperText?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Combobox custom (bouton déclencheur + liste flottante) — remplace le rendu
 * natif du navigateur pour un contrôle visuel complet, tout en gardant la même
 * API que l'ancien <select> (options/value/onChange/label) pour rester un
 * remplacement direct partout où <Select> est déjà utilisé.
 */
export const Select: React.FC<SelectProps> = ({
  id,
  name,
  label,
  options,
  value,
  onChange,
  disabled,
  required,
  error,
  helperText,
  placeholder,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef('');
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const reactId = useId();
  const selectId = id ?? reactId;
  const errorId = error ? `${selectId}-error` : undefined;

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange?.({ target: { value: option.value, name } } as unknown as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          break;
        }
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((prev) => {
          const base = prev < 0 ? selectedIndex : prev;
          return Math.min(options.length - 1, Math.max(0, base + direction));
        });
        break;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) {
          commit(activeIndex);
        } else {
          setOpen(true);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (event.key.length === 1) {
          typeaheadRef.current += event.key.toLowerCase();
          clearTimeout(typeaheadTimerRef.current);
          typeaheadTimerRef.current = setTimeout(() => {
            typeaheadRef.current = '';
          }, 500);
          const match = options.findIndex((option) => option.label.toLowerCase().startsWith(typeaheadRef.current));
          if (match >= 0) {
            if (open) {
              setActiveIndex(match);
            } else {
              commit(match);
            }
          }
        }
    }
  };

  return (
    <FormField label={label} htmlFor={selectId} required={required} error={error} helperText={helperText} as="div">
      <div
        className={`ui-select ${open ? 'ui-select--open' : ''} ${disabled ? 'ui-select--disabled' : ''} ${className}`.trim()}
        ref={rootRef}
      >
        <button
          type="button"
          id={selectId}
          className="ui-select__trigger"
          onClick={() => !disabled && setOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        >
          <span className={selectedOption ? 'ui-select__value' : 'ui-select__placeholder'}>
            {selectedOption ? selectedOption.label : placeholder ?? 'Sélectionner…'}
          </span>
          <span className="ui-select__chevron" aria-hidden="true" />
        </button>
        {open && (
          <ul className="ui-select__listbox" role="listbox" ref={listRef} tabIndex={-1}>
            {options.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={[
                  'ui-select__option',
                  index === activeIndex && 'ui-select__option--active',
                  option.value === value && 'ui-select__option--selected',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormField>
  );
};
