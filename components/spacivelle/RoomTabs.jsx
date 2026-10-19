import React, { useEffect, useRef } from 'react';

/**
 * Which room you are looking at, as a strip under the shops.
 *
 * IT USED TO BE A LIST DOWN THE LEFT, above the products, and the two
 * together made that column enormous: fourteen rooms and then however many
 * things are in the one you picked, so the products -- the thing the column
 * exists for -- started below the fold and the room you had just chosen
 * scrolled out of sight while you read them.
 *
 * They are different KINDS of choice and they belong in different places. The
 * room is one pick from a fixed, short set that changes the whole screen;
 * that is a set of tabs, horizontal, always visible, exactly like the shops
 * above it. What is IN the room is a list you scan and click through, and a
 * list wants a column.
 *
 * ROOMS WITH NOTHING IN THEM ARE NOT LISTED. `rooms` already only carries
 * furnished ones -- which is why "Outdoor" stopped appearing and then
 * announcing "coming soon" over a picture of the living room.
 */
const RoomTabs = ({ rooms = [], currentRoom, loading = false, onRoomChange }) => {
  const stripRef = useRef(null);
  const activeRef = useRef(null);

  // Keep the chosen room in view. The strip scrolls sideways, and a room
  // picked with the arrow keys -- or one restored on load -- can easily be
  // off the end of it.
  useEffect(() => {
    const strip = stripRef.current;
    const active = activeRef.current;
    if (!strip || !active) return;

    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({
        left: left - strip.clientWidth / 2 + active.offsetWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [currentRoom, rooms.length]);

  if (loading) {
    return (
      <div id="room-tabs">
        <span className="room-tabs-label">Rooms</span>
        <span className="room-tabs-empty">Loading…</span>
      </div>
    );
  }

  if (!rooms.length) {
    return (
      <div id="room-tabs">
        <span className="room-tabs-label">Rooms</span>
        <span className="room-tabs-empty">
          No furnished rooms yet — place a product to see one here.
        </span>
      </div>
    );
  }

  return (
    <div id="room-tabs">
      <span className="room-tabs-label">Rooms</span>

      {/* A tablist, so arrow keys work and a screen reader announces this as
          one choice rather than as fourteen unrelated buttons. */}
      <div className="room-tabs-strip" ref={stripRef} role="tablist" aria-label="Rooms">
        {rooms.map((room) => {
          const active = room.code === currentRoom;
          return (
            <button
              type="button"
              key={room.code}
              ref={active ? activeRef : null}
              role="tab"
              aria-selected={active}
              className={`room-tab${active ? ' active' : ''}`}
              onClick={() => onRoomChange?.(room.code)}
              title={`${room.label} — ${room.count} item${room.count === 1 ? '' : 's'}`}
            >
              <span className="room-tab-icon" aria-hidden>{room.icon}</span>
              <span className="room-tab-name">{room.label}</span>
              <span className="room-tab-count">{room.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RoomTabs;
