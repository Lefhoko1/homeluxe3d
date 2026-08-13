import React, { useState, useEffect } from 'react';

const ProductPanel = ({ currentRoom, currentIndex, roomProducts }) => {
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    const products = roomProducts[currentRoom] || [];
    if (products.length > 0 && currentIndex < products.length) {
      setSelectedProduct(products[currentIndex]);
    } else {
      setSelectedProduct(null);
    }
  }, [currentRoom, currentIndex, roomProducts]);

  const shops = {
    luxeHome: {
      name: "Luxe Home Gallery",
      icon: "🏛️",
      description: "Premium furniture & decor",
      phone: "+267 395 8821",
      email: "sales@luxehome.bw",
      address: "Main Mall, Gaborone"
    },
    artisan: {
      name: "Artisan Furniture",
      icon: "🎨",
      description: "Handcrafted pieces",
      phone: "+267 390 2156",
      email: "info@artisanfurn.bw",
      address: "African Mall, Gaborone"
    },
    techHome: {
      name: "Tech & Home",
      icon: "📱",
      description: "Modern solutions",
      phone: "+267 391 7788",
      email: "contact@techhome.bw",
      address: "Game City, Gaborone"
    },
    illuminate: {
      name: "Illuminate Decor",
      icon: "💡",
      description: "Lighting specialists",
      phone: "+267 393 2244",
      email: "hello@illuminate.bw",
      address: "Riverwalk Mall, Gaborone"
    },
    sleepHaven: {
      name: "Sleep Haven",
      icon: "😴",
      description: "Bedroom comfort",
      phone: "+267 393 6655",
      email: "hello@sleephaven.bw",
      address: "Block 8, Gaborone"
    },
    homeEssentials: {
      name: "Home Essentials",
      icon: "🏠",
      description: "Complete home solutions",
      phone: "+267 318 5544",
      email: "orders@homeessentials.bw",
      address: "Broadhurst, Gaborone"
    },
    gardenLife: {
      name: "Garden Life",
      icon: "🌿",
      description: "Outdoor experts",
      phone: "+267 394 7788",
      email: "info@gardenlife.bw",
      address: "Kgale View, Gaborone"
    }
  };

  if (!selectedProduct) {
    return (
      <div id="product-panel">
        <div className="product-header">
          <div className="product-category">Select an item</div>
          <div className="product-header-row">
            <h2>Welcome to HomeLuxe 3D</h2>
          </div>
        </div>
        <div className="product-body">
          <div className="price-tag">
            <div className="price-label">Price</div>
            <div className="price-value">P 0</div>
          </div>
          <div className="product-description">
            Select any furniture item to view in immersive 3D with complete specifications and pricing.
          </div>
        </div>
      </div>
    );
  }

  const shop = shops[selectedProduct.shop];

  return (
    <div id="product-panel">
      <div className="product-header">
        <div className="product-category">{selectedProduct.category}</div>
        <div className="product-header-row">
          <h2 id="product-name">{selectedProduct.name}</h2>
          <div className="product-shop-badge" id="product-shop-badge">
            <span className="product-shop-icon" id="product-shop-icon-header">{shop.icon}</span>
            <span id="product-shop-name-header">{shop.name}</span>
          </div>
        </div>
      </div>
      <div className="product-body">
        <div className="price-tag">
          <div className="price-label">Price</div>
          <div className="price-value" id="product-price">{selectedProduct.price}</div>
        </div>

        <div className="product-description" id="product-description">
          {selectedProduct.description}
        </div>

        <div className="specs-section">
          <h3>📋 Specifications</h3>
          <div className="spec-grid" id="product-specs">
            {Object.entries(selectedProduct.specs).map(([key, value]) => (
              <div key={key} className="spec-item">
                <span className="spec-label">{key}</span>
                <span className="spec-value">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="shop-section">
          <div className="shop-header">
            <div className="shop-icon-large" id="shop-icon">{shop.icon}</div>
            <div className="shop-info">
              <h3 id="shop-name">{shop.name}</h3>
              <p id="shop-description">{shop.description}</p>
            </div>
          </div>

          <div className="contact-grid">
            <div className="contact-item">
              <div className="contact-icon">📞</div>
              <span id="shop-phone">{shop.phone}</span>
            </div>
            <div className="contact-item">
              <div className="contact-icon">📧</div>
              <span id="shop-email">{shop.email}</span>
            </div>
            <div className="contact-item">
              <div className="contact-icon">📍</div>
              <span id="shop-address">{shop.address}</span>
            </div>
          </div>

          <button className="cta-button">Contact Shop Now</button>
        </div>
      </div>
    </div>
  );
};

export default ProductPanel;
