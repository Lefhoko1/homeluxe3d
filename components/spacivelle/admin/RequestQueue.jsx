import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  RequestService,
  NEXT_STEPS,
  STATE_LABELS,
} from '../../../lib/admin/RequestService';
import './admin.css';

/**
 * Work shops have asked us to make for them.
 *
 * The upload dialog next door assumes a shop that can produce a .glb. Most
 * cannot and will not: they send photographs and a price list and expect the
 * bed to appear in the house. That is not a shortcoming of the pipeline, it
 * is the larger half of the business, and until now the system had no way to
 * even write it down.
 *
 * SO THIS IS A WORK QUEUE, NOT A REPORT. Every row shows the one thing that
 * decides what happens next -- whether the ball is with us or with them --
 * and offers only the moves that are legal from where the request stands.
 * Those moves come from NEXT_STEPS, which mirrors the trigger in migration
 * 0011; the database refuses anything else regardless of what is on screen.
 */
/**
 * @param {{
 *   shops?: Array<any>,
 *   onOpenProduct?: (productId: string) => void,
 * }} props
 */
const RequestQueue = ({ shops = [], onOpenProduct }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shopId, setShopId] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [raising, setRaising] = useState(false);

  const service = useMemo(() => new RequestService(), []);

  const refresh = useCallback(() => {
    setLoading(true);
    service
      .queue({ shopId: shopId || null })
      .then((data) => { setRows(data); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [service, shopId]);

  useEffect(refresh, [refresh]);

  const move = async (row, status) => {
    // Delivery is the one move that needs something to exist. Rather than let
    // the database refuse it and show the refusal as an error, ask for the
    // product here -- the operator knows which one they just made.
    let productId = null;
    if (status === 'delivered') {
      productId = row.product_id ?? window.prompt(
        `Which product did "${row.title}" produce?\n\n` +
        `Paste its id. A request cannot be delivered without one -- ` +
        `otherwise "delivered" only means somebody changed a dropdown.`
      );
      if (!productId) return;
    }

    setBusyId(row.id);
    try {
      await service.advance(row.id, status, { productId });
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-modal wide inline">
      <div className="admin-modal-head">
        <h2>Made to order</h2>
        <select value={shopId} onChange={(e) => setShopId(e.target.value)}>
          <option value="">All shops</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="admin-btn primary"
          onClick={() => setRaising(true)}
        >
          Take a request
        </button>
      </div>

      {error && <div className="admin-note bad">{error}</div>}
      {loading && <div className="admin-note">Loading…</div>}

      {!loading && rows.length === 0 && (
        <div className="admin-note">
          Nothing waiting. When a shop asks for something to be modelled rather
          than uploading it themselves, it appears here.
        </div>
      )}

      <div className="admin-table">
        {rows.map((row) => {
          const overdue = row.due_on && new Date(row.due_on) < new Date();
          return (
            <div className="admin-row" key={row.id}>
              <div className="admin-row-main">
                <div className="admin-row-name">
                  {row.title}
                  <span className={`admin-status req-${row.status}`}>
                    {STATE_LABELS[row.status] ?? row.status}
                  </span>
                  {overdue && <span className="admin-status bad">overdue</span>}
                </div>
                <div className="admin-row-meta">
                  {row.shop_name}
                  {row.category_code ? ` · ${row.category_code}` : ''}
                  {` · priority ${row.priority}`}
                  {row.due_on ? ` · due ${row.due_on}` : ''}
                </div>
                <div className="admin-row-meta">
                  {/* Whether we can start at all. A request with no
                      photographs is the commonest reason work stalls, and it
                      is invisible unless a row says so. */}
                  {row.reference_count > 0
                    ? `${row.reference_count} reference(s)`
                    : '✗ nothing to work from'}
                  {' · '}
                  {row.assigned_name ? `with ${row.assigned_name}` : 'unassigned'}
                </div>
              </div>

              <div className="admin-row-actions">
                {(NEXT_STEPS[row.status] ?? []).map(([status, label], i) => (
                  <button
                    key={status}
                    type="button"
                    className={
                      'admin-btn' +
                      (i === 0 ? ' primary' : '') +
                      (status === 'rejected' ? ' danger' : '')
                    }
                    disabled={busyId === row.id}
                    onClick={() => move(row, status)}
                  >
                    {label}
                  </button>
                ))}
                {row.product_id && onOpenProduct && (
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => onOpenProduct(row.product_id)}
                  >
                    See the product
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {raising && (
        <RaiseDialog
          shops={shops}
          service={service}
          onClose={() => setRaising(false)}
          onRaised={() => { setRaising(false); refresh(); }}
        />
      )}
    </div>
  );
};

/**
 * Taking down what a shop asked for, usually while they are on the phone.
 *
 * ONLY THE SHOP AND THE TITLE ARE REQUIRED. A form that has to be complete
 * before it can be submitted is the thing the phone call was instead of, and
 * a request that cannot be written down until every dimension is known will
 * get written on paper. Missing details are what `awaiting_info` is for.
 */
/**
 * @param {{
 *   shops: Array<any>,
 *   service: import('../../../lib/admin/RequestService').RequestService,
 *   onClose: () => void,
 *   onRaised: () => void,
 * }} props
 */
const RaiseDialog = ({ shops, service, onClose, onRaised }) => {
  const [shopId, setShopId] = useState(shops[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [references, setReferences] = useState('');
  const [price, setPrice] = useState('');
  const [dimensions, setDimensions] = useState({ width: '', depth: '', height: '' });
  const [dueOn, setDueOn] = useState('');
  const [priority, setPriority] = useState(50);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await service.raise({
        shopId,
        title,
        brief,
        referenceUrls: references.split(/\s+/).filter(Boolean),
        quotedPriceCents: price ? Math.round(Number(price) * 100) : null,
        dimensions,
        dueOn: dueOn || null,
        priority: Number(priority),
      });
      onRaised();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <h2>Take a request</h2>
          <button
            type="button"
            className="admin-close"
            onClick={onClose}
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <form className="admin-form" onSubmit={submit}>
          <label className="admin-field">
            <span className="admin-label">Shop</span>
            <select
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              required
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-label">What do they want made?</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Slumberland Vitality King bed set"
              required
            />
          </label>

          <label className="admin-field">
            <span className="admin-label">Anything they said about it</span>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="Pillow-top, charcoal base, wants it in the master bedroom"
            />
          </label>

          <label className="admin-field">
            <span className="admin-label">
              Photographs or a web page, one per line
            </span>
            <textarea
              value={references}
              onChange={(e) => setReferences(e.target.value)}
              rows={2}
            />
            <span className="admin-hint">
              This is what the model gets made FROM. A request with none of it
              cannot be started, and the queue says so on the row.
            </span>
          </label>

          <div className="admin-grid-3">
            <label className="admin-field">
              <span className="admin-label">Their price (pula)</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Due</span>
              <input
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Priority</span>
              <input
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </label>
          </div>

          <div className="admin-grid-3">
            {['width', 'depth', 'height'].map((axis) => (
              <label className="admin-field" key={axis}>
                <span className="admin-label">{axis} (mm)</span>
                <input
                  value={dimensions[axis]}
                  onChange={(e) =>
                    setDimensions({ ...dimensions, [axis]: e.target.value })
                  }
                  inputMode="numeric"
                />
              </label>
            ))}
          </div>
          <span className="admin-hint">
            Measurements are worth asking for even roughly: they are what the
            finished model is checked against, and they are how a model
            exported in the wrong units gets caught before anyone sees it.
          </span>

          {problem && <div className="admin-note bad">{problem}</div>}

          <div className="admin-modal-foot">
            <button
              type="button"
              className="admin-btn"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="admin-btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Add to the queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RequestQueue;
