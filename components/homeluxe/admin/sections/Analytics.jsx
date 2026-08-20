import React, { useMemo } from 'react';

import { Async, DataTable, Panel, Pill, useAsync, when } from '../ui';

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
 */
const Analytics = ({ data }) => {
  const daily = useAsync(() => data.shopStats(), [data]);
  const performance = useAsync(() => data.productPerformance(), [data]);
  const enquiries = useAsync(() => data.enquiries(), [data]);

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

  return (
    <>
      <Panel
        title="Traffic"
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

      <Panel
        title="Enquiries"
        subtitle="Somebody asking about a product. This is the end of the funnel."
      >
        <Async state={enquiries} empty="No enquiries yet.">
          {(rows) => (
            <DataTable
              columns={[
                {
                  key: 'name',
                  header: 'From',
                  render: (e) => (
                    <>
                      <strong>{e.name || 'Anonymous'}</strong>
                      <div className="ad-dim">{e.email || e.phone || '—'}</div>
                    </>
                  ),
                },
                { key: 'product', header: 'About', render: (e) => e.products?.name ?? '—' },
                { key: 'shop', header: 'Shop', render: (e) => e.shops?.name ?? '—' },
                { key: 'message', header: 'Message', render: (e) => e.message || '—' },
                {
                  key: 'status',
                  header: 'Status',
                  render: (e) => <Pill tone={e.status === 'new' ? 'warn' : ''}>{e.status}</Pill>,
                },
                { key: 'created_at', header: 'When', render: (e) => when(e.created_at) },
              ]}
              rows={rows}
              rowKey={(e) => e.id}
            />
          )}
        </Async>
      </Panel>
    </>
  );
};

export default Analytics;
