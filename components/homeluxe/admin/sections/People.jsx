import React, { useMemo, useState } from 'react';

import {
  Async, Button, DataTable, Panel, Pill, useAsync, when, groupBy,
} from '../ui';

/**
 * Users, roles and what each role may do (sections 7, 8, 9).
 *
 * THE PERMISSION TABLE IS THE INTERESTING HALF. A list of people with a role
 * next to each name tells you nothing about what that role can actually do,
 * and "admin" means whatever the policies say it means. So the roles are
 * shown with their permissions expanded, read from `role_permissions` -- the
 * same rows the database checks -- rather than from a paragraph in a document
 * that will drift from the schema within a month.
 *
 * Changing somebody's role is deliberately blunt and deliberately audited.
 * There is no confirmation dialog on the way in and no way to grant yourself
 * anything: the update runs under the caller's own row-level security, so a
 * shop manager trying to make themselves a platform admin is refused by the
 * database rather than by this screen being careful.
 */
const People = ({ data, canManage, me }) => {
  const people = useAsync(() => data.people(), [data]);
  const roles = useAsync(() => data.roles(), [data]);
  const permissions = useAsync(() => data.rolePermissions(), [data]);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);

  const byRole = useMemo(
    () => groupBy(permissions.data ?? [], 'role_code'),
    [permissions.data]
  );

  const setRole = async (person, role) => {
    setBusy(person.id);
    setProblem(null);
    try {
      await data.setPersonRole(person.id, role);
      people.refresh();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Panel
        title="People"
        subtitle="Who can sign in, and what they are. Changing a role takes effect on their next request."
      >
        {problem && <p className="ad-note bad">{problem}</p>}
        <Async state={people} empty="Nobody has signed up yet.">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(p) => p.id}
              columns={[
                {
                  key: 'display_name',
                  header: 'Person',
                  render: (p) => (
                    <>
                      <strong>{p.display_name || '(no name)'}</strong>
                      {p.id === me && <Pill tone="warn">you</Pill>}
                      <div className="ad-dim mono">{p.id.slice(0, 8)}</div>
                    </>
                  ),
                },
                {
                  key: 'role',
                  header: 'Role',
                  render: (p) => (
                    <Pill tone={p.role === 'platform_admin' ? 'good' : ''}>{p.role}</Pill>
                  ),
                },
                { key: 'phone', header: 'Phone', render: (p) => p.phone || '—' },
                { key: 'created_at', header: 'Joined', render: (p) => when(p.created_at) },
                {
                  key: 'actions',
                  header: '',
                  align: 'right',
                  render: (p) => canManage && (
                    <select
                      value={p.role}
                      disabled={busy === p.id}
                      onChange={(e) => setRole(p, e.target.value)}
                    >
                      {['visitor', 'shop_manager', 'platform_admin'].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ),
                },
              ]}
            />
          )}
        </Async>
      </Panel>

      <Panel
        title="Roles"
        subtitle="Read from role_permissions — the same rows the database checks, not a description of them."
      >
        <Async state={roles} empty="No roles defined.">
          {(rows) => (
            <div className="ad-roles">
              {rows.map((role) => {
                const granted = (byRole.get(role.code) ?? []).map((r) => r.permission_code);
                return (
                  <article key={role.code} className="ad-role">
                    <header>
                      <strong>{role.name}</strong>
                      <Pill>{role.scope}</Pill>
                      <span className="ad-dim">{granted.length} permission(s)</span>
                    </header>
                    {role.description && <p className="ad-dim">{role.description}</p>}
                    <ul className="ad-perms">
                      {granted.sort().map((p) => <li key={p} className="mono">{p}</li>)}
                      {granted.length === 0 && (
                        <li className="ad-dim">Nothing granted — this role can only read what is public.</li>
                      )}
                    </ul>
                  </article>
                );
              })}
            </div>
          )}
        </Async>
      </Panel>
    </>
  );
};

export default People;
