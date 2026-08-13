# HouseLuxe — procedural house generation

The house is **generated from code**, not hand-modelled. Blender is the renderer
and exporter; the source of truth is `houseluxe/config/plan_3bed.py`.

That choice is what makes the house cheap to change. Swapping windows, roofing,
doors, brickwork or paint is an edit to one file followed by a rebuild — nothing
is welded to anything else, and nothing has to be re-modelled by hand.

## Running a build

Blender open, BlenderMCP addon connected (port 9876):

```bash
python blender/tools/blender_send.py           # rebuild + export GLBs + save .blend
python blender/tools/blender_send.py --no-export
```

Headless, no addon needed:

```bash
blender --background --python blender/build.py
```

The build wipes the scene first, so it is idempotent — running it twice gives
the same result as running it once.

## Layout

```
houseluxe/
  config/       Plan data. Pure values. No Blender imports.
    plan.py         Wall / Opening / Room / RoofSpec vocabulary
    plan_3bed.py    THE 3-BEDROOM HOUSE — every dimension lives here
  core/         Engine. Knows Blender, knows nothing about this house.
    units.py        mm -> m, the only place the conversion happens
    mesh.py         box / prism / join / solidify primitives
    geometry.py     polygon offset, shared by slab and ceiling
    wallmath.py     "3400mm along the north wall" -> world coordinates
    component.py    the Component contract
    scene.py        collection layout + build report
  components/   One class per real-world part.
    slab.py  floors.py  walls.py  openings.py  ceiling.py  porch.py  roof.py
  materials/    The finishes schedule (paint, brick, roofing colours)
  export/       One GLB per component
```

Dependencies point strictly downward: `components → core → config`. Nothing
imports upward, so any layer runs without the ones above it.

## The site

The yard is a **second concern with its own data and its own output folder**.
`config/site.py` holds the vocabulary (pool, paving, planting, fence);
`config/site_3bed.py` holds this yard. `components/site/` builds it.

```
30m x 40m         X -6,000 .. 24,000   Y -14,000 .. 26,000
  south 14.0m     street frontage, 3.6m driveway to the porch
  north 14.6m     garden and trees
  west   6.0m     side bed
  east  10.8m     POOL TERRACE
```

The house was **not moved** to suit the yard — the yard is built around the
house where it already stands. Moving it would invalidate every exported GLB
and every camera position in the app.

The pool (4.0 × 8.0 m, falling 1.1 m → 1.9 m) sits east because that is the
side the dining sliding door opens onto. Levels: paving and coping flush at
Z = 0 with the house floor so there is no step at the door, water at −120,
lawn at −150 so the slab edge stands proud as it would on site.

`build.py` runs two passes into one scene — `default_components()` then
`site_components()` — exporting to `public/models/house/` and
`public/models/site/` respectively.

## Draco compression

Exports are Draco-compressed (`export/gltf.py` → `DESIRED_OPTIONS`). Measured
on this scene:

| | before | after |
|---|---|---|
| `public/models/house/` | 272.7 KB | **105.7 KB** |
| `public/models/site/` | 1,129.6 KB | **233.4 KB** |
| total | 1,402 KB | **339 KB** (−76%) |

Position quantisation is 14 bits over a ~50 m extent, so about 3 mm of error —
far below anything visible, and well inside the tolerance of a 90 mm cornice.

**A Draco GLB cannot be opened by a loader without the decoder.** The three.js
side vendors it into `public/draco/` and wires it in `HouseLoader.js`; those two
have to change together. Turning this off here without unwiring the loader is
harmless, but turning it on without wiring it up will produce a blank scene.

## The catalogue

Everything in a house is an advert for something a shop sells. `houseluxe/catalog`
holds shops, their products, and where each product stands in each house — see
[catalog/README.md](houseluxe/catalog/README.md).

```
shops/bradlows/       the range (5 products)
placements/house_3bed.py   what stands where
```

Products build at the ORIGIN and export one model each to
`public/models/products/<shop>/<product>.glb`, alongside a `catalog.json`
carrying prices, SKUs and placements. Position is data, never baked into the
mesh — moving a sofa is a number in the placement file, not a re-export.

`build.py` stages products into their placements *after* export, so the saved
`.blend` shows a furnished house while the exported models stay reusable.

## The tour character

`components/character.py` builds the figure a visitor drives around the
property, exported to `public/models/tour/character.glb`. It is not a product
and not part of the building — it is a viewer affordance, like the camera —
but it is modelled here so it can be restyled without touching app code.

It follows the product convention (footprint centred, feet at z=0, **facing
+Y**), and roughly 1.7m tall so it reads at true scale against 2.4m ceilings
and a 900mm sill. The walk controller assumes that heading; a character
modelled facing another way will walk backwards.

## The two rules that keep it editable

**One component owns one category of part.** A component builds its own geometry
and never reaches into a sibling. `RoofComponent` does not know windows exist.

**A component is both the unit of building and the unit of export.** Each one
becomes a Blender collection *and* a `.glb`. Re-exporting `roof.glb` cannot
disturb `walls_exterior.glb`.

## Where to make common changes

| You want to change | Edit |
|---|---|
| Paint / brick / roof colour | `materials/library.py` → `FINISHES` |
| A window's size or position | `config/plan_3bed.py` → that wall's `Opening` |
| How *all* windows are built | `components/openings.py` → `WindowFactory` |
| Roof pitch, overhang, ridge | `config/plan_3bed.py` → `RoofSpec` |
| Ceiling height or colour | `config/plan_3bed.py` → `CeilingSpec` |
| Move a wall | `config/plan_3bed.py` → that `Wall`'s start/end |
| Floor finish in one room | `config/plan_3bed.py` → that `Room`'s `finish` |
| Add a new kind of part | new `Component` subclass + a line in `components/__init__.py` |
| Pool size, depth or position | `config/site_3bed.py` → `POOL` |
| Yard boundary / setbacks | `config/site_3bed.py` → `SITE_X0..SITE_Y1` |
| Move a tree, add planting | `config/site_3bed.py` → `TREES` / `SHRUBS` |
| Driveway, paths, terrace | `config/site_3bed.py` → `PAVING` |
| Build the house with no yard | `build.py` → `main(site=False)` |

Openings are positioned **along their wall**, not in world coordinates, so
moving a wall carries its windows and doors with it.

## Output

`public/models/house/*.glb` — one file per component, Y-up, modifiers baked,
glTF-safe materials. Object names survive into the GLB (`ext.north`,
`windows.bed3.north.glass`), so three.js can address individual parts.

## Known gaps

- **No garage.** The floor plan has none; the elevations show a double garage
  door. Geometry follows the floor plan. `GarageDoorFactory` is registered and
  ready in `components/openings.py` but no wall uses it.
- **Ridge lands at 5,338mm**, not the 5,140mm printed on the elevations, because
  ridge height is derived from pitch + span + overhang rather than asserted.
  Set `RoofSpec.overhang` to ~180 to hit 5,140 exactly.
- **Interior wall positions are a best fit** to a raster drawing. Printed room
  clear dimensions were treated as authoritative; wall centrelines were fitted
  around them.
- **`Room` rectangles do not tile the whole interior** — they sum to 96.1 m²
  against the plan's stated 118.8 m². Circulation and robes are not all declared
  as rooms. This now affects **floor finishes only**: hallways get bare slab
  rather than a finish. The ceiling sidesteps it by following the footprint, and
  walls and the building envelope are unaffected.
- **The ceiling is one plane, not per-room.** Deliberate, so circulation is
  covered. A room wanting a different ceiling height or finish (a raked living
  ceiling, say) needs a per-room override adding to `CeilingComponent`.
- **No cornice.** The ceiling meets the walls as a butt joint.
- **Trees are clumped ellipsoids**, not foliage cards. Good enough at the
  distance this scene is viewed from; they will not survive a close-up.
- **The pool barrier omits its west side** because the house wall closes it.
  That puts the dining slider inside the pool zone, so in a real build that
  door needs self-closing, self-latching hardware. Not modelled — hardware,
  not geometry. There is also no gate leaf, just the opening.
- **No pool plant** — no pump, filter or skimmer.
- **No boundary survey was supplied**, so the 30 × 40 boundary is centred on
  the house with a deeper front setback. Real setbacks come from a title plan.
- **No instancing.** Forty trees are forty meshes; the boundary fence repeats
  the same post ninety times. Draco compression hides most of the cost (see
  below), but the draw-call count is still higher than it needs to be. The fix
  is `EXT_mesh_gpu_instancing`, not fewer trees.
- **No furniture yet.** Furniture is a separate model set by design.
