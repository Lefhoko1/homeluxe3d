import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { VisitorService } from '../../lib/visitor/VisitorService';

/**
 * The featured-shops strip.
 *
 * Shops come from the catalogue, not from a list typed into this file.
 *
 * A chip is a FILTER: clicking one narrows the room lists to that shop, so a
 * visitor can follow a single advertiser through the house. Clicking the
 * active one clears it.
 *
 * AND NOW IT IS ALSO WHERE YOU FOLLOW ONE. This is the moment somebody
 * decides they like a shop -- they are looking at its furniture, in a room,
 * right now -- and sending them to a separate page to act on that asks them
 * to hold the feeling until they get there. Signed out, the control is a link
 * to join: a Follow button that silently does nothing is worse than one that
 * says what it needs.
 *
 * THE TWO CONTROLS ARE SIBLINGS, NOT NESTED. A button inside a button is
 * invalid HTML and a link inside one is worse -- browsers recover from it in
 * different ways, and one of the recoveries is losing the click entirely. The
 * chip is a group with a filter button and a follow control side by side.
 */
const ShopsBanner = ({ shops = [], activeShop = null, onShopSelect, userId = null }) => {
  const service = useMemo(() => new VisitorService(), []);

  // Slug -> { id, following }. The catalogue knows shops by slug and the
  // database by uuid, and following needs the uuid, so the mapping is read
  // once rather than re-fetched on every press.
  const [known, setKnown] = useState(() => new Map());
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!userId) { setKnown(new Map()); return undefined; }
    let cancelled = false;
    service
      .shops()
      .then((rows) => {
        if (cancelled) return;
        setKnown(new Map(rows.map((r) => [r.slug, { id: r.id, following: r.following }])));
      })
      .catch((error) => {
        // Not fatal. The strip's job is filtering, and it should keep doing
        // that even when the follow state cannot be read.
        console.warn('[shops] could not read your follows:', error.message);
      });
    return () => { cancelled = true; };
  }, [service, userId]);

  const toggleFollow = useCallback(async (slug, name) => {
    const row = known.get(slug);
    if (!userId || !row) return;

    const wasFollowing = row.following;
    setBusy(slug);
    // Flip first: a Follow button that waits for the network gets pressed
    // twice, and the second press undoes the first.
    setKnown((current) => {
      const next = new Map(current);
      next.set(slug, { ...row, following: !wasFollowing });
      return next;
    });

    try {
      if (wasFollowing) await service.unfollow(row.id, userId);
      else await service.follow(row.id, userId);
    } catch (error) {
      console.warn(`[shops] could not change your follow of ${name}:`, error.message);
      setKnown((current) => {
        const next = new Map(current);
        next.set(slug, { ...row, following: wasFollowing });
        return next;
      });
    } finally {
      setBusy(null);
    }
  }, [service, userId, known]);

  if (!shops.length) return null;

  return (
    <div id="shops-banner">
      <div className="shops-banner-label">Featured shops</div>
      <div className="shops-scroll">
        {shops.map((shop) => {
          const active = shop.id === activeShop;
          const row = known.get(shop.id);
          const following = Boolean(row?.following);

          return (
            <span className={`shop-chip${active ? ' active' : ''}`} key={shop.id}>
              <button
                type="button"
                className="shop-chip-filter"
                onClick={() => onShopSelect?.(active ? null : shop.id)}
                title={
                  active
                    ? `Showing only ${shop.name} — click to show all shops`
                    : `Show only ${shop.name}`
                }
              >
                <span className="shop-chip-icon" aria-hidden>{shop.icon}</span>
                <span className="shop-chip-name">{shop.name}</span>
                {shop.productCount > 0 && (
                  <span className="shop-chip-count">{shop.productCount}</span>
                )}
              </button>

              {userId ? (
                <button
                  type="button"
                  className={`follow-btn${following ? ' on' : ''}`}
                  aria-pressed={following}
                  disabled={busy === shop.id || !row}
                  onClick={() => toggleFollow(shop.id, shop.name)}
                  title={
                    following
                      ? `Stop following ${shop.name}`
                      : `Follow ${shop.name} and hear when they add something`
                  }
                >
                  {busy === shop.id ? '…' : following ? 'Following' : 'Follow'}
                </button>
              ) : (
                <a
                  className="follow-btn"
                  href="/join"
                  title={`Join to hear when ${shop.name} adds something`}
                >
                  Follow
                </a>
              )}
            </span>
          );
        })}

        {activeShop && (
          <button
            type="button"
            className="shop-chip clear"
            onClick={() => onShopSelect?.(null)}
          >
            ✕ Show all
          </button>
        )}
      </div>
    </div>
  );
};

export default ShopsBanner;
