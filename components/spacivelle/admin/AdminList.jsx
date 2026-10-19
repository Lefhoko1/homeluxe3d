import React, { useCallback, useEffect, useState } from 'react';

import { ProductService } from '../../../lib/admin/ProductService';
import './admin.css';

/**
 * Everything the signed-in user may manage, live or not.
 *
 * This reads `v_admin_products`, which is the mirror image of the catalogue
 * view: it shows drafts, products with no model, and products nobody has
 * placed. Those are exactly the rows that need attention, and every one of
 * them is invisible to `v_live_placements` by design.
 *
 * "Place" is the interesting button. It does not write anything -- it hands
 * the variant to the 3D view, which loads the model, drops it in front of the
 * camera and attaches the gizmo. Nothing reaches the database until the admin
 * presses Save, so a mis-click costs nothing.
 */
/**
 * @param {{
 *   shops?: Array<any>,
 *   onClose?: () => void,
 *   onPlace?: (chosen: {product: any, variant: any}) => void,
 *   inline?: boolean,
 * }} props
 */
const AdminList = ({ shops = [], onClose, onPlace, inline = false }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shopId, setShopId] = useState('');
  const [busyId, setBusyId] = useState(null);

  const service = React.useMemo(() => new ProductService(), []);

  const refresh = useCallback(() => {
    setLoading(true);
    service
      .list({ shopId: shopId || null })
      .then((data) => { setRows(data); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [service, shopId]);

  useEffect(refresh, [refresh]);

  const setStatus = async (row, status) => {
    setBusyId(row.product_id);
    try {
      await service.setStatus(row.product_id, status);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    // Deleting cascades to variants, media, room types and placements, and
    // takes the uploaded files with it. Worth one confirmation.
    if (!window.confirm(
      `Delete "${row.name}" permanently?\n\n` +
      `This also removes its model, its images and any placement of it in ` +
      `the house. It cannot be undone.`
    )) return;

    setBusyId(row.product_id);
    try {
      await service.remove(row.product_id);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const place = async (row) => {
    setBusyId(row.product_id);
    try {
      const variants = await service.variants(row.product_id);
      const variant = variants.find((v) => v.model_url);
      if (!variant) {
        setError(`"${row.name}" has no model to place.`);
        return;
      }
      onPlace?.({ product: row, variant });
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const body = (
    <>
      <div className="admin-modal-head">
        <h2>Products</h2>
        <select value={shopId} onChange={(e) => setShopId(e.target.value)}>
          <option value="">All shops</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {!inline && (
          <button type="button" className="admin-close" onClick={onClose}>✕</button>
        )}
      </div>

      {error && <div className="admin-note bad">{error}</div>}
      {loading && <div className="admin-note">Loading…</div>}

      {!loading && rows.length === 0 && (
        <div className="admin-note">
          Nothing here yet. Upload a model to get started.
        </div>
      )}

      <div className="admin-table">
        {rows.map((row) => (
            <div className="admin-row" key={row.product_id}>
              <div className="admin-row-thumb">
                {row.thumbnail_url
                  ? <img src={row.thumbnail_url} alt="" />
                  : <span className="admin-row-noimg">no image</span>}
              </div>

              <div className="admin-row-main">
                <div className="admin-row-name">
                  {row.name}
                  <span className={`admin-status ${row.status}`}>{row.status}</span>
                </div>
                <div className="admin-row-meta">
                  {row.shop_name} · {row.category_code}
                  {row.room_types?.length ? ` · ${row.room_types.join(', ')}` : ''}
                </div>
                <div className="admin-row-meta">
                  {/* The three facts that decide whether it can appear in the
                      house at all, so a product that cannot is obvious. */}
                  {row.model_count > 0 ? '✓ model' : '✗ no model'}
                  {' · '}
                  {row.media_count > 0 ? `${row.media_count} image(s)` : 'no images'}
                  {' · '}
                  {row.live_placements > 0
                    ? `placed ${row.live_placements}×`
                    : 'not placed'}
                </div>
              </div>

              <div className="admin-row-actions">
                {/* Only where there is a scene to place into. The standalone
                    admin page has none, so the button is absent rather than
                    present and silently doing nothing. */}
                {onPlace && (
                  <button
                    type="button"
                    className="admin-btn primary"
                    disabled={busyId === row.product_id || row.model_count === 0}
                    onClick={() => place(row)}
                  >
                    Place in house
                  </button>
                )}
                <button
                  type="button"
                  className="admin-btn"
                  disabled={busyId === row.product_id}
                  onClick={() =>
                    setStatus(row, row.status === 'published' ? 'draft' : 'published')
                  }
                >
                  {row.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  className="admin-btn danger"
                  disabled={busyId === row.product_id}
                  onClick={() => remove(row)}
                >
                  Delete
                </button>
              </div>
            </div>
        ))}
      </div>
    </>
  );

  // The same list serves two places: an overlay inside the showroom, and the
  // whole of /admin. Only the frame differs.
  if (inline) return <div className="admin-modal wide inline">{body}</div>;

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal wide" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
};

export default AdminList;
