# Handover — the Grandiose kitchen, and how to pick this up

*Written at commit `83992c7`, scene v14. This is a continuation note for a
fresh session: read it, then read `SYSTEM_AUDIT.md` for the system as a whole.*

The task waiting is **option 2: make the Grandiose kitchen scheme BE the
kitchen** — replace the fitted joinery the generator builds with the uploaded
product, so it can actually be seen in the house.

Everything else in the repo is green: eleven test suites pass, drift is clean,
and the walk works. Do not start until you have read §3, which is where the
last three attempts went wrong.

---

## 1. Where the product already is

Done, committed, and needing no repetition:

| | |
|---|---|
| Model | `public/models/products/tubod/grandiose-kitchen-unit.glb` |
| Size | 3367 × 676 × 2050 mm, metres, Y up, base at y=0 |
| Complexity | 98 objects, 7 PBR materials, 1,988 triangles |
| Product | `grandiose-kitchen-unit`, SKU 705925, shop **tubod**, category `kitchen_unit` |
| Price | **null** — the listing publishes none, and a price is never guessed |
| Variant | `default`, anchor `{"dx": -0.0085, "dy": 0, "dz": -0.3365}` |
| Migration | `supabase/migrations/0023_a_kitchen_somebody_else_built.sql` |
| Placement | created, then **retired** — `status='removed'` |
| Slot | `SLOT_KITCHEN_RUN_001`, **`is_active=false`**, origin `derived` |

It is Tubod's because **CashBuild has no subscription** — `shop_is_live()`
returns false and the live view correctly drops everything it owns. Move it to
CashBuild the day they subscribe; that is one row.

The anchor matters: the model sits entirely in front of its own origin
(z 0..0.666), so without it the unit stands a third of a metre into the room.
Its backsplash is at z 0.02 and its handles at z 0.65, so **it faces +Z in its
own frame**, which is plan *south* once in the house.

---

## 2. Why it is not standing anywhere

The kitchen is **4290 × 3135** (x 5650..9940, y 4955..8090). What matters is
not the room size but the **backed spans** — the stretches of wall with
something solid behind them, which is what `config/kitchen.py` derives the
fitted runs from:

```
east    4955..8090   3135mm   (already carries a full-depth fitted run)
north   8155..9340   1185mm
south   5650..6295    645mm
```

The longest backed wall in the room is **3135mm**; the unit is **3367mm**.

Removing the generated joinery does **not** fix this. The joinery is a
*consequence* of the backed spans, not a cause — take it away and the backed
spans are unchanged, because they are set by the walls and their openings.

### 2.1 But the unit is not uniformly tall

Measured from the GLB, which changes what is possible:

```
pantry, full height 2050      local x -1.67 .. -1.04    630mm
upper cupboard + splashback   local x -1.01 ..  0.31   1320mm
counter height only,  900mm   local x  0.31 ..  1.69   1380mm
```

Only **1950mm of it needs full-height backing**. The last 1380mm is a base run
under a worktop, and a base run passes a window perfectly happily — that is
what kitchens do. So the real requirement is 1950mm of backed wall with 1380mm
of anything beyond it, not 3367mm of solid.

The north backed span is 1185mm, still 765mm short of the tall section. That
gap is the whole problem, and closing it is a **plan change**.

---

## 3. What has already been tried, so you do not repeat it

Three placements were attempted and all three failed. They cost most of a
session.

1. **South wall, centred.** The kitchen's south side is not a wall — it is a
   **2400mm doorway from the hall at x 6.59..8.99**. The unit went straight
   across it and the character could not leave the kitchen. This is the one
   the user reported.
2. **North wall.** Worse: seven waypoints blocked, because the solved route
   runs along the north side through the unbacked stretch.
3. Before that, the same class of failure with the media unit in the living
   room — see the commits around `35a983e`.

**The trap that made all of them invisible:** the route is solved *in Blender*
against the walls, the joinery and the **catalogue's** placements. A product
inserted by migration is not in the catalogue, so the solver never sees it.
`tour.json` goes on reading 110 waypoints at 300mm clearance — true, and
solved against a house that no longer exists. Every file-reading test agrees.

`components/homeluxe/tour/clearance.test.mjs` now compares the **live
placements** against the **solved waypoints** and fails by name and millimetre.
Run it after any placement change. It was verified against the real failure
before being trusted.

---

## 4. Doing option 2

The shape of the work, in order. Nothing here is started.

1. **Give the kitchen a backed wall long enough.** Look at
   `blender/houseluxe/config/plan_3bed.py` for the kitchen's north openings.
   Either move or narrow one so the north backed span reaches ~2000mm for the
   tall section, or accept the counter-only end running past a window and
   position accordingly. This is the decision to put to the user — it changes
   the building.
2. **Stop the generator building its own run where the product goes.**
   `blender/houseluxe/config/kitchen.py` — `joinery_footprints()` sets out the
   runs from `backed_spans()`, and `JOINERY_ROOMS = ("kitchen",)`. Geometry is
   `blender/houseluxe/components/kitchen.py`. Both the footprint and the
   geometry must stop together, or you get an invisible obstacle or a visible
   overlap.
3. **Let the solver see the unit.** Its footprint has to reach
   `tour_json._solve(..., furniture)`, otherwise you are back at §3. The
   cleanest route is to declare it where the joinery footprints are declared —
   it *is* a fitted run, and treating it as one gets the door swings and the
   route for free.
4. **The slots tied to the old run** — `SLOT_KITCHEN_WORKTOP`,
   `SLOT_KITCHEN_DOORFRONTS`, `SLOT_KITCHEN_SPLASHBACK`,
   `SLOT_KITCHEN_UNIT_001..005` in `config/slots_3bed.py` — describe joinery
   that will no longer exist. Retire or repoint them, or the admin offers
   positions on a run that is gone.
5. **Rebuild, reseed, re-activate, publish, verify.**

```bash
"/c/Program Files/Blender Foundation/Blender 5.0/blender.exe" \
    --background --python blender/build.py     # check: tour: 16 stops, >=280mm
python supabase/generate_seed.py
python supabase/apply.py --seed-only
python supabase/check_drift.py
# then re-activate the retired slot and placement from migration 0023,
# and publish_scene('3bed', '...') as a platform admin
node components/homeluxe/tour/clearance.test.mjs   # the one that matters
```

A build that reports `UNREACHABLE:` or a clearance test that names the unit
means stop and re-measure, not try another position.

---

## 5. Things worth knowing before you touch anything

- **The clearance ladder is floored at the walker.** `tour_json.py` used to
  degrade to 250/220/200/170mm against a 260mm walker, producing routes the
  character cannot walk. Rungs are now derived from `WALKER_RADIUS`. If the
  build says `UNREACHABLE`, the house genuinely has no walkable route — do not
  reintroduce the narrow rungs.
- **The seed carries height and re-points moved products.** Both were bugs
  fixed this session: `pl["position"]`'s middle value is the height and was
  being written as 0, and a placement whose product changed room kept its old
  slot, so it stood in one room and was listed under another.
- **Uploaded products go in by migration, never through the seed.** The seed
  regenerates from `catalog.json`; a product not in the Blender catalogue would
  be absent from the file and present in the database, which is the drift the
  two are compared to catch. See 0022 (fence) and 0023 (this).
- **Blender**: `"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"`.
  The MCP bridge is flaky but **port 9876 answers a raw socket** — a JSON
  `{"type": "get_scene_info", "params": {}}` works. `build.py` wipes the scene,
  so anything done by hand there is lost on the next build.
- **Rendering an uploaded product on its own** (useful when it cannot be
  placed): there is a working script pattern in this session's scratchpad —
  import the GLB, frame it, `BLENDER_EEVEE` (not `EEVEE_NEXT`, which Blender
  5.0 rejects).
- **Never invent a price, a rate or a subscription.** The unit has no price
  because its listing has none; the TV's Rand ticket is stored at face value in
  a Pula catalogue and flagged rather than converted; CashBuild is not
  subscribed and was not subscribed just to make a picture work.

---

## 6. Also outstanding

From `SYSTEM_AUDIT.md` §14, unchanged and unrelated to this task:

- **No email has ever been sent** — the outbox fills, `/api/notifications/send`
  drains it, nothing calls it. No cron.
- The **Resend key is a test key** limited to one recipient and was pasted in
  chat. Rotate it.
- **Notification links are pinned to a deployment-specific Vercel URL** that
  will rot (migrations 0020, 0021).
- **The Sansui TV and Juliet stand are in bedroom 2, not the lounge** — the
  living/dining is open-plan and has no wall run of 1870mm. The user has been
  told; they may still want the lounge re-arranged instead.
- Seven slots sit in door swings, plus `SLOT_BED2_MEDIA_001` added this
  session. Doors stop against furniture at runtime and `doors.test.mjs`
  asserts every obstructed door still opens wide enough to walk through.
