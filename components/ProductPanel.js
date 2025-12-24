import React from 'react';

function ProductPanel({ product, shop }) {
  if (!product || !shop) {
    return (
      <div className="product-panel">
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
          
          <div className="specs-section">
            <h3>📋 Specifications</h3>
            <div className="spec-grid">
              <div className="spec-item">
                <span className="spec-label">Select item</span>
                <span className="spec-value">to view specs</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="product-panel">
      <div className="product-header">
        <div className="product-category">{product.category}</div>
        <div className="product-header-row">
          <h2>{product.name}</h2>
          <div className="product-shop-badge">
            <span className="product-shop-icon">{shop.icon}</span>
            <span>{shop.name}</span>
          </div>
        </div>
      </div>
      
      <div className="product-body">
        <div className="price-tag">
          <div className="price-label">Price</div>
          <div className="price-value">{product.price}</div>
        </div>
        
        <div className="product-description">
          {product.description}
        </div>
        
        <div className="specs-section">
          <h3>📋 Specifications</h3>
          <div className="spec-grid">
            {Object.entries(product.specs || {}).map(([key, value]) => (
              <div key={key} className="spec-item">
                <span className="spec-label">{key}</span>
                <span className="spec-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="shop-section">
          <div className="shop-header">
            <div className="shop-icon-large">{shop.icon}</div>
            <div className="shop-info">
              <h3>{shop.name}</h3>
              <p>{shop.description}</p>
            </div>
          </div>
          
          <div className="contact-grid">
            <div className="contact-item">
              <div className="contact-icon">📞</div>
              <span>{shop.phone}</span>
            </div>
            <div className="contact-item">
              <div className="contact-icon">📧</div>
              <span>{shop.email}</span>
            </div>
            <div className="contact-item">
              <div className="contact-icon">📍</div>
              <span>{shop.address}</span>
            </div>
          </div>
          
          <button className="cta-button">Contact Shop Now</button>
        </div>
      </div>
    </div>
  );
}

export default ProductPanel;