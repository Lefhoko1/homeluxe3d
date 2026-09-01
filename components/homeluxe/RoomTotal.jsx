import React from 'react';

/**
 * What everything in this room costs, added up.
 *
 * THE ONE NUMBER NOBODY HAD TO ASK FOR. A visitor standing in a furnished
 * room is already doing this sum in their head -- sofa plus table plus rug --
 * and doing it badly, from four separate cards. Putting it on screen is the
 * difference between a gallery and a shop.
 *
 * ADDED UP FROM THE SAME PRICES THE CARDS SHOW, which is why it is computed
 * here rather than stored: a promotion that ends changes the total the moment
 * it changes the card, and there is no second number to fall out of step.
 *
 * FINISHES ARE COUNTED but they are priced per unit of surface rather than
 * per item, so a "room total" that included the paint would be wrong in a way
 * nobody could see. Only things that STAND in the room are summed, and the
 * count says how many so the two agree.
 */
const RoomTotal = ({ products = [], roomLabel, onShowAll }) => {
  const priced = products.filter((p) => !p.isFinish && (p.effectivePrice ?? p.price) != null);

  if (!priced.length) return null;

  const total = priced.reduce((sum, p) => sum + (p.effectivePrice ?? p.price), 0);
  const currency = priced[0].currency === 'BWP' ? 'P' : priced[0].currency;

  return (
    <button type="button" className="room-total" onClick={onShowAll}>
      <span className="room-total-text">
        <strong>Shop this room</strong>
        <span className="room-total-count">
          {/* PIECES, not "items". The list on the left counts finishes too
              -- paint and tile are advertised in this room -- and a total
              that said "5 items" beside a panel saying "7 items" reads as a
              bug rather than as two different true things. */}
          {priced.length} piece{priced.length === 1 ? '' : 's'}
          {roomLabel ? ` · ${roomLabel}` : ''}
        </span>
      </span>
      <span className="room-total-sum">
        {currency}&nbsp;
        {total.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
      </span>
    </button>
  );
};

export default RoomTotal;
