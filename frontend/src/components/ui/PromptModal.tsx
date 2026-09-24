import React, { useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody } from './Modal';
import { Textarea } from './Textarea';
import { DateInput } from './DateInput';
import { Button } from './Button';

type PromptModalProps = {
  open: boolean;
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  confirmLabel?: string;
  type?: 'text' | 'date';
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

/**
 * Remplace window.prompt() (raisons d'annulation, commentaires, nouvelle
 * date) par un vrai champ de formulaire modal — validation et multi-ligne
 * possibles, cohérent avec le reste de l'interface.
 */
export const PromptModal: React.FC<PromptModalProps> = ({
  open,
  title,
  label,
  defaultValue = '',
  placeholder,
  required,
  confirmLabel = 'Confirmer',
  type = 'text',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} maxWidth={480} labelledBy="prompt-modal-title">
      <ModalHeader title={title} titleId="prompt-modal-title" onClose={onCancel} />
      <ModalBody>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (required && !value.trim()) return;
            onConfirm(value);
          }}
          style={{ display: 'grid', gap: '1rem' }}
        >
          {type === 'date' ? (
            <DateInput label={label} value={value} onChange={(e) => setValue(e.target.value)} required={required} autoFocus />
          ) : (
            <Textarea label={label} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} required={required} autoFocus />
          )}
          <div className="form-actions">
            <Button type="submit">{confirmLabel}</Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
};
