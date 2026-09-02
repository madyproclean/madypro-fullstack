import React, { useState } from 'react';

type ImageSliderProps = {
  images: string[];
};

export const ImageSlider: React.FC<ImageSliderProps> = ({ images }) => {
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const prev = () => setIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const next = () => setIndex((i) => (i === images.length - 1 ? 0 : i + 1));
  return (
    <div className="slider">
      <div className="slider__viewport">
        <img src={images[index]} alt={`photo-${index + 1}`} />
      </div>
      {images.length > 1 && (
        <div className="slider__controls">
          <button type="button" onClick={prev} aria-label="Précédent">
            ◀
          </button>
          <span>
            {index + 1} / {images.length}
          </span>
          <button type="button" onClick={next} aria-label="Suivant">
            ▶
          </button>
        </div>
      )}
    </div>
  );
};
