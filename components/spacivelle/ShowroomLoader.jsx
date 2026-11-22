import React, { useEffect, useState } from 'react';

/**
 * What a visitor sees while the house opens -- instead of an empty sky.
 *
 * A room photograph (69 KB on a phone, shown before anything 3D has
 * arrived), the brand, what is happening and a reason to wait: tips that say
 * what they are about to be able to do. It covers the 3D only until the
 * HOUSE is ready (about 1.2 MB); the furniture then arrives into a house the
 * visitor can already look round, with a small counter in the corner.
 *
 * @param {object} props
 * @param {'house'|'furniture'|'ready'} props.phase
 * @param {number} props.done   furniture models arrived
 * @param {number} props.total  furniture models expected
 * @param {string|null} props.failed  what went wrong, if it did
 */

const TIPS = [
  'Every piece in this house is for sale from a shop near you.',
  'Tap any sofa, tile or paint to see its price and who sells it.',
  'Take the guided tour — shops talk you through their products.',
  'Walk it yourself with the arrows, room by room, at true size.',
];

const ShowroomLoader = ({ phase, done = 0, total = 0, failed = null }) => {
  const [tip, setTip] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (phase !== 'house') return undefined;
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 3200);
    return () => clearInterval(id);
  }, [phase]);

  // Fade, then leave the DOM: an invisible overlay must not eat taps.
  useEffect(() => {
    if (phase === 'house' || failed) { setGone(false); return undefined; }
    const id = setTimeout(() => setGone(true), 700);
    return () => clearTimeout(id);
  }, [phase, failed]);

  const furnitureLeft = phase === 'furniture' && total > 0 && done < total;

  return (
    <>
      {!gone && (
        <div className={`showroom-loader${phase !== 'house' && !failed ? ' leaving' : ''}`} role="status" aria-live="polite">
          <picture>
            <source
              type="image/webp"
              srcSet="/images/landing/living-room-720.webp 720w, /images/landing/living-room-1440.webp 1440w"
              sizes="100vw"
            />
            <img className="showroom-loader-photo" src="/images/landing/living-room-720.webp" alt="" />
          </picture>
          <div className="showroom-loader-panel">
            <div className="showroom-loader-brand">Spacivelle <span>3D</span></div>
            {failed ? (
              <>
                <p className="showroom-loader-title">The house could not be opened.</p>
                <p className="showroom-loader-tip">{failed}</p>
                <button type="button" className="showroom-loader-retry" onClick={() => window.location.reload()}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <p className="showroom-loader-title">Opening the house…</p>
                <div className="showroom-loader-bar" aria-hidden><div /></div>
                <p className="showroom-loader-tip" key={tip}>{TIPS[tip]}</p>
              </>
            )}
          </div>
        </div>
      )}

      {furnitureLeft && (
        <div className="showroom-furniture-pill" role="status" aria-live="polite">
          <span className="showroom-furniture-dot" aria-hidden />
          Bringing in the furniture · {done} of {total}
        </div>
      )}
    </>
  );
};

export default ShowroomLoader;
