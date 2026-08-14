import React from 'react';

/**
 * Room list and the items standing in the selected room.
 *
 * Both come from the catalogue. Rooms are only listed if they actually
 * contain something, which is why "Outdoor" no longer appears and then
 * announces "coming soon" over a picture of the living room.
 */
const TourPanel = ({
  currentRoom,
  currentIndex,
  products = [],
  rooms = [],
  shops = [],
  loading = false,
  onRoomChange,
  onProductSelect,
}) => {
  const shopsById = Object.fromEntries(shops.map((s) => [s.id, s]));
  const total = products.length;
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  return (
    <div id="tour-panel">
      <div className="room-filter">
        <div className="panel-title">Room Categories</div>

        {loading && <div className="panel-empty">Loading catalogue…</div>}

        {!loading && rooms.length === 0 && (
          <div className="panel-empty">
            No furnished rooms yet. Place a product in the catalogue to see it here.
          </div>
        )}

        {rooms.map((room) => (
          <button
            type="button"
            key={room.code}
            className={`room-btn${room.code === currentRoom ? ' active' : ''}`}
            onClick={() => onRoomChange?.(room.code)}
          >
            <span className="room-icon" aria-hidden>{room.icon}</span>
            <span className="room-name">{room.label}</span>
            <span className="room-count">{room.count}</span>
          </button>
        ))}
      </div>

      <div className="tour-section">
        <div className="panel-title">Furniture Tour</div>
        <div className="panel-sub">Click an item to focus it in the room</div>

        {total > 0 && (
          <div className="tour-progress">
            <div className="tour-progress-label">
              Item {currentIndex + 1} of {total}
            </div>
            <div className="tour-progress-bar">
              <div className="tour-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {products.map((product, index) => {
          const shop = shopsById[product.shopSlug];
          const onSpecial = product.promotion?.isLive;
          return (
            <button
              type="button"
              key={product.id}
              className={`tour-item${index === currentIndex ? ' active' : ''}`}
              onClick={() => onProductSelect?.(index)}
            >
              <span className="tour-item-icon" aria-hidden>
                {shop?.icon ?? '📦'}
              </span>
              <span className="tour-item-body">
                <span className="tour-item-name">{product.name}</span>
                <span className="tour-item-shop">
                  {shop?.icon} {product.shopName}
                </span>
              </span>
              {onSpecial && <span className="tour-item-badge">SALE</span>}
            </button>
          );
        })}

        {!loading && total === 0 && (
          <div className="panel-empty">Nothing placed in this room yet.</div>
        )}
      </div>
    </div>
  );
};

export default TourPanel;
