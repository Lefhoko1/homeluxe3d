import React from 'react';

const TourPanel = ({ currentRoom, currentIndex, roomProducts, onRoomChange, onProductSelect }) => {
  const shops = {
    luxeHome: { name: "Luxe Home Gallery", icon: "🏛️" },
    artisan: { name: "Artisan Furniture", icon: "🎨" },
    techHome: { name: "Tech & Home", icon: "📱" },
    illuminate: { name: "Illuminate Decor", icon: "💡" },
    sleepHaven: { name: "Sleep Haven", icon: "😴" },
    homeEssentials: { name: "Home Essentials", icon: "🏠" },
    gardenLife: { name: "Garden Life", icon: "🌿" }
  };

  const products = roomProducts[currentRoom] || [];
  const totalItems = products.length;
  const progress = totalItems > 0 ? ((currentIndex + 1) / totalItems) * 100 : 0;

  return (
    <div id="tour-panel">
      <div className="room-filter">
        <div className="room-filter-label">Room Categories</div>
        <div className="room-tabs">
          {Object.keys(roomProducts).map(room => (
            <div
              key={room}
              className={`room-tab ${currentRoom === room ? 'active' : ''}`}
              data-room={room}
              onClick={() => onRoomChange(room)}
            >
              <span className="room-tab-icon">
                {room === 'living-room' ? '🛋️' :
                 room === 'bedroom' ? '🛏️' :
                 room === 'dining-room' ? '🍽️' : '🌳'}
              </span>
              {room.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
          ))}
        </div>
      </div>

      <div className="divider"></div>

      <div className="tour-header">
        <h3>Furniture Tour</h3>
        <p>Click items to view in 360° & see details</p>
      </div>

      <div className="progress-section">
        <div className="progress-text" id="progress-text">
          {totalItems > 0 ? `Item ${currentIndex + 1} of ${totalItems}` : 'Ready to start'}
        </div>
        <div className="progress-bar">
          <div className="progress-fill" id="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      <ul className="furniture-list" id="furniture-list">
        {products.map((product, index) => {
          const shop = shops[product.shop];
          return (
            <li
              key={product.id}
              className={`furniture-item ${index === currentIndex ? 'active' : ''}`}
              onClick={() => onProductSelect(index)}
            >
              <div className="furniture-icon">{product.icon}</div>
              <div className="furniture-info">
                <div className="furniture-name">{product.name}</div>
                <div className="furniture-shop">
                  <span>{shop.icon}</span>
                  {shop.name}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default TourPanel;
