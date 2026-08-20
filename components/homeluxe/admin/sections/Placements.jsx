import React, { useState } from 'react';

import {
  Async, Button, DataTable, Panel, Pill, Search, useAsync, useFilter, mm, when,
} from '../ui';

/**
 * What is standing where (section 36).
 *
 * The slot screen answers "what is for sale". This one answers "what did we
 * sell", including the rows the slot screen deliberately hides: a placement
 * that has been REMOVED is not gone, it is retired, and being able to see it
 * is the point of retiring rather than deleting. Section 60.
 *
 * Note the coordinates. A placement may carry its own, or inherit its slot's
 * -- `v_live_placements` coalesces the two -- so a blank here means "wherever
 * the slot is", which is the normal case and not a missing value.
 */
const Placements = ({ data, canManage }) => {
  const placements = useAsync(() => data.placements(), [data]);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const [showEnded, setShowEnded] = useState(false);

  const rows = (placements.data ?? []).filter(
    (p) => showEnded || p.status !== 'removed'
  );
  const { term, setTerm, filtered } = useFilter(rows, ['status', 'note']);

  const setStatus = async (placement, status) => {
    setBusy(placement.id);
    setProblem(null);
    try {
      await data.setPlacementStatus(placement.id, status);
      placements.refresh();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(null);
    }
  };

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (p) => (
        <>
          <strong>{p.product_variants?.products?.name ?? '—'}</strong>
          <div className="ad-dim">{p.shops?.name}</div>
        </>
      ),
    },
    {
      key: 'slot',
      header: 'Position',
      render: (p) => (
        <>
          {p.placement_slots?.label ?? '—'}
          <div className="ad-dim mono">
            {p.placement_slots?.external_id ?? p.placement_slots?.code ?? ''}
          </div>
        </>
      ),
    },
    {
      key: 'where',
      header: 'At',
      render: (p) =>
        p.x_mm == null
          ? <span className="ad-dim">wherever the slot is</span>
          : <span className="mono ad-dim">{mm(p.x_mm)}, {mm(p.y_mm)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Pill tone={p.status === 'live' ? 'good' : p.status === 'removed' ? '' : 'warn'}>
          {p.status}
        </Pill>
      ),
    },
    { key: 'note', header: 'Note', render: (p) => p.note || <span className="ad-dim">—</span> },
    { key: 'updated_at', header: 'Changed', render: (p) => when(p.updated_at ?? p.created_at) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => canManage && (
        p.status === 'live' ? (
          <Button tone="danger" disabled={busy === p.id} onClick={() => setStatus(p, 'removed')}>
            Take out
          </Button>
        ) : (
          <Button disabled={busy === p.id} onClick={() => setStatus(p, 'live')}>
            Put back
          </Button>
        )
      ),
    },
  ];

  const live = (placements.data ?? []).filter((p) => p.status === 'live').length;

  return (
    <Panel
      title="Placements"
      subtitle={`${live} live. Taking one out retires it — the row stays, so the analytics that reference it still resolve.`}
      actions={
        <>
          <Search value={term} onChange={setTerm} placeholder="Search…" />
          <label className="ad-check">
            <input
              type="checkbox"
              checked={showEnded}
              onChange={(e) => setShowEnded(e.target.checked)}
            />
            Include retired
          </label>
        </>
      }
    >
      {problem && <p className="ad-note bad">{problem}</p>}
      <Async state={placements} empty="Nothing is placed. Fill a slot from the Slots screen.">
        {() => <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id} />}
      </Async>
    </Panel>
  );
};

export default Placements;
