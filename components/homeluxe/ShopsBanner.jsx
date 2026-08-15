import React from 'react';

/**
 * The featured-shops strip.
 *
 * Shops come from the catalogue, not from a list typed into this file.
 *
 * A chip is a FILTER: clicking one narrows the room lists to that shop, so a
 * visitor can follow a single advertiser through the house. Clicking the
 * active one clears it. That is the whole interaction -- the chip does not
 * navigate anywhere, because the shop's products are already in the rooms.
 */
const ShopsBanner = ({ shops = [], activeShop = null, onShopSelect }) => {
  if (!shops.length) return null;

  return (
    <div id="shops-banner">
      <div className="shops-banner-label">✨ Featured Shops</div>
      <div className="shops-scroll">
        {shops.map((shop) => {
          const active = shop.id === activeShop;
          return (
            <button
              type="button"
              key={shop.id}
              className={`shop-chip${active ? ' active' : ''}`}
              onClick={() => onShopSelect?.(active ? null : shop.id)}
              title={
                active
                  ? `Showing only ${shop.name} — click to show all shops`
                  : `Show only ${shop.name}`
              }
            >
              <span className="shop-chip-icon" aria-hidden>{shop.icon}</span>
              <span className="shop-chip-name">{shop.name}</span>
              {shop.productCount > 0 && (
                <span className="shop-chip-count">{shop.productCount}</span>
              )}
            </button>
          );
        })}
        {activeShop && (
          <button
            type="button"
            className="shop-chip clear"
            onClick={() => onShopSelect?.(null)}
          >
            ✕ Show all
          </button>
        )}
      </div>
    </div>
  );
};

export default ShopsBanner;
