import React, { useMemo } from 'react';

import { Async, DataTable, Panel, useAsync, when } from '../ui';

/**
 * What the visitors did (sections 90 to 93).
 *
 * THIS IS THE ONLY THING A SHOP IS ACTUALLY BUYING. Not a slot -- proof that
 * the slot was seen. Which makes it worth saying that until migration 0014
 * this screen would have shown nothing at all: every event was written with a
 * null shop_id, because both callers passed the shop as a slug inside
 * `metadata` and left the foreign key empty. 126 clicks belonging to nobody.
 *
 * The rows from before that fix are still in the table and cannot be
 * attributed to anyone, so they are counted separately rather than quietly
 * dropped -- a number that disagrees with the raw table is worse than a
 * number with an explanation next to it.
 *
 * Enquiries used to be listed here, read-only. They are a conversation now
 * rather than a number, so they have a screen of their own -- see
 * sections/Enquiries.jsx.
 */
const Analytics = ({ data }) => {
  const traffic = useAsync(() => data.traffic(30), [data]);
  const signups = useAsync(() => data.signups(30), [data]);
  const daily = useAsync(() => data.shopStats(), [data]);
  const performance = useAsync(() => data.productPerformance(), [data]);

  const totals = useMemo(() => {
    const rows = daily.data ?? [];
    return rows.reduce(
      (acc, r) => ({
        views: acc.views + Number(r.views ?? 0),
        clicks: acc.clicks + Number(r.clicks ?? 0),
        expands: acc.expands + Number(r.expands ?? 0),
        enquiries: acc.enquiries + Number(r.enquiries ?? 0),
        sessions: acc.sessions + Number(r.sessions ?? 0),
      }),
      { views: 0, clicks: 0, expands: 0, enquiries: 0, sessions: 0 }
    );
  }, [daily.data]);

  const totalPeople = (traffic.data ?? []).reduce(
    (n, r) => n + Number(r.people ?? 0), 0
  );

  return (
    <>
      <Panel
        title="Who is in the house"
        subtitle="Sessions and people, by day. `interaction_events.user_id` was never set until migration 0019, so every session before then looks anonymous — including the ones that were not."
      >
        <Async
          state={traffic}
          empty="No traffic recorded yet. Walking the house and clicking a product writes the first row."
        >
          {(rows) => (
            <>
              <p className="ad-sub">
                {rows.reduce((n, r) => n + Number(r.sessions ?? 0), 0).toLocaleString()} sessions
                {' · '}{totalPeople.toLocaleString()} signed-in visitors
                {' · '}{rows.reduce((n, r) => n + Number(r.events ?? 0), 0).toLocaleString()} events
                {' over '}{rows.length} day{rows.length === 1 ? '' : 's'}
              </p>
              <DataTable
                rows={rows}
                rowKey={(r) => r.day}
                columns={[
                  { key: 'day', header: 'Day', render: (r) => when(r.day).split(',')[0] },
                  { key: 'sessions', header: 'Sessions', align: 'right' },
                  {
                    key: 'known_sessions',
                    header: 'Signed in',
                    align: 'right',
                    render: (r) => (
                      <>
                        {r.known_sessions}
                        {Number(r.sessions) > 0 && (
                          <span className="ad-dim">
                            {' '}({Math.round((r.known_sessions / r.sessions) * 100)}%)
                          </span>
                        )}
                      </>
                    ),
                  },
                  { key: 'people', header: 'People', align: 'right' },
                  { key: 'views', header: 'Views', align: 'right' },
                  { key: 'clicks', header: 'Clicks', align: 'right' },
                  { key: 'enquiries', header: 'Enquiries', align: 'right' },
                ]}
              />
            </>
          )}
        </Async>
      </Panel>

      <Panel
        title="New accounts"
        subtitle="Somebody has to register before they can follow a shop or ask a question, so this is the audience the platform actually has."
      >
        <Async state={signups} empty="Nobody has registered yet.">
          {(rows) => (
            <DataTable
              rows={rows}
              rowKey={(r) => r.day}
              columns={[
                { key: 'day', header: 'Day', render: (r) => when(r.day).split(',')[0] },
                { key: 'accounts', header: 'Accounts', align: 'right' },
                { key: 'staff', header: 'of them staff', align: 'right' },
              ]}
            />
          )}
        </Async>
      </Panel>

      <Panel
        title="Traffic by shop"
        subtitle="By shop and day. A view is a placement being looked at; a click is somebody choosing it."
      >
        <Async
          state={daily}
          empty="No attributed traffic yet. Walk the house and click a product — the event is attributed to its shop by the database."
        >
          {(rows) => (
            <>
              <p className="ad-sub">
                {totals.views.toLocaleString()} views · {totals.clicks.toLocaleString()} clicks
                {' · '}{totals.enquiries.toLocaleString()} enquiries
                {' · '}{totals.sessions.toLocaleString()} sessions
              </p>
              <DataTable
                columns={[
                  { key: 'day', header: 'Day', render: (r) => when(r.day).split(',')[0] },
                  { key: 'views', header: 'Views', align: 'right' },
                  { key: 'clicks', header: 'Clicks', align: 'right' },
                  { key: 'expands', header: 'Expands', align: 'right' },
                  { key: 'enquiries', header: 'Enquiries', align: 'right' },
                  { key: 'sessions', header: 'Sessions', align: 'right' },
                ]}
                rows={rows}
                rowKey={(r) => `${r.shop_id}-${r.day}`}
              />
            </>
          )}
        </Async>
      </Panel>

      <Panel
        title="Product performance"
        subtitle="Which products people actually stopped for (section 93)."
      >
        <Async state={performance} empty="Nothing has been clicked yet.">
          {(rows) => (
            <DataTable
              columns={[
                {
                  key: 'product',
                  header: 'Product',
                  render: (r) => (
                    <>
                      <strong>{r.product}</strong>
                      <div className="ad-dim">{r.shop}</div>
                    </>
                  ),
                },
                { key: 'views', header: 'Views', align: 'right' },
                { key: 'clicks', header: 'Clicks', align: 'right' },
                { key: 'expands', header: 'Expands', align: 'right' },
                { key: 'enquiries', header: 'Enquiries', align: 'right' },
                { key: 'sessions', header: 'People', align: 'right' },
              ]}
              rows={rows}
              rowKey={(r) => r.variantId}
            />
          )}
        </Async>
      </Panel>

    </>
  );
};

export default Analytics;
