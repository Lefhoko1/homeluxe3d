import React, { useMemo, useState } from 'react';

import { Async, DataTable, Panel, Pill, useAsync, when } from '../ui';

/**
 * The audit log (section 59).
 *
 * WRITTEN BY THE DATABASE, NOT BY THIS APPLICATION. `record_audit` is called
 * from inside the security-definer functions that do the work -- publishing,
 * rolling back, registering an asset -- so an operation cannot succeed and go
 * unrecorded, and a client cannot write a flattering entry for something it
 * did not do. That is the only arrangement worth having: a log the thing
 * being logged can edit is a diary.
 *
 * `before` and `after` carry the row as it was and as it became, which is
 * what makes "who changed this, and to what" answerable rather than merely
 * "somebody touched it".
 */
const AuditLog = ({ data }) => {
  const [action, setAction] = useState('');
  const log = useAsync(() => data.auditLog({ limit: 300 }), [data]);
  const [open, setOpen] = useState(null);

  const actions = useMemo(() => {
    const set = new Set((log.data ?? []).map((r) => r.action));
    return [...set].sort();
  }, [log.data]);

  const rows = useMemo(
    () => (log.data ?? []).filter((r) => !action || r.action === action),
    [log.data, action]
  );

  return (
    <Panel
      title="Audit log"
      subtitle="Every publish, rollback and upload, recorded by the database function that did it."
      actions={
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Everything</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      }
    >
      <Async state={log} empty="Nothing has been recorded yet.">
        {() => (
          <>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => setOpen(open?.id === r.id ? null : r)}
              selectedKey={open?.id}
              columns={[
                { key: 'at', header: 'When', render: (r) => when(r.at) },
                {
                  key: 'action',
                  header: 'Action',
                  render: (r) => <Pill tone={toneFor(r.action)}>{r.action}</Pill>,
                },
                { key: 'entity_type', header: 'On', render: (r) => r.entity_type ?? '—' },
                {
                  key: 'entity_id',
                  header: 'Which',
                  render: (r) => (
                    <span className="ad-dim mono">
                      {r.entity_id ? String(r.entity_id).slice(0, 12) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'metadata',
                  header: 'Detail',
                  render: (r) => (
                    <span className="ad-dim">{summarise(r.metadata)}</span>
                  ),
                },
                {
                  key: 'actor_id',
                  header: 'By',
                  render: (r) => (
                    <span className="ad-dim mono">
                      {r.actor_id ? String(r.actor_id).slice(0, 8) : 'system'}
                    </span>
                  ),
                },
              ]}
            />

            {open && (
              <pre className="ad-json">
                {JSON.stringify(
                  { before: open.before, after: open.after, metadata: open.metadata },
                  null, 2
                )}
              </pre>
            )}
          </>
        )}
      </Async>
    </Panel>
  );
};

const toneFor = (action) => {
  if (action?.endsWith('.rollback')) return 'warn';
  if (action?.endsWith('.publish')) return 'good';
  if (action?.includes('delete') || action?.includes('suspend')) return 'bad';
  return '';
};

/** The metadata as one short line, without dumping JSON into a table cell. */
function summarise(meta) {
  if (!meta || typeof meta !== 'object') return '—';
  const parts = Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(' · ') : '—';
}

export default AuditLog;
