import React from 'react';

/**
 * The featured-shops strip.
 *
 * Shops come from the catalogue, not from a list typed into this file. The
 * previous version advertised seven invented shops that sold nothing in the
 * scene behind it.
 */
const ShopsBanner = ({ shops = [] }) => {
  if (!shops.length) return null;

  // Duplicated so the marquee has something to scroll into. Keys are
  // prefixed by pass, since the same shop appears twice.
  const passes = [...shops, ...shops];

  return (
    <div id="shops-banner">
      <div className="shops-banner-label">✨ Featured Shops</div>
      <div className="shops-scroll">
        {passes.map((shop, i) => (
          <div className="shop-chip" key={`${i < shops.length ? 'a' : 'b'}-${shop.id}`}>
            <span className="shop-chip-icon" aria-hidden>{shop.icon}</span>
            <span className="shop-chip-name">{shop.name}</span>
            {shop.productCount > 0 && (
              <span className="shop-chip-count">{shop.productCount}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShopsBanner;
