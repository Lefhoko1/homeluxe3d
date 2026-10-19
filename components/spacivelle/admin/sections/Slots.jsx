import React, { useMemo, useState } from 'react';

import {
  Async, Button, DataTable, Panel, Pill, Search, useAsync, useFilter,
  mm, money, when,
} from '../ui';

/**
 * The advertising inventory, and the slot inspector (sections 50, 51).
 *
 * THIS IS THE SCREEN THE BUSINESS RUNS ON. The house is 131 positions; some
 * are sold and most are not, and the question an operator asks all day is
 * "what is free, and what would fit in it". A list of what is PLACED cannot
 * answer that, which is why the query left-joins: a slot with nothing in it
 * is not an absence, it is the product.
 *
 * Clicking a row opens the inspector the specification describes -- id, room,
 * type, status, what is in it, what may go in it, and the two actions that
 * matter: put something in, take it out.
 */
const Slots = ({ data, canManage }) => {
  const [roomCode, setRoomCode] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);
  const [selected, setSelected] = useState(null);

  const rooms = useAsync(() => data.rooms(), [data]);
  const slots = useAsync(
    () => data.slots({ roomCode: roomCode || null }),
    [data, roomCode]
  );

  const rows = useMemo(() => {
    const all = slots.data ?? [];
    return onlyFree ? all.filter((s) => !s.placementId) : all;
  }, [slots.data, onlyFree]);

  const { term, setTerm, filtered } = useFilter(rows, [
    'code', 'external_id', 'label', 'room', 'category_code', 'productName',
  ]);

  const sold = (slots.data ?? []).filter((s) => s.placementId).length;
  const total = (slots.data ?? []).length;

  const columns = [
    {
      key: 'code',
      header: 'Slot',
      render: (s) => (
        <>
          <strong>{s.label || s.code}</strong>
          <div className="ad-dim mono">{s.external_id || s.code}</div>
        </>
      ),
    },
    { key: 'room', header: 'Room' },
    {
      key: 'category_code',
      header: 'Takes',
      render: (s) => s.category_code || <span className="ad-dim">anything</span>,
    },
    {
      key: 'envelope',
      header: 'Fits up to',
      render: (s) =>
        s.max_width_mm
          ? <span className="ad-dim">{mm(s.max_width_mm)} × {mm(s.max_depth_mm)}</span>
          : <span className="ad-dim">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) =>
        s.placementId
          ? <Pill tone="good">sold</Pill>
          : <Pill>free</Pill>,
    },
    {
      key: 'productName',
      header: 'Currently',
      render: (s) =>
        s.productName
          ? <>{s.productName}<div className="ad-dim">{s.shopName}</div></>
          : <span className="ad-dim">empty</span>,
    },
    {
      key: 'priority',
      header: 'Priority',
      align: 'right',
      render: (s) => (
        <>
          {s.priority ?? '—'}
          {s.is_premium && <Pill tone="warn">premium</Pill>}
        </>
      ),
    },
  ];

  return (
    <>
      <Panel
        title="Slots"
        subtitle={
          total
            ? `${sold} of ${total} positions sold — ${total - sold} still for sale.`
            : 'Positions a shop can buy.'
        }
        actions={
          <>
            <Search value={term} onChange={setTerm} placeholder="Search slots…" />
            <select value={roomCode} onChange={(e) => setRoomCode(e.target.value)}>
              <option value="">Every room</option>
              {(rooms.data ?? []).map((r) => (
                <option key={r.id} value={r.code}>{r.name}</option>
              ))}
            </select>
            <label className="ad-check">
              <input
                type="checkbox"
                checked={onlyFree}
                onChange={(e) => setOnlyFree(e.target.checked)}
              />
              Only free
            </label>
          </>
        }
      >
        <Async
          state={slots}
          empty="No slots in this room. The house is authored in Blender — see config/slots_3bed.py."
        >
          {() => (
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(s) => s.id}
              onRowClick={setSelected}
              selectedKey={selected?.id}
            />
          )}
        </Async>
      </Panel>

      {selected && (
        <SlotInspector
          slot={selected}
          data={data}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onChanged={() => { slots.refresh(); setSelected(null); }}
        />
      )}
    </>
  );
};

/**
 * The slot inspector (section 51).
 *
 * Everything the specification asks for: the id, the room, the type, what is
 * in it, what may go in it, and its history.
 */
const SlotInspector = ({ slot, data, canManage, onClose, onChanged }) => {
  const history = useAsync(() => data.slotHistory(slot.id), [data, slot.id]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [picking, setPicking] = useState(false);

  const clear = async () => {
    if (!window.confirm(
      `Take "${slot.productName}" out of ${slot.label || slot.code}?\n\n` +
      `The placement is retired rather than deleted, so the analytics that ` +
      `reference it still resolve and you can see what used to be here.`
    )) return;

    setBusy(true);
    setProblem(null);
    try {
      await data.clearSlot(slot.placementId);
      onChanged();
    } catch (e) {
      setProblem(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="ad-backdrop" onClick={busy ? undefined : onClose}>
      <div className="ad-dialog wide" onClick={(e) => e.stopPropagation()}>
        <header className="ad-panel-head">
          <div>
            <h2>{slot.label || slot.code}</h2>
            <p className="ad-sub mono">{slot.external_id || slot.code}</p>
          </div>
          <button type="button" className="ad-close" onClick={onClose} disabled={busy}>✕</button>
        </header>

        <dl className="ad-facts">
          <div><dt>Room</dt><dd>{slot.room}</dd></div>
          <div><dt>Kind</dt><dd>{slot.kind ?? '—'}</dd></div>
          <div><dt>Takes</dt><dd>{slot.category_code || 'anything'}</dd></div>
          <div><dt>Room type</dt><dd>{slot.room_type ?? '—'}</dd></div>
          <div>
            <dt>Fits up to</dt>
            <dd>
              {slot.max_width_mm
                ? `${mm(slot.max_width_mm)} × ${mm(slot.max_depth_mm)} × ${mm(slot.max_height_mm)}`
                : 'unconstrained'}
            </dd>
          </div>
          <div>
            <dt>Stands at</dt>
            <dd className="mono">
              {mm(slot.x_mm)}, {mm(slot.y_mm)}
              {Number(slot.z_mm) ? ` (${mm(slot.z_mm)} up)` : ''}
              {' · '}{Math.round(Number(slot.rotation_deg ?? 0))}°
            </dd>
          </div>
          <div><dt>Priority</dt><dd>{slot.priority ?? '—'}</dd></div>
          <div>
            <dt>Authored</dt>
            <dd>
              {slot.origin === 'blender'
                ? 'In Blender — structural'
                : slot.origin ?? '—'}
            </dd>
          </div>
          {slot.base_price_cents != null && (
            <div><dt>Rate</dt><dd>{money(slot.base_price_cents)}</dd></div>
          )}
        </dl>

        <div className="ad-inspector-now">
          <h3 className="ad-h3">Currently</h3>
          {slot.productName ? (
            <p>
              <strong>{slot.productName}</strong>
              {slot.variantName ? ` · ${slot.variantName}` : ''}
              <br />
              <span className="ad-dim">{slot.shopName}</span>
              {slot.note ? <><br /><span className="ad-dim">{slot.note}</span></> : null}
            </p>
          ) : (
            <p className="ad-dim">
              Empty. This is the position a shop buys — it exists whether or
              not anything is standing in it.
            </p>
          )}
        </div>

        {problem && <p className="ad-note bad">{problem}</p>}

        {canManage && (
          <div className="ad-dialog-foot left">
            {slot.placementId ? (
              <>
                <Button tone="danger" onClick={clear} disabled={busy}>
                  Clear slot
                </Button>
                <Button onClick={() => setPicking(true)} disabled={busy}>
                  Replace product
                </Button>
              </>
            ) : (
              <Button tone="primary" onClick={() => setPicking(true)} disabled={busy}>
                Place a product
              </Button>
            )}
          </div>
        )}

        <h3 className="ad-h3">History</h3>
        <Async state={history} empty="Nothing has been recorded against this slot yet.">
          {(rows) => (
            <ul className="ad-feed">
              {rows.map((r) => (
                <li key={r.id}>
                  <span className="ad-feed-when">{when(r.at)}</span>
                  <span className="ad-feed-what">{r.action}</span>
                </li>
              ))}
            </ul>
          )}
        </Async>

        {picking && (
          <ProductPicker
            slot={slot}
            data={data}
            onClose={() => setPicking(false)}
            onPlaced={onChanged}
          />
        )}
      </div>
    </div>
  );
};

/**
 * Choose what goes in (sections 55, 56, 58).
 *
 * The list is every published product, ordered so the ones this position is
 * FOR come first, and the ones that do not match are dimmed and pushed down
 * rather than hidden. That ordering is the whole of section 58 in miniature:
 * automation suggests, the admin decides. Hiding the mismatches would make
 * the screen decide.
 *
 * SORTED BY CATEGORY, NOT BY WHETHER IT PHYSICALLY FITS, and the difference
 * matters. `suggest_slots` in the database does the real check -- envelope,
 * room type, and a quarter turn -- but it answers the question the other way
 * round, given a product. Asking it once per product to sort this list would
 * be a query per row. The category match is the cheap approximation; the
 * database still refuses anything that genuinely will not go in, and that
 * refusal is shown rather than swallowed.
 */
const ProductPicker = ({ slot, data, onClose, onPlaced }) => {
  const products = useAsync(() => data.placeableProducts(), [data]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const { term, setTerm, filtered } = useFilter(products.data ?? [], ['name', 'slug']);

  const ranked = useMemo(() => {
    const list = [...filtered];
    const fits = (p) =>
      !slot.category_code || p.category_code === slot.category_code;
    return list.sort((a, b) => Number(fits(b)) - Number(fits(a)));
  }, [filtered, slot.category_code]);

  const place = async (product) => {
    const variant =
      product.product_variants?.find((v) => v.is_default) ??
      product.product_variants?.[0];
    if (!variant) {
      setProblem(`${product.name} has no variant to place.`);
      return;
    }

    setBusy(true);
    setProblem(null);
    try {
      // Replacing means the old one comes out first: two live placements in
      // one slot is the thing the seed spent three applies learning to avoid.
      if (slot.placementId) await data.clearSlot(slot.placementId);
      // The scene comes off the slot, which is why the query selects its id
      // and not just its slug: placements.scene_id is not null, and passing
      // undefined would fail at the database with a much worse message.
      await data.fillSlot({
        slotId: slot.id,
        variantId: variant.id,
        sceneId: slot.scenes.id,
        shopId: product.shop_id,
        note: 'Placed from the slot inspector',
      });
      onPlaced();
    } catch (e) {
      setProblem(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="ad-backdrop" onClick={busy ? undefined : onClose}>
      <div className="ad-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="ad-panel-head">
          <div>
            <h2>What goes in {slot.label || slot.code}?</h2>
            <p className="ad-sub">
              {slot.category_code
                ? `This position takes ${slot.category_code}. Anything else is offered below it.`
                : 'This position takes anything.'}
            </p>
          </div>
          <button type="button" className="ad-close" onClick={onClose} disabled={busy}>✕</button>
        </header>

        <Search value={term} onChange={setTerm} placeholder="Search products…" />
        {problem && <p className="ad-note bad">{problem}</p>}

        <Async state={products} empty="No published products to place.">
          {() => (
            <ul className="ad-picker">
              {ranked.map((p) => {
                const suits = !slot.category_code || p.category_code === slot.category_code;
                return (
                  <li key={p.id} className={suits ? '' : 'mismatch'}>
                    <div>
                      <strong>{p.name}</strong>
                      <div className="ad-dim">
                        {p.shops?.name} · {p.category_code}
                        {!suits && ' · not what this position is for'}
                      </div>
                    </div>
                    <Button
                      tone={suits ? 'primary' : ''}
                      disabled={busy}
                      onClick={() => place(p)}
                    >
                      Place
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Async>
      </div>
    </div>
  );
};

export default Slots;
