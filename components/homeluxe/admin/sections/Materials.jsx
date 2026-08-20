import React, { useState } from 'react';

import {
  Async, Button, DataTable, Panel, Pill, Search, useAsync, useFilter, mm,
} from '../ui';

/**
 * Materials (sections 18 to 27, 49).
 *
 * A MATERIAL IS A PRODUCT. That is the part people skip: the tile on the
 * kitchen floor is sold by somebody, and the floor is advertising space in
 * exactly the way the sofa standing on it is. So a material carries a shop, a
 * product it corresponds to, and a real-world tile size -- because "600×600
 * porcelain" is a fact about the thing being sold, and it is what decides how
 * many times the texture repeats across the room.
 *
 * A material shares `asset_status` with the models -- uploaded, processing,
 * ready, failed, archived -- rather than having a publish flag of its own,
 * because a material IS an asset: it is a thing that gets ingested, checked
 * and then used, and a second vocabulary for the same lifecycle is how a
 * screen ends up offering a status the column will refuse.
 *
 * The renderer column is honest about where this stands today: these are
 * drawn procedurally in the browser from `procedural_key`, keyed to the
 * material name Blender baked into the mesh. PBR map ingestion (section 19)
 * is the upgrade this table is already shaped for -- `material_maps` exists
 * and is empty -- and nothing here pretends otherwise.
 */
const Materials = ({ data, canManage }) => {
  const materials = useAsync(() => data.materials(), [data]);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const { term, setTerm, filtered } = useFilter(materials.data ?? [], [
    'name', 'code', 'category_code',
  ]);

  const setStatus = async (material, status) => {
    setBusy(material.id);
    setProblem(null);
    try {
      await data.setMaterialStatus(material.id, status);
      materials.refresh();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(null);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Material',
      render: (m) => (
        <>
          <span
            className="ad-swatch"
            style={{ background: m.base_colour || '#c8c8c8' }}
            title={m.base_colour || 'no colour recorded'}
          />
          <strong>{m.name}</strong>
          <div className="ad-dim mono">{m.code}</div>
        </>
      ),
    },
    { key: 'category_code', header: 'Kind' },
    { key: 'shop', header: 'Sold by', render: (m) => m.shops?.name ?? <span className="ad-dim">—</span> },
    {
      key: 'product',
      header: 'Product',
      render: (m) => m.products?.name ?? <span className="ad-dim">not linked</span>,
    },
    {
      key: 'tile',
      header: 'Real size',
      render: (m) =>
        m.tile_width_mm
          ? `${mm(m.tile_width_mm)} × ${mm(m.tile_height_mm)}`
          : <span className="ad-dim">—</span>,
    },
    {
      key: 'renderer',
      header: 'Drawn by',
      render: (m) => (
        <>
          {m.renderer ?? 'procedural'}
          {m.procedural_key && <div className="ad-dim mono">{m.procedural_key}</div>}
        </>
      ),
    },
    {
      key: 'finish',
      header: 'Finish',
      render: (m) => (
        <span className="ad-dim">
          rough {Number(m.roughness ?? 0).toFixed(2)} · metal {Number(m.metallic ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => (
        <Pill tone={m.status === 'ready' ? 'good' : m.status === 'archived' ? 'bad' : 'warn'}>
          {m.status}
        </Pill>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => canManage && (
        m.status === 'ready' ? (
          <Button disabled={busy === m.id} onClick={() => setStatus(m, 'archived')}>
            Archive
          </Button>
        ) : (
          <Button tone="primary" disabled={busy === m.id} onClick={() => setStatus(m, 'ready')}>
            Make ready
          </Button>
        )
      ),
    },
  ];

  return (
    <Panel
      title="Materials"
      subtitle="Floors, walls and finishes. Each one is somebody's product, and the surface it dresses is advertising space."
      actions={<Search value={term} onChange={setTerm} placeholder="Search materials…" />}
    >
      {problem && <p className="ad-note bad">{problem}</p>}
      <Async state={materials} empty="No materials yet.">
        {() => <DataTable columns={columns} rows={filtered} rowKey={(m) => m.id} />}
      </Async>
    </Panel>
  );
};

export default Materials;
