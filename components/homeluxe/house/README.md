# House module (three.js side)

Loads the house that `blender/houseluxe` generates, and textures it.

```
house/
  index.js            public surface — import from here
  houseConfig.js      which GLBs to load, default visibility, named views
  HouseLoader.js      loads the parts, applies materials, recentres
  textures/
    proceduralTextures.js   canvas texture generators
    materialLibrary.js      Blender material name -> three.js material
```

## The seam between Blender and three.js

**Blender decides what a surface *is*. Three.js decides what it *looks like*.**

Blender assigns a material named `brick_face` to the exterior walls and bakes
that name into the GLB. `materialLibrary.js` maps that name to a textured
`MeshStandardMaterial`. Neither side knows anything about the other beyond the
shared vocabulary of names.

The consequence worth remembering: **a texture change needs no re-export.** Edit
`materialLibrary.js`, refresh. You only go back to Blender when the *geometry*
changes.

The names must match `blender/houseluxe/materials/library.py`. A name in a GLB
with no entry here keeps the flat Principled colour Blender shipped — visible,
but untextured. The loader logs those to the console rather than failing.

## Scale contract

The Blender exporter UV-projects at **1 UV unit per metre**. Every canvas in
`proceduralTextures.js` therefore depicts exactly **one square metre** and tiles
at `repeat(1, 1)`. Draw to real millimetre dimensions — 230×76 bricks, 76mm roof
ribs — and it comes out to scale.

## The yard

`SITE_PARTS` loads the 30 × 40 m yard from `/models/site/`. It goes into the
**same group** as the house and is recentred using the **house** bounds, never
its own — the two were modelled in one coordinate system in Blender, and
recentring them separately would put each at its own origin and tear the model
apart. `loadHouse({ includeSite: false })` skips it.

There is **no ground plane in code**. The lawn is real geometry from Blender;
adding a flat plane back would z-fight with it.

## Atmosphere

`../atmosphere/Atmosphere.js` owns the sky dome, two drifting cloud sheets and
the fog, and sets `scene.background` and `scene.fog` itself so the three cannot
disagree.

Clouds are **domes, not flat planes**. A plane only shows when you look up, and
the default view of a house looks *down* — a plane puts cloud exactly where
nobody is looking, and its straight edge cuts across the sky when they do.
Domes put cloud across the whole sky including the band just above the horizon,
which is what is actually in frame. They are flattened on Y so the texture is
not pinched into a knot at the zenith.

Sky and cloud domes set `fog: false` — the sky is not in the fog. Fog applies to
scene geometry only, and is deliberately set to start past the far side of the
yard so nothing you are looking at is washed out.

The whole group is re-centred on the camera every frame, so the sky can never
be reached.

## Parts are independent

Each Blender component is a separate GLB and stays a separate child group. That
is what makes these possible at runtime, without touching anything else:

```js
import { setPartVisible, getPartVisibility } from './house';

setPartVisible(house, 'roof', true);      // exterior view
setPartVisible(house, 'ceiling', false);  // see into rooms
getPartVisibility(house);                 // { roof: true, ceiling: false, ... }
```

Every part defaults to **visible**, so the house looks like a finished house.
Roof and ceiling are the two you will most often want off — with them on you
cannot see into the rooms from outside — so toggle those at runtime rather than
changing the default.

A part that fails to load is reported in `errors` and skipped; the rest of the
building still renders.

## Draco compression

The GLBs are Draco-compressed by the Blender exporter (see
`blender/houseluxe/export/gltf.py`). It cut the models from **1,402 KB to
339 KB**, most of it on the yard — `yard_ground.glb` went 235 KB → 22 KB.

The decoder is **vendored** into `public/draco/` from
`three/examples/jsm/libs/draco/gltf/`, not loaded from a CDN, so the app has no
third-party runtime dependency. **Re-copy those files after a major `three`
upgrade** — they are currently from three 0.182.0.

`DRACOLoader` spins up Web Workers, so one instance is shared across all 17
loads rather than created per file; `disposeDracoLoader()` tears it down.

A Draco GLB cannot be read by a loader without the decoder wired up, so the
exporter setting and `HouseLoader.setDRACOLoader()` must change together.

## Products

`../products/ProductLoader.js` reads `/models/products/catalog.json` — written
by the Blender catalogue — and places shop products in the house.

Products are loaded **after** the house and parented **to it**, not to the
scene. The house group carries the recentring offset; a product added to the
scene instead would sit at raw Blender coordinates, metres away from the
building. Chaining the two loads also stops them racing.

Positions arrive already converted to three.js space, so nothing here does
coordinate maths — move a sofa in `blender/houseluxe/catalog/placements/`,
rebuild, and it moves in the app with no code change.

Each product is fetched once and cloned per placement, and every mesh carries
`userData` naming its shop, product, price and SKU — so a raycast hit anywhere
on a sofa can name the thing being advertised.

## Walk-through tour

`../tour/` drives a character around the property in third person, so a
visitor can arrive at the gate, walk up the drive and stand in front of the
furniture at eye level. Orbiting tells you the layout; walking tells you the
scale.

Everything is raycasts, no physics engine:

- **Ground** — a ray straight down finds whatever is underfoot, so the
  character walks up the 150mm slab edge and the porch step without either
  being described anywhere.
- **Walls** — a short ray along the direction of travel. Because walls were
  built as piers, sills and lintels rather than solid panels with holes cut
  in them, **doorways are real gaps in the geometry** — walking through a
  door needs no door logic at all.
- **Doors are never collided with.** Every door is treated as open.

The character lives in the **scene**, not the house group — unlike products.
The controller drives the camera and raycasts, both world-space, so parenting
it to the recentred house would offset it from its own camera by ~7 metres.
`TOUR_START` is therefore in world coordinates.

`/#tour` starts the walk-through straight away, for "take the tour" links.

## Coordinates

GLBs are exported Y-up, so Blender's +Z becomes three's +Y and Blender's +Y
becomes three's −Z. The loader then recentres: **origin at the middle of the
footprint, floor at Y = 0**. Named viewpoints in `HOUSE_VIEWS` are in that
recentred space.

## Where to make common changes

| You want to change | Edit |
|---|---|
| Brick / roof / floor texture | `textures/proceduralTextures.js` |
| Which material a name maps to | `textures/materialLibrary.js` |
| Use real photo textures | swap the generator for `TextureLoader` in `materialLibrary.js` |
| Default visible parts | `houseConfig.js` → `HOUSE_PARTS` |
| Camera presets | `houseConfig.js` → `HOUSE_VIEWS` |

## Known gaps

- **Furniture is still the old primitives.** `createFurniture()` in
  `CanvasContainer.jsx` was modelled for the previous 12×10 room, so it is
  scaled to 0.75 and parked at `LIVING_ZONE_CENTRE`. It is a placeholder until
  the Blender-authored sofas and TVs land, at which point it should be deleted
  rather than adjusted.
- **Nothing is clickable yet.** The house meshes carry no `userData.clickable`,
  and `CanvasContainer` has no raycaster. Product selection still runs off the
  placeholder furniture.
- **The roof reads near-black.** The corrugated texture plus `metalness: 0.55`
  is darker than the "Colorbond Dark Grey" on the elevations. Lighten the
  `light`/`dark` stops in `createCorrugatedTexture()` if you want it greyer.
- **No lightmaps or ambient occlusion.** Interior corners look flat; the three
  interior point lights in `setupLighting()` are doing all the work.
