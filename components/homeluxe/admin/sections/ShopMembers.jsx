import React, { useState } from 'react';

import { Async, Button, DataTable, Panel, Pill, useAsync, when } from '../ui';

/**
 * Who runs a shop (section 47, "Manage members").
 *
 * `can_manage_shop` has asked "are you a member with role owner or manager,
 * OR a platform admin" since migration 0004, and `shop_members` has been
 * empty the whole time -- so only the second half has ever been true and the
 * platform has been running every shop by hand. That is workable for three
 * shops and impossible for thirty.
 *
 * ADDED BY EMAIL, because that is the only thing an operator has. Nobody
 * knows a colleague's uuid, `profiles` carries no address, and `auth.users`
 * is not readable from a browser and should not be. The lookup happens inside
 * `invite_shop_member`, which checks the caller may manage the shop before it
 * goes anywhere near the users table.
 *
 * The roles are not decoration. `owner` and `manager` satisfy
 * `can_manage_shop` and can therefore change products, placements and
 * members; `staff` cannot, and exists so somebody can be given a login and a
 * view without being given the shop.
 */
const ShopMembers = ({ data, shop, onClose }) => {
  const members = useAsync(() => data.shopMembers(shop.id), [data, shop.id]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null);

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    setDone(null);
    try {
      await data.inviteMember(shop.id, email.trim(), role);
      setDone(`${email.trim()} can now work on ${shop.name}.`);
      setEmail('');
      members.refresh();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member) => {
    if (!window.confirm(
      `Remove ${member.display_name || 'this person'} from ${shop.name}?\n\n` +
      `Their account stays; they lose access to this shop.`
    )) return;

    setBusy(true);
    setProblem(null);
    try {
      await data.removeMember(shop.id, member.user_id);
      members.refresh();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-backdrop" onClick={busy ? undefined : onClose}>
      <div className="ad-dialog wide" onClick={(e) => e.stopPropagation()}>
        <header className="ad-panel-head">
          <div>
            <h2>{shop.name} — members</h2>
            <p className="ad-sub">
              Owners and managers can change this shop&apos;s products, placements
              and members. Staff can sign in and look.
            </p>
          </div>
          <button type="button" className="ad-close" onClick={onClose} disabled={busy}>✕</button>
        </header>

        <form className="ad-publish" onSubmit={invite}>
          <input
            className="ad-search grow"
            type="email"
            value={email}
            placeholder="Their email address"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </select>
          <button type="submit" className="ad-btn primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
        <p className="ad-hint">
          They need a HomeLuxe account already — this grants access, it does not
          create people.
        </p>

        {problem && <p className="ad-note bad">{problem}</p>}
        {done && <p className="ad-note good">{done}</p>}

        <Async
          state={members}
          empty="Nobody yet. Until somebody is added, only a platform admin can run this shop."
        >
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(m) => m.user_id}
              columns={[
                {
                  key: 'display_name',
                  header: 'Person',
                  render: (m) => (
                    <>
                      <strong>{m.display_name || '(no name)'}</strong>
                      {m.platform_role === 'platform_admin' && (
                        <Pill tone="good">platform admin</Pill>
                      )}
                    </>
                  ),
                },
                {
                  key: 'role',
                  header: 'Role',
                  render: (m) => (
                    <Pill tone={m.role === 'owner' ? 'good' : m.role === 'manager' ? 'warn' : ''}>
                      {m.role}
                    </Pill>
                  ),
                },
                {
                  key: 'can',
                  header: 'Can change things',
                  render: (m) =>
                    m.role === 'staff'
                      ? <span className="ad-dim">no — can sign in and look</span>
                      : 'yes',
                },
                { key: 'created_at', header: 'Since', render: (m) => when(m.created_at) },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (m) => (
                    <Button tone="danger" disabled={busy} onClick={() => remove(m)}>
                      Remove
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Async>
      </div>
    </div>
  );
};

export default ShopMembers;
