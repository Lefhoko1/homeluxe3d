import React from 'react';

/**
 * What is standing in the room you are looking at.
 *
 * ONLY THE PRODUCTS NOW. The room list used to sit above this, and the two
 * together made the column enormous -- fourteen rooms and then however many
 * things are in the one you picked, so the products started below the fold.
 * Rooms moved to a strip under the shops, where a short fixed set of choices
 * belongs; see RoomTabs.
 *
 * The heading names the room, because with the tabs at the top of the screen
 * and this column beside the house, "which room is this list?" would
 * otherwise be answered by looking somewhere else.
 */
const TourPanel = ({
  currentRoom,
  currentIndex,
  products = [],
  rooms = [],
  shops = [],
  loading = false,
  onProductSelect,
}) => {
  const shopsById = Object.fromEntries(shops.map((s) => [s.id, s]));
  const room = rooms.find((r) => r.code === currentRoom) ?? null;
  const total = products.length;
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  return (
    <div id="tour-panel">
      <div className="panel-head">
        <div className="panel-title">
          {room ? (
            <>
              <span aria-hidden>{room.icon}</span> {room.label}
            </>
          ) : (
            'In this room'
          )}
        </div>
        <div className="panel-sub">
          {total > 0
            ? `${total} item${total === 1 ? '' : 's'} · click one to focus it`
            : 'Click an item to focus it in the room'}
        </div>

        {total > 0 && (
          <div className="tour-progress">
            <div className="tour-progress-bar">
              <div className="tour-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="tour-progress-label">
              {currentIndex + 1} of {total}
            </div>
          </div>
        )}
      </div>

      <div className="tour-section">
        {loading && <div className="panel-empty">Loading catalogue…</div>}

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
                {product.isFinish ? '🧱' : shop?.icon ?? '📦'}
              </span>
              <span className="tour-item-body">
                <span className="tour-item-name">{product.name}</span>
                <span className="tour-item-shop">
                  {shop?.icon} {product.shopName}
                </span>
              </span>
              {product.isFinish && (
                <span className="tour-item-badge finish">FINISH</span>
              )}
              {onSpecial && <span className="tour-item-badge">SALE</span>}
            </button>
          );
        })}

        {!loading && total === 0 && (
          <div className="panel-empty">
            Nothing placed in this room yet. Pick another above.
          </div>
        )}
      </div>
    </div>
  );
};

export default TourPanel;
