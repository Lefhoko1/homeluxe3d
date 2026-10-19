import React from 'react';

import { Async, Panel, Stat, useAsync, ago } from '../ui';

/**
 * The front page (section 46).
 *
 * WHAT IS WRONG COMES FIRST. The specification lists eleven counts and they
 * are not equally interesting: "12 products" is a fact, "3 failed assets" is
 * a job. The numbers that mean somebody has to do something are toned and sit
 * at the front; the rest are inventory.
 *
 * Every tile is a link. A dashboard whose numbers cannot be clicked makes you
 * read a number, remember it, and go hunting for the screen that explains it.
 */
const Dashboard = ({ data, go }) => {
  const counts = useAsync(() => data.dashboard(), [data]);
  const activity = useAsync(() => data.recentActivity(14), [data]);

  return (
    <>
      <Panel
        title="Dashboard"
        subtitle="What the platform is carrying, and what is waiting on somebody."
      >
        <Async state={counts} empty="No counts came back.">
          {(c) => (
            <>
              <div className="ad-stats">
                <Stat
                  label="Open requests"
                  value={c.openRequests}
                  tone={c.openRequests > 0 ? 'warn' : ''}
                  hint="shops waiting on us to make something"
                  onClick={() => go('requests')}
                />
                <Stat
                  label="Failed assets"
                  value={c.failedAssets}
                  tone={c.failedAssets > 0 ? 'bad' : ''}
                  hint="models that did not pass their checks"
                  onClick={() => go('assets')}
                />
                <Stat
                  label="New enquiries"
                  value={c.newEnquiries}
                  tone={c.newEnquiries > 0 ? 'warn' : ''}
                  hint="customers waiting for an answer"
                  onClick={() => go('analytics')}
                />
                <Stat
                  label="Active campaigns"
                  value={c.activeCampaigns}
                  hint="running right now"
                  onClick={() => go('campaigns')}
                />
              </div>

              <h3 className="ad-h3">Inventory</h3>
              <div className="ad-stats">
                <Stat label="Slots" value={c.slots} hint="positions in the house"
                      onClick={() => go('slots')} />
                <Stat label="Free to sell" value={c.freeSlots} tone="good"
                      hint="empty, and the thing a shop buys"
                      onClick={() => go('slots')} />
                <Stat label="Live placements" value={c.livePlacements}
                      hint="products standing in the house"
                      onClick={() => go('placements')} />
                <Stat label="Shops" value={c.shops} onClick={() => go('shops')} />
                <Stat label="Products" value={c.products} onClick={() => go('products')} />
                <Stat label="Materials" value={c.materials} onClick={() => go('materials')} />
                <Stat label="Assets" value={c.assets} onClick={() => go('assets')} />
              </div>

              <p className="ad-sub" style={{ marginTop: 14 }}>
                {c.slots > 0 && (
                  <>
                    {Math.round(((c.slots - c.freeSlots) / c.slots) * 100)}% of the
                    house is sold — {c.slots - c.freeSlots} of {c.slots} positions.
                  </>
                )}
              </p>
            </>
          )}
        </Async>
      </Panel>

      <Panel
        title="Recent activity"
        subtitle="From the audit log. Every publish, rollback and upload is here."
      >
        <Async state={activity} empty="Nothing has happened yet.">
          {(rows) => (
            <ul className="ad-feed">
              {rows.map((row) => (
                <li key={row.id}>
                  <span className="ad-feed-when">{ago(row.at)}</span>
                  <span className="ad-feed-what">{describe(row)}</span>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Panel>
    </>
  );
};

/**
 * One audit row as a sentence.
 *
 * The raw row is `scene.publish` / `scene` / a uuid, which is precise and
 * unreadable. The metadata carries what actually happened -- how many
 * placements, which version, which file -- so the sentence uses it where it
 * is there and stays honest where it is not.
 */
function describe(row) {
  const meta = row.metadata ?? {};
  switch (row.action) {
    case 'scene.publish':
      return `Published version ${meta.version ?? '?'}${
        meta.placements != null ? ` — ${meta.placements} placements` : ''
      }`;
    case 'scene.rollback':
      return `Rolled the scene back to version ${meta.version ?? '?'}`;
    case 'asset.upload':
      return `Uploaded ${meta.path ?? 'an asset'}${
        meta.version ? ` (version ${meta.version})` : ''
      }`;
    case 'platform.migrate':
      return 'Applied a database migration';
    default:
      return `${row.action} on ${row.entity_type ?? 'something'}`;
  }
}

export default Dashboard;
