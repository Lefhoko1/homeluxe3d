import React, { useEffect, useMemo, useState } from 'react';

import { fetchSceneCatalog } from '../../../lib/catalog/repository';
import ProductStage from './ProductStage';
import { arrange, money, opener } from './showcaseData';

/**
 * A little of the showroom, on the way to the showroom.
 *
 * THE FRONT PAGE ASKED FOR A LEAP OF FAITH. It described a house full of real
 * furniture at real scale and then offered a button; whether any of that was
 * true was on the other side of a 3D application somebody had not decided to
 * open yet. This is the proof, before the click: one real product from the
 * house, turning, and the shops it came from.
 *
 * EVERY WORD OF IT IS THE DATABASE. The names, the prices, the offers, the
 * millimetres and the rooms are read from the same published snapshot the
 * showroom reads -- `fetchSceneCatalog`, the identical call. Nothing here is
 * typed into the page. A front page that hardcodes "Sandton 3-Seater, P18,999"
 * is wrong the first afternoon a shop changes its price, and it is wrong
 * silently.
 *
 * IF IT CANNOT BE READ IT SAYS SO. There is no sample sofa to fall back on.
 * The whole section is a claim about live data, so a decorative stand-in
 * would be a lie told in exactly the place the honesty is the point.
 */

const Showcase = () => {
  const [catalogue, setCatalogue] = useState(null);
  const [failed, setFailed] = useState(null);
  const [pickedId, setPickedId] = useState(null);

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

  const picked = useMemo(() => {
    if (!catalogue) return null;

    return (
      catalogue.shown.find((c) => c.id === pickedId) ?? opener(catalogue.shown)
    );
  }, [catalogue, pickedId]);

  if (failed) {
    return (
      <section className="lp-section" id="showcase">
        <div className="lp-section-head">
          <p className="luxe-eyebrow">A look inside</p>
          <h2 className="lp-h2">The house is not answering.</h2>
          <p className="lp-sub">
            This section shows real products read from the catalogue, and the
            catalogue could not be read: {failed}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="lp-section lp-showcase" id="showcase">
      <div className="lp-section-head">
        <p className="luxe-eyebrow">A look inside</p>
        <h2 className="lp-h2">Turn it round before you walk in.</h2>
        <p className="lp-sub">
          This is the actual model standing in the house, not a photograph of
          one. Drag it, read the price, then open the door it lives behind.
        </p>
      </div>

      <div className="lp-showcase-grid">
        {picked ? (
          <ProductStage
            key={picked.id}
            modelUrl={picked.model}
            anchor={picked.anchor}
          />
        ) : (
          <div className="lp-stage">
            <p className="lp-stage-note">Opening the catalogue…</p>
          </div>
        )}

        {picked && (
          <aside className="lp-showcase-detail">
            <p className="lp-showcase-from">
              {picked.shopName}
              {picked.room && <span> · {picked.room}</span>}
            </p>

            <h3 className="lp-showcase-name">{picked.name}</h3>

            {picked.description && (
              <p className="lp-showcase-desc">{picked.description}</p>
            )}

            <div className="lp-showcase-price">
              <span className="lp-showcase-amount">
                {money(picked.price, picked.currency)}
              </span>
              {picked.wasPrice && (
                <span className="lp-showcase-was">
                  was {money(picked.wasPrice, picked.currency)}
                </span>
              )}
            </div>

            {picked.promotion && (
              <p className="lp-showcase-promo">{picked.promotion.label}</p>
            )}

            {picked.dimensions && (
              <p className="lp-showcase-dims">
                {picked.dimensions.width} × {picked.dimensions.depth} ×{' '}
                {picked.dimensions.height} mm
              </p>
            )}

            {/* Straight to this thing in the house, not to the front door of
                it. The showroom reads the id off the query string and flies
                to it -- the same link the notification emails send. */}
            <a
              className="luxe-btn primary lp-btn-lg"
              href={`/showroom?product=${encodeURIComponent(picked.id)}`}
            >
              See it in the house
            </a>
          </aside>
        )}
      </div>

      {catalogue && <ShopRail shops={catalogue.shops} picked={picked} onPick={setPickedId} />}
    </section>
  );
};

/**
 * The shops, and what each of them has put in the house.
 *
 * THE COUNTS ARE THE ADVERTISEMENT. "Bradlows · 5 pieces across 2 rooms" is a
 * more persuasive line to a shop reading this page than any adjective, and it
 * costs nothing to be true.
 *
 * A SHOP WITH NOTHING TO STAND ON A TABLE STILL APPEARS. Tubod sells paint,
 * tiles and coatings -- they dress whole rooms rather than standing in them,
 * so they have no model to turn, and dropping them would misrepresent who is
 * in the house. They get their counts and a way in; they just have no chips.
 */
const ShopRail = ({ shops, picked, onPick }) => (
  <div className="lp-shop-rail">
    <h3 className="lp-rail-title">Who is in the house</h3>

    <div className="lp-shop-cards">
      {shops.map((shop) => (
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
                  shop.finishes && `${shop.finishes} finish${shop.finishes === 1 ? '' : 'es'}`,
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
                  <button
                    type="button"
                    className={`lp-chip${picked?.id === product.id ? ' on' : ''}`}
                    onClick={() => onPick(product.id)}
                    aria-pressed={picked?.id === product.id}
                  >
                    {product.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lp-shop-note">
              Surfaces rather than furniture — paint, tiles and coatings, seen
              on the walls and floors of the rooms themselves.
            </p>
          )}
        </article>
      ))}
    </div>
  </div>
);

export default Showcase;
