import React, { useState } from 'react';

import {
  Async, Button, Panel, Pill, Search, useAsync, useFilter, mm, when,
} from '../ui';

/**
 * The asset queue (sections 53, 54, 15).
 *
 * EVERY UPLOAD IS A NUMBERED VERSION, and this is where that pays off. Before
 * migration 0011 a re-upload overwrote the file in place: the previous model
 * was simply gone, and nothing could tell a broken export from one that had
 * not finished processing. Now a bad version is kept, marked, and left out of
 * the house -- `current_version_id` does not move -- so the shop can see what
 * was wrong and send another.
 *
 * The check that matters is units. A model exported in centimetres arrives a
 * hundred times too small and looks perfectly fine on its own; you notice
 * when the sofa is the size of a shoe. `validate_asset_version` compares the
 * measured bounding box against what the shop SAID the product measures,
 * which is the only independent number the system has.
 */
const Assets = ({ data, canManage }) => {
  const assets = useAsync(() => data.assets(), [data]);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const [result, setResult] = useState(null);
  const { term, setTerm, filtered } = useFilter(assets.data ?? [], ['name', 'slug', 'kind']);

  const recheck = async (version) => {
    setBusy(version.id);
    setProblem(null);
    setResult(null);
    try {
      const problems = await data.validateVersion(version.id);
      setResult({
        id: version.id,
        problems,
        ok: !problems || problems.length === 0,
      });
      assets.refresh();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Assets"
      subtitle="Every upload, every version. A version that fails its checks is kept and marked — it never becomes the one the house shows."
      actions={<Search value={term} onChange={setTerm} placeholder="Search assets…" />}
    >
      {problem && <p className="ad-note bad">{problem}</p>}

      <Async
        state={assets}
        empty="No assets recorded. Uploading a model through the product dialog creates one."
      >
        {() => (
          <div className="ad-assets">
            {filtered.map((asset) => {
              const versions = [...(asset.asset_versions ?? [])]
                .sort((a, b) => b.version - a.version);
              return (
                <article key={asset.id} className="ad-asset">
                  <header>
                    <div>
                      <strong>{asset.name}</strong>
                      <Pill tone={toneFor(asset.status)}>{asset.status}</Pill>
                      <div className="ad-dim">
                        {asset.shops?.name} · {asset.kind} · {versions.length} version(s)
                      </div>
                    </div>
                  </header>

                  <ul className="ad-versions">
                    {versions.map((v) => {
                      const current = v.id === asset.current_version_id;
                      return (
                        <li key={v.id} className={current ? 'current' : ''}>
                          <span className="ad-version-no">v{v.version}</span>
                          <Pill tone={toneFor(v.status)}>{v.status}</Pill>
                          {current && <Pill tone="good">in the house</Pill>}

                          <span className="ad-dim mono">{v.storage_path}</span>

                          <span className="ad-dim">
                            {v.width_mm
                              ? `${mm(v.width_mm)} × ${mm(v.depth_mm)} × ${mm(v.height_mm)}`
                              : 'not measured'}
                            {v.triangles ? ` · ${v.triangles.toLocaleString()} triangles` : ''}
                            {v.bytes ? ` · ${(v.bytes / 1024 / 1024).toFixed(1)} MB` : ''}
                          </span>

                          <span className="ad-dim">{when(v.created_at)}</span>

                          {v.failure_reason && (
                            <p className="ad-note bad small">{v.failure_reason}</p>
                          )}

                          {result?.id === v.id && (
                            <p className={`ad-note small ${result.ok ? 'good' : 'bad'}`}>
                              {result.ok
                                ? 'Passed — this version is now the one the house shows.'
                                : result.problems.join('; ')}
                            </p>
                          )}

                          {canManage && (
                            <Button disabled={busy === v.id} onClick={() => recheck(v)}>
                              {busy === v.id ? 'Checking…' : 'Re-check'}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </Async>
    </Panel>
  );
};

const toneFor = (status) => {
  if (status === 'ready') return 'good';
  if (status === 'failed') return 'bad';
  if (status === 'processing' || status === 'uploaded') return 'warn';
  return '';
};

export default Assets;
