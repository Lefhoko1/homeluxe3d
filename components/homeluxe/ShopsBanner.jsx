import React, { useEffect } from 'react';

const ShopsBanner = () => {
  const shops = {
    luxeHome: {
      name: "Luxe Home Gallery",
      icon: "🏛️",
    },
    artisan: {
      name: "Artisan Furniture",
      icon: "🎨",
    },
    techHome: {
      name: "Tech & Home",
      icon: "📱",
    },
    illuminate: {
      name: "Illuminate Decor",
      icon: "💡",
    },
    sleepHaven: {
      name: "Sleep Haven",
      icon: "😴",
    },
    homeEssentials: {
      name: "Home Essentials",
      icon: "🏠",
    },
    gardenLife: {
      name: "Garden Life",
      icon: "🌿",
    }
  };

  useEffect(() => {
    const initShopsBanner = () => {
      const track = document.getElementById('shops-track');
      if (track) {
        const shopsArray = Object.values(shops);
        const html = shopsArray.map(shop => `
          <div class="shop-badge">
            <span class="shop-badge-icon">${shop.icon}</span>
            ${shop.name}
          </div>
        `).join('');
        track.innerHTML = html + html;
      }
    };

    initShopsBanner();
  }, []);

  return (
    <div className="shops-banner">
      <div className="banner-label">✨ Featured Shops</div>
      <div className="shops-scroll">
        <div className="shops-track" id="shops-track"></div>
      </div>
    </div>
  );
};

export default ShopsBanner;
