import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminData } from '../../../lib/admin/AdminData';
import AdminList from './AdminList';
import RequestQueue from './RequestQueue';
import Analytics from './sections/Analytics';
import Assets from './sections/Assets';
import AuditLog from './sections/AuditLog';
import Campaigns from './sections/Campaigns';
import Dashboard from './sections/Dashboard';
import Materials from './sections/Materials';
import People from './sections/People';
import Placements from './sections/Placements';
import Publishing from './sections/Publishing';
import Shops from './sections/Shops';
import Slots from './sections/Slots';
import './admin.css';
import './shell.css';

/**
 * The admin application (section 45).
 *
 * ONE SHELL, MANY SECTIONS. The specification lists seventeen screens; what
 * makes them one application rather than seventeen pages is that they share a
 * data layer, a session and a frame. Each section is handed the same
 * `AdminData` and decides what to ask it -- none of them holds a Supabase
 * query of its own, so two screens cannot disagree about what "live" means.
 *
 * WHAT YOU SEE DEPENDS ON WHAT YOU ARE, and it is decided in two places on
 * purpose. This nav hides sections a shop manager has no business in, which
 * is courtesy; the database refuses the rows anyway, which is security. If
 * those two ever disagree the database wins and the screen shows the refusal,
 * which is the right way round -- a nav that hides a button is not a
 * permission system.
 *
 * The section lives in the URL hash, so a screen can be linked to, reloaded,
 * and gone back from. An admin who loses their place every time they refresh
 * stops using the deep parts of the tool.
 */

const SECTIONS = [
  { id: 'dashboard',  label: 'Dashboard',    group: '' },

  { id: 'slots',      label: 'Slots',        group: 'The house' },
  { id: 'placements', label: 'Placements',   group: 'The house' },
  { id: 'publishing', label: 'Publishing',   group: 'The house' },

  { id: 'products',   label: 'Products',     group: 'Catalogue' },
  { id: 'materials',  label: 'Materials',    group: 'Catalogue' },
  { id: 'assets',     label: 'Assets',       group: 'Catalogue' },
  { id: 'requests',   label: 'Made to order', group: 'Catalogue' },

  { id: 'shops',      label: 'Shops',        group: 'Commercial', platformOnly: true },
  { id: 'campaigns',  label: 'Campaigns',    group: 'Commercial' },
  { id: 'analytics',  label: 'Analytics',    group: 'Commercial' },

  { id: 'people',     label: 'People & roles', group: 'Platform', platformOnly: true },
  { id: 'audit',      label: 'Audit log',    group: 'Platform', platformOnly: true },
];

/**
 * @param {{
 *   session?: any,
 *   shops?: Array<any>,
 *   onSignOut?: () => void,
 * }} props
 */
const AdminShell = ({ session, shops = [], onSignOut }) => {
  const data = useMemo(() => new AdminData(), []);
  const isPlatform = session?.isPlatformAdmin ?? false;
  const canManage = session?.canAdminister ?? false;

  const visible = useMemo(
    () => SECTIONS.filter((s) => !s.platformOnly || isPlatform),
    [isPlatform]
  );

  const [active, setActive] = useState('dashboard');

  // The hash IS the state. Reading it on mount means a link into a section
  // lands there; listening for changes means the browser's back button works
  // without this component knowing anything about routing.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#/, '');
      if (visible.some((s) => s.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [visible]);

  const go = useCallback((id) => {
    setActive(id);
    window.location.hash = id;
  }, []);

  const groups = useMemo(() => {
    const out = new Map();
    for (const section of visible) {
      if (!out.has(section.group)) out.set(section.group, []);
      out.get(section.group).push(section);
    }
    return [...out.entries()];
  }, [visible]);

  return (
    <div className="ad-shell">
      <nav className="ad-nav">
        <div className="ad-brand">
          <strong>HomeLuxe</strong>
          <span>admin</span>
        </div>

        {groups.map(([group, sections]) => (
          <div className="ad-nav-group" key={group || 'top'}>
            {group && <h4>{group}</h4>}
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`ad-nav-item${active === section.id ? ' on' : ''}`}
                onClick={() => go(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        ))}

        <div className="ad-nav-foot">
          <div className="ad-who">
            <strong>{session?.displayName ?? 'Signed in'}</strong>
            <span>{isPlatform ? 'platform admin' : `${shops.length} shop(s)`}</span>
          </div>
          <a className="ad-btn" href="/">Open the showroom</a>
          <button type="button" className="ad-btn" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <main className="ad-main">
        {active === 'dashboard'  && <Dashboard data={data} go={go} />}
        {active === 'slots'      && <Slots data={data} canManage={canManage} />}
        {active === 'placements' && <Placements data={data} canManage={canManage} />}
        {active === 'publishing' && <Publishing data={data} canManage={canManage} />}
        {active === 'products'   && <AdminList shops={shops} inline />}
        {active === 'materials'  && <Materials data={data} canManage={canManage} />}
        {active === 'assets'     && <Assets data={data} canManage={canManage} />}
        {active === 'requests'   && <RequestQueue shops={shops} />}
        {active === 'shops'      && <Shops data={data} canManage={canManage} />}
        {active === 'campaigns'  && <Campaigns data={data} canManage={canManage} shops={shops} />}
        {active === 'analytics'  && <Analytics data={data} />}
        {active === 'people'     && (
          <People data={data} canManage={isPlatform} me={session?.userId} />
        )}
        {active === 'audit'      && <AuditLog data={data} />}
      </main>
    </div>
  );
};

export default AdminShell;
