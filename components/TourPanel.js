import React from 'react';

const rooms = [
  { id: 'living-room', name: 'Living Room', icon: '🛋️' },
  { id: 'bedroom', name: 'Bedroom', icon: '🛏️' },
  { id: 'dining-room', name: 'Dining Room', icon: '🍽️' },
  { id: 'outdoor', name: 'Outdoor', icon: '🌳' },
];

function TourPanel({ currentRoom, currentIndex, onRoomChange, onSelectFurniture, roomProducts, shops }) {
  const products = roomProducts[currentRoom] || [];
  const progress = currentIndex >= 0 ? ((currentIndex + 1) / products.length) * 100 : 0;

  return (
    <div className="tour-panel">
      <div className="room-filter">
        <div className="room-filter-label">Room Categories</div>
        <div className="room-tabs">
          {rooms.map(room => (
            <div 
              key={room.id}
              className={`room-tab ${currentRoom === room.id ? 'active' : ''}`}
              onClick={() => onRoomChange(room.id)}
            >
              <span className="room-tab-icon">{room.icon}</span>
              {room.name}
            </div>
          ))}
        </div>
      </div>
      
      <div className="divider"></div>
      
      <div className="tour-header">
        <h3>Furniture Tour</h3>
        <p>Select items to view in 360°</p>
      </div>
      
      <div className="progress-section">
        <div className="progress-text">
          {currentIndex >= 0 ? `Item ${currentIndex + 1} of ${products.length}` : 'Ready to start'}
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
      </div>
      
      <ul className="furniture-list">
        {products.map((product, index) => {
          const shop = shops[product.shop];
          return (
            <li 
              key={product.id}
              className={`furniture-item ${currentIndex === index ? 'active' : ''}`}
              onClick={() => onSelectFurniture(index)}
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
}

export default TourPanel;