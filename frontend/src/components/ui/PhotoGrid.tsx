import React, { useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Modal, ModalHeader, ModalBody } from './Modal';

type PhotoGridProps = {
  images: string[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  /** Nombre maximum de photos ; la tuile d'ajout disparaît une fois atteint. */
  maxItems?: number;
  addLabel?: string;
};

/**
 * Grille de photos réutilisable : miniatures avec bouton de suppression au survol,
 * tuile d'ajout à la fin, et agrandissement en lightbox au clic — même comportement
 * partout dans l'app où des photos sont prises/uploadées (interventions, sites, ...).
 */
export const PhotoGrid: React.FC<PhotoGridProps> = ({ images, onAdd, onRemove, disabled, maxItems, addLabel }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const canAddMore = !disabled && (maxItems === undefined || images.length < maxItems);

  return (
    <>
      <div className="photo-grid">
        {images.map((src, index) => (
          <div className="photo-grid__item" key={`${index}-${src.slice(-24)}`}>
            <img src={src} alt={`Photo ${index + 1}`} onClick={() => setLightboxSrc(src)} />
            {!disabled && (
              <button
                type="button"
                className="photo-grid__remove"
                aria-label="Supprimer la photo"
                onClick={() => onRemove(index)}
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        {canAddMore && (
          <button
            type="button"
            className="photo-grid__add"
            aria-label={addLabel ?? 'Ajouter une photo'}
            title={addLabel ?? 'Ajouter une photo'}
            onClick={() => inputRef.current?.click()}
          >
            <Plus size={22} />
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) onAdd(e.target.files);
                e.target.value = '';
              }}
            />
          </button>
        )}
      </div>

      <Modal open={Boolean(lightboxSrc)} onClose={() => setLightboxSrc(null)} maxWidth={640} labelledBy="photo-grid-lightbox-title">
        <ModalHeader eyebrow="Photo" title="Aperçu" titleId="photo-grid-lightbox-title" onClose={() => setLightboxSrc(null)} />
        <ModalBody>
          <div className="photo-grid__lightbox">{lightboxSrc && <img src={lightboxSrc} alt="Aperçu agrandi" />}</div>
        </ModalBody>
      </Modal>
    </>
  );
};
