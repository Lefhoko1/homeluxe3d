import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { VisitorService } from '../../../lib/visitor/VisitorService';
import '../homeluxe.css';
import '../visitor.css';

/**
 * The shops you follow, what you hear about, and what you have been told.
 *
 * FOLLOWING IS THE PRODUCT. A shop is not buying a position in the house --
 * it is buying the people who will be told when something lands in it. So
 * this page is deliberately two things at once: the list you choose from, and
 * the feed that proves choosing was worth it.
 *
 * THE PREFERENCES ARE PER SHOP, and that is the point. "Email me about
 * everything from everyone" is the setting people turn off; "tell me when
 * Bears has a new bed, but not every time they post" is the one they keep.
 * The switches only appear once you follow, because they are meaningless
 * before that.
 */
const Following = ({ userId, displayName, onSignOut }) => {
  const service = useMemo(() => new VisitorService(), []);

  const [shops, setShops] = useState([]);
  const [counts, setCounts] = useState(new Map());
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState(null);
  const [busyShop, setBusyShop] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shopRows, counted, notes] = await Promise.all([
        service.shops(),
        service.shopCounts(),
        service.notifications(30),
      ]);
      setShops(shopRows);
      setCounts(counted);
      setFeed(notes);
      setProblem(null);
    } catch (e) {
      setProblem(e.message);
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { load(); }, [load]);

  /**
   * Follow, unfollow, or change what you hear.
   *
   * The row is updated in place BEFORE the write lands, because a Follow
   * button that waits for a round trip gets pressed twice -- and the second
   * press is an unfollow. If the write fails the list is reloaded, which puts
   * the truth back.
   */
  const change = async (shop, next) => {
    setBusyShop(shop.id);
    setShops((rows) => rows.map((r) => (r.id === shop.id ? { ...r, ...next } : r)));
    try {
      if (next.following === false) {
        await service.unfollow(shop.id, userId);
      } else if (next.following === true) {
        await service.follow(shop.id, userId, { ...shop, ...next });
      } else {
        await service.setPreferences(shop.id, userId, { ...shop, ...next });
      }
      setProblem(null);
    } catch (e) {
      setProblem(e.message);
      load();
    } finally {
      setBusyShop(null);
    }
  };

  const markAllRead = async () => {
    try {
      await service.markAllRead();
      setFeed((rows) => rows.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })));
    } catch (e) {
      setProblem(e.message);
    }
  };

  const followed = shops.filter((s) => s.following);
  const unread = feed.filter((n) => !n.read_at).length;

  return (
    <div className="luxe-wide">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="cinematic-eyebrow">
            {displayName ? `Hello, ${displayName}` : 'Your shops'}
          </p>
          <h1 className="luxe-lede">
            {followed.length
              ? `You follow ${followed.length} shop${followed.length === 1 ? '' : 's'}.`
              : 'Pick the shops worth hearing from.'}
          </h1>
        </div>
        {onSignOut && (
          <button type="button" className="luxe-btn quiet" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>

      <p className="luxe-sub">
        We will email you when a shop you follow puts something new in the
        house — the photograph, the price and where to find it.
      </p>

      {problem && <p className="luxe-note bad">{problem}</p>}
      {loading && <p className="luxe-sub">Loading…</p>}

      {!loading && (
        <>
          <div className="luxe-shops">
            {shops.map((shop) => (
              <article
                key={shop.id}
                className={`luxe-shop${shop.following ? ' following' : ''}`}
              >
                <div className="luxe-shop-head">
                  <span className="luxe-shop-mark" aria-hidden="true">
                    {shop.name.slice(0, 1)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 className="luxe-shop-name">{shop.name}</h2>
                    <p className="luxe-shop-meta">
                      {shop.tagline || shop.where || 'Gaborone'}
                    </p>
                    <p className="luxe-shop-count">
                      {counts.get(shop.slug) ?? 0} in the house
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`luxe-btn ${shop.following ? 'quiet' : 'primary'}`}
                    disabled={busyShop === shop.id}
                    onClick={() => change(shop, { following: !shop.following })}
                  >
                    {shop.following ? 'Following' : 'Follow'}
                  </button>
                </div>

                {shop.following && (
                  <div className="luxe-prefs">
                    <label className="luxe-pref">
                      <input
                        type="checkbox"
                        checked={shop.notify}
                        onChange={(e) => change(shop, { notify: e.target.checked })}
                      />
                      <span>
                        Email me
                        <em>
                          Off means it still appears here — it just stays out of
                          your inbox.
                        </em>
                      </span>
                    </label>

                    <label className={`luxe-pref${shop.notify ? '' : ' off'}`}>
                      <input
                        type="checkbox"
                        checked={shop.notifyProducts}
                        disabled={!shop.notify}
                        onChange={(e) => change(shop, { notifyProducts: e.target.checked })}
                      />
                      <span>
                        When they put something new in the house
                        <em>A new bed, a new tile, a new light fitting.</em>
                      </span>
                    </label>

                    <label className={`luxe-pref${shop.notify ? '' : ' off'}`}>
                      <input
                        type="checkbox"
                        checked={shop.notifyPosts}
                        disabled={!shop.notify}
                        onChange={(e) => change(shop, { notifyPosts: e.target.checked })}
                      />
                      <span>
                        When they have news
                        <em>Sales, opening hours, anything they announce.</em>
                      </span>
                    </label>
                  </div>
                )}
              </article>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '38px 0 14px' }}>
            <h2 className="luxe-lede" style={{ fontSize: 24 }}>
              What you have been told
            </h2>
            {unread > 0 && (
              <button type="button" className="luxe-link" onClick={markAllRead}>
                Mark all {unread} as read
              </button>
            )}
          </div>

          {feed.length === 0 ? (
            <p className="luxe-empty">
              Nothing yet. Follow a shop above and this fills up the next time
              they put something in the house.
            </p>
          ) : (
            <div className="luxe-feed">
              {feed.map((note) => (
                <a
                  key={note.id}
                  className={`luxe-item ${note.read_at ? 'read' : 'unread'}`}
                  href={note.url || '/'}
                  onClick={() => !note.read_at && service.markRead(note.id)}
                >
                  <span className="luxe-item-dot" aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <h3>{note.title}</h3>
                    <p>
                      {note.shops?.name ? `${note.shops.name} — ` : ''}
                      {note.body}
                    </p>
                  </span>
                  <span className="luxe-item-when">{ago(note.created_at)}</span>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** How long ago, short enough to sit at the end of a row. */
function ago(value) {
  if (!value) return '';
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const steps = [[60, 'm'], [60, 'h'], [24, 'd'], [7, 'w']];
  let n = seconds / 60;
  let unit = 'm';
  for (const [size, next] of steps.slice(1)) {
    if (n < size) break;
    n /= size;
    unit = next;
  }
  return `${Math.floor(n)}${unit} ago`;
}

export default Following;
