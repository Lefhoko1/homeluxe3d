import React, { useState } from 'react';

function ShopsBanner({ shops }) {
  const shopsArray = Object.values(shops);
  const [activeShop, setActiveShop] = useState(null);

  return (
    <div className="shops-banner">
      <div className="banner-label">✨ Featured Shops</div>
      <div className="shops-scroll">
        <div className="shops-track">
          {[...shopsArray, ...shopsArray].map((shop, index) => (
            <div 
              key={`${shop.name}-${index}`}
              className={`shop-badge ${activeShop === shop.name ? 'active' : ''}`}
              onClick={() => setActiveShop(shop.name)}
            >
              <span className="shop-badge-icon">{shop.icon}</span>
              {shop.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ShopsBanner;