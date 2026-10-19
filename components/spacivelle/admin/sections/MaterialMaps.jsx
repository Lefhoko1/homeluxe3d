import React, { useState } from 'react';

import { Async, Button, Panel, Pill, useAsync } from '../ui';

/**
 * Supplying the textures for a material (sections 19, 30, 49).
 *
 * WHY THIS EXISTS. Every surface in the house is drawn by a procedure --
 * `createTileTexture`, `createGamazineTexture` -- with exactly one exception,
 * which was hardcoded in the browser:
 *
 *     tile_pyc61001: { url: "/textures/floor/pyc61001.jpg", tileMm: 600 }
 *
 * A real photograph of a real tile from a real shop, committed to the repo.
 * So "a shop supplies a photograph of their tile" meant a code change and a
 * deploy, and `material_maps` -- the table for exactly this -- had never held
 * a row. Uploading here writes the file, records it as a numbered asset
 * version, and points the material at it; the house picks it up on the next
 * load with nothing rebuilt.
 *
 * ALBEDO IS THE ONE THAT MATTERS. Supplying it switches the material from
 * procedural to PBR. The rest refine it: a normal map gives the surface
 * relief under the house lights, roughness stops a polished floor and a matt
 * one looking identical, and ambient occlusion settles the grout lines. A
 * material with only an albedo map still looks right, which is why it is the
 * one that flips the switch.
 */

/** What each map does, in the words of somebody who has to supply one. */
const MAP_TYPES = [
  ['albedo', 'Colour', 'The photograph itself. Supplying this switches the material to PBR.'],
  ['normal', 'Relief', 'Bumps and grooves, so the surface catches the light.'],
  ['roughness', 'Sheen', 'Where it is polished and where it is matt. White is matt.'],
  ['ao', 'Shadowing', 'Where light does not reach — grout lines, weave, joins.'],
  ['metallic', 'Metalness', 'Only for metals. Black everywhere else.'],
  ['height', 'Displacement', 'Real depth, for deeply profiled surfaces.'],
  ['opacity', 'Cut-out', 'Where the surface is see-through.'],
];

const MaterialMaps = ({ data, canManage }) => {
  const finishes = useAsync(() => data.materialFinishes(), [data]);
  const [open, setOpen] = useState(null);

  return (
    <Panel
      title="Textures"
      subtitle="What each surface is actually drawn with. A material with no maps is drawn by a procedure; one with a colour map is drawn from the photograph."
    >
      <Async state={finishes} empty="No materials.">
        {(rows) => (
          <div className="ad-assets">
            {rows.map((material) => {
              const maps = material.maps ?? {};
              const supplied = Object.keys(maps);
              return (
                <article key={material.code} className="ad-asset">
                  <header className="ad-mat-head">
                    <span
                      className="ad-swatch big"
                      style={{
                        background: maps.albedo
                          ? `center / cover url(${data.mapUrl(maps.albedo)})`
                          : material.base_colour || '#c8c8c8',
                      }}
                    />
                    <div>
                      <strong>{material.name}</strong>
                      <Pill tone={material.renderer === 'pbr' ? 'good' : ''}>
                        {material.renderer === 'pbr' ? 'photographic' : material.renderer}
                      </Pill>
                      <div className="ad-dim mono">{material.code}</div>
                      <div className="ad-dim">
                        {material.category_code}
                        {material.tile_width_mm
                          ? ` · laid at ${Math.round(material.tile_width_mm)}mm`
                          : ''}
                        {supplied.length
                          ? ` · ${supplied.length} map(s): ${supplied.join(', ')}`
                          : ' · drawn by a procedure'}
                      </div>
                    </div>
                    {canManage && (
                      <Button
                        onClick={() => setOpen(open === material.code ? null : material.code)}
                      >
                        {open === material.code ? 'Close' : 'Supply textures'}
                      </Button>
                    )}
                  </header>

                  {open === material.code && (
                    <MapUploads
                      data={data}
                      material={material}
                      onUploaded={finishes.refresh}
                    />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Async>
    </Panel>
  );
};

const MapUploads = ({ data, material, onUploaded }) => {
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null);
  const maps = material.maps ?? {};

  const upload = async (mapType, file) => {
    if (!file) return;
    setBusy(mapType);
    setProblem(null);
    setDone(null);
    try {
      // Measured here rather than asked for: the resolution is a fact about
      // the file, and a form field for it is a form field to get wrong.
      const resolution = await widthOf(file);
      await data.uploadMaterialMap(file, {
        materialCode: material.code,
        mapType,
        resolution,
      });
      setDone(`${mapType} supplied${resolution ? ` at ${resolution}px` : ''}.`);
      onUploaded();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ad-maps">
      {problem && <p className="ad-note bad">{problem}</p>}
      {done && <p className="ad-note good">{done}</p>}

      {MAP_TYPES.map(([type, label, what]) => (
        <label key={type} className={`ad-map${maps[type] ? ' has' : ''}`}>
          <span
            className="ad-map-thumb"
            style={
              maps[type]
                ? { background: `center / cover url(${data.mapUrl(maps[type])})` }
                : undefined
            }
          />
          <span className="ad-map-body">
            <strong>{label}</strong>
            {maps[type] && <Pill tone="good">supplied</Pill>}
            <em className="ad-hint">{what}</em>
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={busy !== null}
            onChange={(e) => upload(type, e.target.files?.[0])}
          />
          <span className="ad-map-action">
            {busy === type ? 'Uploading…' : maps[type] ? 'Replace' : 'Choose'}
          </span>
        </label>
      ))}
    </div>
  );
};

/**
 * How wide the image is, in pixels.
 *
 * Read from the file rather than typed, because it is a fact about the file
 * and section 31 wants a resolution policy applied to real numbers. Returns
 * null rather than throwing if the browser cannot decode it -- an unreadable
 * image is the upload's problem, not this measurement's.
 */
function widthOf(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image.naturalWidth || null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export default MaterialMaps;
