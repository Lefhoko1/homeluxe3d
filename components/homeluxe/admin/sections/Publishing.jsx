import React, { useState } from 'react';

import { Async, Button, DataTable, Panel, Pill, useAsync, when } from '../ui';

/**
 * Publishing and rollback (sections 39, 40, 88, 89).
 *
 * WHAT A VISITOR SEES IS A SNAPSHOT, NOT THE LIVE TABLES. An admin editing
 * placements is editing a draft; the public house only changes when somebody
 * presses Publish, which freezes the current state as a numbered version.
 * That is what makes a mistake survivable: rollback is not "undo my edits",
 * it is "show version 4 again", and it takes effect immediately without
 * touching a single placement.
 *
 * PUBLISH IS CALLED ONCE, THROUGH rpc. Written in SQL as
 * `select (publish_scene(...)).*` the composite is re-evaluated once per
 * column it expands, which published the scene thirteen times before anybody
 * noticed. The note is on the migration; the reason it cannot happen here is
 * that PostgREST invokes the function exactly once.
 */
const Publishing = ({ data, canManage, sceneSlug = '3bed' }) => {
  const versions = useAsync(() => data.publishedScenes(sceneSlug), [data, sceneSlug]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [notes, setNotes] = useState('');

  const publish = async () => {
    setBusy(true); setProblem(null); setOutcome(null);
    try {
      const row = await data.publishScene(sceneSlug, notes.trim() || null);
      setOutcome(
        `Published version ${row?.version ?? '?'} — ${row?.placement_count ?? '?'} placements are now what the public sees.`
      );
      setNotes('');
      versions.refresh();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (version) => {
    if (!window.confirm(
      `Show version ${version.version} to the public again?\n\n` +
      `Nothing is deleted and no placement is edited — the house simply ` +
      `serves that snapshot from now on.`
    )) return;

    setBusy(true); setProblem(null); setOutcome(null);
    try {
      await data.rollbackScene(sceneSlug, version.version);
      setOutcome(`The public house is showing version ${version.version} again.`);
      versions.refresh();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'version',
      header: 'Version',
      render: (v) => <strong>v{v.version}</strong>,
    },
    {
      key: 'status',
      header: '',
      render: (v) =>
        v.status === 'published'
          ? <Pill tone="good">what the public sees</Pill>
          : <Pill>{v.status}</Pill>,
    },
    { key: 'placement_count', header: 'Placements', align: 'right' },
    { key: 'shop_count', header: 'Shops', align: 'right' },
    { key: 'notes', header: 'Note', render: (v) => v.notes || <span className="ad-dim">—</span> },
    { key: 'published_at', header: 'Published', render: (v) => when(v.published_at) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (v) =>
        canManage && v.status !== 'published' && (
          <Button disabled={busy} onClick={() => rollback(v)}>Show this one</Button>
        ),
    },
  ];

  return (
    <Panel
      title="Publishing"
      subtitle="The public house is a snapshot. Editing placements changes the draft; publishing is what changes what visitors see."
    >
      {canManage && (
        <div className="ad-publish">
          <input
            className="ad-search grow"
            value={notes}
            placeholder="What changed in this version? (optional, but it is what the list reads back)"
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button tone="primary" disabled={busy} onClick={publish}>
            {busy ? 'Publishing…' : 'Publish the draft'}
          </Button>
        </div>
      )}

      {problem && <p className="ad-note bad">{problem}</p>}
      {outcome && <p className="ad-note good">{outcome}</p>}

      <Async state={versions} empty="Nothing has been published yet.">
        {(rows) => <DataTable columns={columns} rows={rows} rowKey={(v) => v.id} />}
      </Async>
    </Panel>
  );
};

export default Publishing;
