import React, { useEffect, useState } from 'react';

import ModelSlide from './ModelSlide';

/**
 * The details card's picture: the product in 3D first, then its photographs,
 * one at a time -- the visitor moves through them with the arrows, the dots
 * or the strip of thumbnails (where the 3D model is the first tile).
 *
 * One card for everything about a product. The 3D slide is a copy of the
 * piece standing in the house (ModelSlide), so it is there only when the
 * piece is: a product picked from the list that is not placed anywhere shows
 * its photographs alone.
 *
 * @param {object} props
 * @param {THREE.Object3D|null} props.piece  the placed piece, if any
 * @param {string[]} props.images
 * @param {string}   props.name
 */
const ProductGallery = ({ piece = null, images = [], name = '' }) => {
  const slides = [...(piece ? [{ kind: '3d' }] : []), ...images.map((url) => ({ kind: 'photo', url }))];
  const [at, setAt] = useState(0);
  const [swipe, setSwipe] = useState(null);

  useEffect(() => { if (at >= slides.length) setAt(0); }, [at, slides.length]);
  if (!slides.length) return null;

  const go = (by) => setAt((i) => (i + by + slides.length) % slides.length);
  const slide = slides[Math.min(at, slides.length - 1)];

  // Swiping a PHOTO moves the gallery; on the 3D slide a drag turns the
  // piece instead (ModelSlide takes the pointer).
  const onPointerDown = (e) => { if (slide.kind === 'photo') setSwipe(e.clientX); };
  const onPointerUp = (e) => {
    if (swipe === null) return;
    const dx = e.clientX - swipe;
    setSwipe(null);
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  return (
    <div className="product-gallery">
      <div
        className="product-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setSwipe(null)}
        role="group"
        aria-roledescription="carousel"
        aria-label={`${name}: ${slides.length} views`}
      >
        {slide.kind === '3d'
          ? <ModelSlide object={piece} active />
          : <img className="product-hero" src={slide.url} alt={`${name}, photo ${at + (piece ? 0 : 1)}`} draggable={false} />}

        {slides.length > 1 && (
          <>
            <button type="button" className="product-stage-nav prev" onClick={() => go(-1)} aria-label="Previous view">‹</button>
            <button type="button" className="product-stage-nav next" onClick={() => go(1)} aria-label="Next view">›</button>
            <div className="product-dots" aria-hidden>
              {slides.map((s, i) => <span key={s.url ?? '3d'} className={i === at ? 'on' : ''} />)}
            </div>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <div className="product-thumbs" role="tablist" aria-label="Views">
          {slides.map((s, i) => (
            <button
              key={s.url ?? '3d'}
              type="button"
              role="tab"
              aria-selected={i === at}
              className={`product-thumb${i === at ? ' on' : ''}${s.kind === '3d' ? ' is-3d' : ''}`}
              onClick={() => setAt(i)}
              aria-label={s.kind === '3d' ? '3D model' : `Photo ${i + (piece ? 0 : 1)}`}
            >
              {s.kind === '3d' ? <span>3D</span> : <img src={s.url} alt="" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductGallery;
