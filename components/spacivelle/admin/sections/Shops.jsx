import React, { useState } from 'react';

import ShopMembers from './ShopMembers';

import {
  Async, Button, DataTable, Panel, Pill, Search, useAsync, useFilter, when,
} from '../ui';

/**
 * Shops (section 47).
 *
 * SUSPENDING IS NOT DELETING, and the difference is the whole reason there is
 * a status column. `shop_is_live` sits in the read policy on products and
 * placements, so suspending a shop takes its products out of the house
 * immediately and puts them back untouched when it is reactivated. Nothing is
 * destroyed and no placement has to be rebuilt -- section 60.
 */
const Shops = ({ data, canManage }) => {
  const shops = useAsync(() => data.shops(), [data]);
  const [editing, setEditing] = useState(null);
  const [members, setMembers] = useState(null);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const { term, setTerm, filtered } = useFilter(shops.data ?? [], ['name', 'slug', 'city']);

  const setStatus = async (shop, status) => {
    setBusy(shop.id);
    setProblem(null);
    try {
      await data.setShopStatus(shop.id, status);
      shops.refresh();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(null);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Shop',
      render: (s) => (
        <>
          <strong>{s.name}</strong>
          <div className="ad-dim">{s.slug}{s.tagline ? ` · ${s.tagline}` : ''}</div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Pill tone={s.status === 'active' ? 'good' : 'bad'}>{s.status}</Pill>
      ),
    },
    {
      key: 'where',
      header: 'Where',
      render: (s) => [s.city, s.country].filter(Boolean).join(', ') || '—',
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (s) => (
        <div className="ad-dim">
          {s.email || '—'}
          {s.phone ? <><br />{s.phone}</> : null}
        </div>
      ),
    },
    { key: 'currency', header: 'Currency' },
    { key: 'created_at', header: 'Joined', render: (s) => when(s.created_at) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => canManage && (
        <>
          <Button onClick={() => setEditing(s)} disabled={busy === s.id}>Edit</Button>
          <Button onClick={() => setMembers(s)} disabled={busy === s.id}>Members</Button>
          {s.status === 'active' ? (
            <Button
              tone="danger"
              disabled={busy === s.id}
              onClick={() => setStatus(s, 'suspended')}
              title="Takes this shop's products out of the house. Nothing is deleted."
            >
              Suspend
            </Button>
          ) : (
            <Button
              tone="primary"
              disabled={busy === s.id}
              onClick={() => setStatus(s, 'active')}
            >
              Reactivate
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <Panel
      title="Shops"
      subtitle="Suspending a shop hides its products everywhere at once. It deletes nothing."
      actions={
        <>
          <Search value={term} onChange={setTerm} placeholder="Search shops…" />
          {canManage && (
            <Button tone="primary" onClick={() => setEditing({})}>New shop</Button>
          )}
        </>
      }
    >
      {problem && <p className="ad-note bad">{problem}</p>}
      <Async state={shops} empty="No shops yet. Create one to start selling positions.">
        {() => <DataTable columns={columns} rows={filtered} rowKey={(s) => s.id} />}
      </Async>

      {members && (
        <ShopMembers data={data} shop={members} onClose={() => setMembers(null)} />
      )}

      {editing && (
        <ShopDialog
          shop={editing}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); shops.refresh(); }}
        />
      )}
    </Panel>
  );
};

/**
 * Creating and editing.
 *
 * THE SLUG IS NOT COSMETIC. It is the first segment of every asset path --
 * `bears/slumberland-maharani-queen/default.glb` -- and the storage policy
 * checks the caller may manage the shop named there. Changing it on a shop
 * that already has uploads orphans them, so it is only editable while the
 * shop is new.
 */
const ShopDialog = ({ shop, data, onClose, onSaved }) => {
  const isNew = !shop.id;
  const [form, setForm] = useState({
    id: shop.id,
    name: shop.name ?? '',
    slug: shop.slug ?? '',
    tagline: shop.tagline ?? '',
    currency: shop.currency ?? 'BWP',
    city: shop.city ?? '',
    country: shop.country ?? 'Botswana',
    email: shop.email ?? '',
    phone: shop.phone ?? '',
    website: shop.website ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm((f) => ({
      ...f,
      [k]: value,
      // Offer a slug while it is still safe to change one.
      ...(k === 'name' && isNew && !f.slug
        ? { slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }
        : {}),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await data.saveShop(form);
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
          <h2>{isNew ? 'New shop' : `Edit ${shop.name}`}</h2>
          <button type="button" className="ad-close" onClick={onClose} disabled={busy}>✕</button>
        </header>

        <form className="ad-form" onSubmit={submit}>
          <label className="ad-field">
            <span>Name</span>
            <input value={form.name} onChange={set('name')} required />
          </label>

          <label className="ad-field">
            <span>Slug</span>
            <input
              value={form.slug}
              onChange={set('slug')}
              required
              disabled={!isNew}
              pattern="[a-z0-9-]+"
            />
            <em className="ad-hint">
              {isNew
                ? 'Lower case, no spaces. It becomes the first part of every file path this shop uploads.'
                : 'Fixed once the shop exists — every uploaded file is stored under it.'}
            </em>
          </label>

          <label className="ad-field">
            <span>Tagline</span>
            <input value={form.tagline} onChange={set('tagline')} />
          </label>

          <div className="ad-grid-3">
            <label className="ad-field">
              <span>City</span>
              <input value={form.city} onChange={set('city')} />
            </label>
            <label className="ad-field">
              <span>Country</span>
              <input value={form.country} onChange={set('country')} />
            </label>
            <label className="ad-field">
              <span>Currency</span>
              <input value={form.currency} onChange={set('currency')} maxLength={3} />
            </label>
          </div>

          <div className="ad-grid-3">
            <label className="ad-field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={set('email')} />
            </label>
            <label className="ad-field">
              <span>Phone</span>
              <input value={form.phone} onChange={set('phone')} />
            </label>
            <label className="ad-field">
              <span>Website</span>
              <input value={form.website} onChange={set('website')} />
            </label>
          </div>

          {problem && <p className="ad-note bad">{problem}</p>}

          <footer className="ad-dialog-foot">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <button type="submit" className="ad-btn primary" disabled={busy}>
              {busy ? 'Saving…' : isNew ? 'Create shop' : 'Save changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default Shops;
