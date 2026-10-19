import React, { useState } from 'react';

import {
  Async, Button, DataTable, Panel, Pill, useAsync, when,
} from '../ui';

/**
 * Campaigns and the rotation (sections 37, 38, 86, 87).
 *
 * A CAMPAIGN IS A SCHEDULED RUN, not a folder. It has a start and an end, and
 * the point of both is that nobody has to remember to take the summer sale
 * down in March. draft, scheduled, live, paused, ended -- explicit states,
 * because "is this running?" must not be a question you answer by reading two
 * dates and doing the arithmetic yourself.
 *
 * Underneath sits the batch rotation, which is the other half of the business
 * model: the house has 131 positions and more shops than that will want them,
 * so shops take turns. `v_batch_schedule` says who is up now.
 */
const Campaigns = ({ data, canManage, shops }) => {
  const campaigns = useAsync(() => data.campaigns(), [data]);
  const batches = useAsync(() => data.batches(), [data]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);

  const setStatus = async (campaign, status) => {
    setBusy(campaign.id);
    setProblem(null);
    try {
      await data.setCampaignStatus(campaign.id, status);
      campaigns.refresh();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Panel
        title="Campaigns"
        subtitle="A run with a start and an end, so nothing has to be taken down by hand."
        actions={
          canManage && (
            <Button tone="primary" onClick={() => setEditing({})}>New campaign</Button>
          )
        }
      >
        {problem && <p className="ad-note bad">{problem}</p>}
        <Async
          state={campaigns}
          empty="No campaigns yet. A campaign groups placements that go live and come down together."
        >
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(c) => c.id}
              columns={[
                {
                  key: 'name',
                  header: 'Campaign',
                  render: (c) => (
                    <>
                      <strong>{c.name}</strong>
                      <div className="ad-dim">{c.shops?.name}</div>
                    </>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (c) => (
                    <Pill tone={c.status === 'live' ? 'good' : c.status === 'ended' ? '' : 'warn'}>
                      {c.status}
                    </Pill>
                  ),
                },
                { key: 'starts_at', header: 'From', render: (c) => when(c.starts_at) },
                { key: 'ends_at', header: 'Until', render: (c) => when(c.ends_at) },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (c) => canManage && (
                    <>
                      <Button disabled={busy === c.id} onClick={() => setEditing(c)}>Edit</Button>
                      {c.status === 'live' ? (
                        <Button tone="danger" disabled={busy === c.id}
                                onClick={() => setStatus(c, 'ended')}>End</Button>
                      ) : (
                        <Button tone="primary" disabled={busy === c.id}
                                onClick={() => setStatus(c, 'live')}>Go live</Button>
                      )}
                    </>
                  ),
                },
              ]}
            />
          )}
        </Async>
      </Panel>

      <Panel
        title="Rotation"
        subtitle="The house has a fixed number of positions and more shops than positions. This is whose turn it is."
      >
        <Async state={batches} empty="No batches defined.">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(b) => b.id}
              columns={[
                {
                  key: 'name',
                  header: 'Batch',
                  render: (b) => (
                    <>
                      <strong>{b.name}</strong>
                      <div className="ad-dim mono">{b.code}</div>
                    </>
                  ),
                },
                { key: 'day_part', header: 'When' },
                {
                  key: 'live_now',
                  header: '',
                  render: (b) => b.live_now
                    ? <Pill tone="good">up now</Pill>
                    : <Pill>waiting</Pill>,
                },
                { key: 'starts_on', header: 'From', render: (b) => b.starts_on ?? '—' },
                { key: 'ends_on', header: 'Until', render: (b) => b.ends_on ?? '—' },
                { key: 'shop_count', header: 'Shops', align: 'right' },
                { key: 'placement_count', header: 'Placements', align: 'right' },
                {
                  key: 'shops',
                  header: 'Who',
                  render: (b) => (
                    <span className="ad-dim">
                      {Array.isArray(b.shops) ? b.shops.join(', ') : b.shops ?? '—'}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Async>
      </Panel>

      {editing && (
        <CampaignDialog
          campaign={editing}
          shops={shops}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); campaigns.refresh(); }}
        />
      )}
    </>
  );
};

const CampaignDialog = ({ campaign, shops, data, onClose, onSaved }) => {
  const [form, setForm] = useState({
    id: campaign.id,
    name: campaign.name ?? '',
    shopId: campaign.shop_id ?? shops[0]?.id ?? '',
    startsAt: campaign.starts_at?.slice(0, 10) ?? '',
    endsAt: campaign.ends_at?.slice(0, 10) ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await data.saveCampaign(form);
      onSaved();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-backdrop" onClick={busy ? undefined : onClose}>
      <div className="ad-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="ad-panel-head">
          <h2>{campaign.id ? 'Edit campaign' : 'New campaign'}</h2>
          <button type="button" className="ad-close" onClick={onClose} disabled={busy}>✕</button>
        </header>

        <form className="ad-form" onSubmit={submit}>
          <label className="ad-field">
            <span>Shop</span>
            <select
              value={form.shopId}
              onChange={(e) => setForm({ ...form, shopId: e.target.value })}
              required
            >
              {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <label className="ad-field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Winter sale"
              required
            />
          </label>

          <div className="ad-grid-3">
            <label className="ad-field">
              <span>Starts</span>
              <input type="date" value={form.startsAt}
                     onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            </label>
            <label className="ad-field">
              <span>Ends</span>
              <input type="date" value={form.endsAt}
                     onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
            </label>
          </div>
          <em className="ad-hint">
            Leaving the end date empty means it runs until somebody ends it.
            That is a decision, not a default — a campaign nobody remembers to
            stop is how last summer&apos;s prices end up on the wall in March.
          </em>

          {problem && <p className="ad-note bad">{problem}</p>}

          <footer className="ad-dialog-foot">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <button type="submit" className="ad-btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default Campaigns;
