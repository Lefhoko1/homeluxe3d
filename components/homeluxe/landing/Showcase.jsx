import React, { useEffect, useState } from 'react';

import { fetchSceneCatalog } from '../../../lib/catalog/repository';
import { arrange } from './showcaseData';

/**
 * Who is in the house.
 *
 * THIS USED TO BE A TURNTABLE. One product on a stand against a blank ground,
 * spinning -- which is a product shot, the exact thing this business exists
 * to be an alternative to. The house does that argument for us now, in the
 * hero, from inside a room. What is left here is the part a turntable could
 * never say: WHO has taken space in the building, and how much.
 *
 * THE COUNTS ARE THE ADVERTISEMENT. "Bradlows · 5 pieces in 1 room" is more
 * persuasive to a shop reading this page than any adjective, and it costs
 * nothing to be true. They are read from the published catalogue, so they
 * cannot drift from what a visitor finds when they walk in.
 *
 * A SHOP WITH NOTHING TO STAND ON A FLOOR STILL APPEARS. Tubod sells paint,
 * tile and coatings -- they dress whole rooms rather than stand in them, so
 * they place no object at all. Listing only shops with furniture would
 * misrepresent who is actually in the building, and would quietly tell every
 * surface supplier in Gaborone that this platform is not for them.
 */
const Showcase = () => {
  const [catalogue, setCatalogue] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetchSceneCatalog({ scene: '3bed' })
      .then((manifest) => {
        if (!cancelled) setCatalogue(arrange(manifest));
      })
      .catch((err) => {
        if (!cancelled) setFailed(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <section className="lp-section" id="showcase">
        <div className="lp-section-head">
          <p className="luxe-eyebrow">Who is in the house</p>
          <h2 className="lp-h2">The catalogue is not answering.</h2>
          <p className="lp-sub">
            This section lists the shops actually advertising in the house, and
            that could not be read: {failed}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="lp-section lp-section-tint" id="showcase">
      <div className="lp-section-head">
        <p className="luxe-eyebrow">Who is in the house</p>
        <h2 className="lp-h2">Real shops, in real rooms.</h2>
        <p className="lp-sub">
          Every piece and every finish below is standing in the house right
          now. Click one to walk straight to it.
        </p>
      </div>

      <div className="lp-shop-cards">
        {(catalogue?.shops ?? []).map((shop) => (
          <article key={shop.id} className="lp-shop-card">
            <header className="lp-shop-head">
              {shop.logoUrl ? (
                <img className="lp-shop-logo" src={shop.logoUrl} alt="" />
              ) : (
                <span className="lp-shop-initial" aria-hidden="true">
                  {shop.name.charAt(0)}
                </span>
              )}
              <div>
                <strong>{shop.name}</strong>
                <span className="lp-shop-count">
                  {[
                    shop.objects && `${shop.objects} piece${shop.objects === 1 ? '' : 's'}`,
                    shop.finishes &&
                      `${shop.finishes} finish${shop.finishes === 1 ? '' : 'es'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {shop.rooms.length > 0 &&
                    ` in ${shop.rooms.length} room${shop.rooms.length === 1 ? '' : 's'}`}
                </span>
              </div>
            </header>

            {shop.products.length > 0 ? (
              <ul className="lp-shop-chips">
                {shop.products.map((product) => (
                  <li key={product.id}>
                    {/* Straight to that thing in the house. The showroom reads
                        the id off the query string and flies to it -- the same
                        link the notification emails send. */}
                    <a
                      className="lp-chip"
                      href={`/showroom?product=${encodeURIComponent(product.id)}`}
                    >
                      {product.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lp-shop-note">
                Surfaces rather than furniture — paint, tile and coatings, seen
                on the walls and floors of the rooms themselves.
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};

export default Showcase;
