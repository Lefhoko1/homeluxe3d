import React from 'react';

/**
 * Details for the selected product.
 *
 * Shows whatever is selected, whether that came from the list on the left or
 * from clicking the thing itself in the 3D room. One selection, three views.
 */
const money = (amount, currency = 'BWP') => {
  if (amount == null) return null;
  // Locale pinned: the default differs between server and browser and causes
  // a hydration mismatch. Same reason as lib/models/Model.js.
  const n = Number(amount).toLocaleString('en-GB', { maximumFractionDigits: 2 });
  return `${currency === 'BWP' ? 'P' : currency} ${n}`;
};

const ProductPanel = ({ product, shops = [], loading = false, onEnquire }) => {
  if (loading) {
    return (
      <div id="product-panel">
        <div className="panel-empty">Loading catalogue…</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div id="product-panel">
        <div className="panel-empty">
          Select an item, or click something in the room.
        </div>
      </div>
    );
  }

  const shop = shops.find((s) => s.id === (product.shopSlug ?? product.shop));
  const promo = product.promotion?.isLive ? product.promotion : null;
  const price = product.effectivePrice ?? product.price;
  const wasPrice =
    promo && product.price != null && price != null && price < product.price
      ? product.price
      : null;

  const specs = [
    ['Material', product.madeOf?.join(', ')],
    ['Colour', product.colour],
    ['SKU', product.sku],
    [
      'Dimensions',
      product.dimensions
        ? `${product.dimensions.width} × ${product.dimensions.depth} × ${product.dimensions.height} mm`
        : null,
    ],
    ['Suits', product.roomTypes?.length ? product.roomTypes.join(', ') : 'any room'],
  ].filter(([, value]) => value);

  // The photographs. `media` is every image, thumbnail first; older rows and
  // the static catalogue carry only `thumbnail`, so accept either.
  const images = product.media?.length
    ? product.media
    : product.thumbnail
      ? [product.thumbnail]
      : [];

  return (
    <div id="product-panel">
      {/* The advert's picture. The column has been travelling all the way
          from the database to this component since the catalogue was wired
          up; nothing rendered it until now. */}
      {images.length > 0 && (
        <div className="product-gallery">
          <img className="product-hero" src={images[0]} alt={product.name} />
          {images.length > 1 && (
            <div className="product-thumbs">
              {images.slice(1).map((url) => (
                <img key={url} src={url} alt="" />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="product-header">
        <div className="product-category">{product.category}</div>
        <h2 className="product-name">{product.name}</h2>
        {shop && (
          <div className="product-shop-chip">
            <span aria-hidden>{shop.icon}</span> {shop.name}
          </div>
        )}
      </div>

      <div className="product-price-block">
        <div className="product-price-label">Price</div>
        <div className="product-price">{money(price, product.currency)}</div>
        {wasPrice && (
          <div className="product-price-was">{money(wasPrice, product.currency)}</div>
        )}
      </div>

      {promo && (
        <div className="product-promo">
          <div className="product-promo-label">{promo.label}</div>
          {promo.endsOn && (
            <div className="product-promo-ends">Ends {promo.endsOn}</div>
          )}
          {promo.terms && <div className="product-promo-terms">{promo.terms}</div>}
        </div>
      )}

      {product.description && (
        <div className="product-description">{product.description}</div>
      )}

      {/* The enquiry is the conversion event -- the thing a shop is paying
          for. It lived in the popup that used to duplicate this panel. */}
      {shop && (
        <button
          type="button"
          className="product-enquire"
          onClick={() => onEnquire?.(product)}
        >
          Enquire at {shop.name}
        </button>
      )}

      {specs.length > 0 && (
        <>
          <div className="product-specs-title">📋 Specifications</div>
          <div className="product-specs">
            {specs.map(([label, value]) => (
              <div className="product-spec" key={label}>
                <span className="product-spec-label">{label}</span>
                <span className="product-spec-value">{value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ProductPanel;
