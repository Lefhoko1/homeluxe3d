import React, { useEffect, useState } from 'react';

/**
 * What the tour is looking at, on the house itself -- and out of the way when
 * the visitor wants the room.
 *
 * During a guided tour the details drawer stays shut on purpose (opening it at
 * every stop would cover the house every few seconds), which left a visitor
 * with nothing but "Looking at singlesofa 6/8" to go on. This card follows the
 * pin (tour/marker.js): as she turns to each piece it shows what it is, whose
 * it is and what it costs.
 *
 * COLLAPSIBLE, AND IT STAYS HOW YOU LEFT IT. Collapsed it is one slim line --
 * name and price -- and that choice holds for the rest of the tour and the
 * next visit, so somebody who wants to watch the rooms is not asked again at
 * every product.
 *
 * Empty positions get a card too: a visitor being sold space needs to know
 * the space is for sale.
 *
 * WHEN A SHOP IS TALKING (lib/narration), the card says so -- whose voice,
 * which view of the product -- shows that view's photograph beside the 3D
 * shot, and carries the mute button. Muting is remembered; it silences every
 * shop, not just this one.
 */

const COLLAPSED_KEY = 'spacivelle.showcaseCard.collapsed';

/**
 * Per-viewer convenience only. With nothing remembered, a PHONE starts
 * collapsed: open, the card covered the top third of the screen -- the
 * furniture it describes -- and a visitor can open it with one tap.
 */
function readCollapsed() {
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 820px)').matches;
  try {
    const saved = window.localStorage.getItem(COLLAPSED_KEY);
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch {
    // storage blocked: fall through to the default
  }
  return Boolean(phone);
}

function writeCollapsed(value) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    // Storage blocked: the card still collapses, it just will not remember.
  }
}

/** Locale pinned: server and browser defaults differ. See ProductPanel.jsx. */
const money = (amount, currency = 'BWP') => {
  if (amount == null || amount === '') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const symbol = currency === 'BWP' || !currency ? 'P' : currency;
  return `${symbol} ${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
};

const words = (text) => (text ? String(text).replace(/[_-]+/g, ' ') : '');

/**
 * @param {object}   props
 * @param {object}   [props.advert]  the advert on the thing being looked at
 * @param {object}   [props.showing] `{caption, kind, at, of}` from the tour
 * @param {Function} [props.onMore]  open the full details drawer
 * @param {object}   [props.narration]  while a shop is talking:
 *        `{shopName, elevation, index, count, imageUrl, muted, blocked,
 *          onToggleMute, onPlay}`
 */
const ShowcaseCard = ({ advert = null, showing = null, onMore = null, narration = null }) => {
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount, not during render: the server has no localStorage, and
  // a different first render on each side is a hydration mismatch.
  useEffect(() => { setCollapsed(readCollapsed()); }, []);

  const isSlot = showing?.kind === 'slot';
  if (!showing || (!advert && !isSlot)) return null;

  const toggle = () => {
    setCollapsed((was) => {
      writeCollapsed(!was);
      return !was;
    });
  };

  const name = advert?.name ?? showing.caption;
  const shop = advert?.shopName ?? advert?.shop ?? null;
  const price = advert ? (advert.effectivePrice ?? advert.price) : null;
  const was =
    advert?.promotion?.isLive && advert.price != null && price != null &&
    Number(price) < Number(advert.price)
      ? advert.price
      : null;
  const priceText = isSlot ? 'Available' : money(price, advert?.currency) ?? 'Price on enquiry';
  const dims = advert?.dimensions;
  const size = dims?.width && dims?.depth && dims?.height
    ? `${dims.width} × ${dims.depth} × ${dims.height} mm`
    : null;

  return (
    <aside
      className={`showcase-card${collapsed ? ' collapsed' : ''}${isSlot ? ' slot' : ''}`}
      aria-live="polite"
      aria-label={`Now viewing: ${name}`}
    >
      {narration && (
        <div className={`showcase-card-voice${narration.muted ? ' muted' : ''}`}>
          <span className="showcase-card-voice-icon" aria-hidden>{narration.muted ? '🔇' : '🔊'}</span>
          <span className="showcase-card-voice-text">
            <strong>{narration.shopName}</strong>
            {collapsed ? '' : ' is talking you through it'}
            <span className="showcase-card-voice-view">
              {narration.elevation}{narration.count > 1 ? ` · ${narration.index + 1} of ${narration.count}` : ''}
            </span>
          </span>
          {narration.blocked && !narration.muted ? (
            <button type="button" className="showcase-card-voice-btn play" onClick={narration.onPlay}>
              ▶ Listen
            </button>
          ) : (
            <button
              type="button"
              className="showcase-card-voice-btn"
              onClick={narration.onToggleMute}
              aria-pressed={narration.muted}
              aria-label={narration.muted ? 'Turn shop narration on' : 'Mute shop narration'}
              title={narration.muted ? 'Turn shop narration on' : 'Mute shop narration'}
            >
              {narration.muted ? 'Unmute' : 'Mute'}
            </button>
          )}
        </div>
      )}

      {narration?.imageUrl && !collapsed && (
        <img className="showcase-card-photo" src={narration.imageUrl} alt={`${name}: ${narration.elevation}`} />
      )}

      <div className="showcase-card-head">
        <div className="showcase-card-title">
          {!collapsed && (
            <span className="showcase-card-kicker">
              {isSlot ? 'Advertising space' : words(advert?.category) || 'Now viewing'}
              {showing.of > 1 ? ` · ${showing.at} of ${showing.of}` : ''}
            </span>
          )}
          <strong className="showcase-card-name">{name}</strong>
          {collapsed && <span className="showcase-card-price-inline">{priceText}</span>}
        </div>
        <button
          type="button"
          className="showcase-card-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Show product details' : 'Hide product details'}
          title={collapsed ? 'Show details' : 'Hide details'}
        >
          <span aria-hidden>{collapsed ? '▴' : '▾'}</span>
        </button>
      </div>

      {!collapsed && (
        <div className="showcase-card-body">
          {shop && <div className="showcase-card-shop">{shop}</div>}

          <div className="showcase-card-price">
            <span>{priceText}</span>
            {was != null && <s>{money(was, advert?.currency)}</s>}
          </div>

          {advert?.promotion?.isLive && advert.promotion.label && (
            <div className="showcase-card-promo">{advert.promotion.label}</div>
          )}

          {isSlot ? (
            <p className="showcase-card-text">
              This position is open. Shops can place a product here and have
              it shown on every tour.
            </p>
          ) : (
            advert?.description && <p className="showcase-card-text">{advert.description}</p>
          )}

          {size && <div className="showcase-card-meta">{size}</div>}

          {!isSlot && onMore && (
            <button type="button" className="showcase-card-more" onClick={onMore}>
              More details &amp; enquire
            </button>
          )}
        </div>
      )}
    </aside>
  );
};

export default ShowcaseCard;
