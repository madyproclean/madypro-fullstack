import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number | string;
  labelledBy?: string;
};

/**
 * Remplace les ~10 overlays `position: fixed` copiés-collés à la main dans
 * les pages (Absences, Attendance, Gabarits, Interventions, Users, Sites, ...).
 */
export const Modal: React.FC<ModalProps> = ({ open, onClose, children, maxWidth = 900, labelledBy }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="ui-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="ui-modal-card"
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={cardRef}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

export const ModalHeader: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  titleId?: string;
  onClose?: () => void;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, titleId, onClose, actions }) => (
  <div className="ui-modal-header">
    <div>
      {eyebrow && <span className="pill">{eyebrow}</span>}
      <h3 id={titleId}>{title}</h3>
    </div>
    <div className="ui-modal-header__actions">
      {actions}
      {onClose && (
        <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Fermer">
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  </div>
);

export const ModalBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ui-modal-body">{children}</div>
);

export const ModalFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ui-modal-footer">{children}</div>
);
