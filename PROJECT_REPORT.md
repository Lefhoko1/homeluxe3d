# HomeLuxe 3D — project report

*Compiled 16 August 2026, at commit `ba1f9de`.*

---

## 1. What this is

A 3D advertising marketplace. Shops subscribe to the platform and are given
space inside a tourable 3D house. Visitors walk through the property, click
what they see, and get the advert for that exact product — who sells it, what
it costs, whether it is on special. Shops pay for the placement; the platform
sells the positions.

The distinction that shapes everything below: **this is not a showroom.** A
showroom is built once and rebuilt to change. Here, the positions inside the
house are inventory — priced, scheduled, sold, and re-sold when a campaign
ends — so the house has to be editable by an operator, not by a modeller.

---

## 2. State at a glance

| | |
|---|---|
| Commits | 25 |
| Blender package | 49 Python modules |
| Front end | 45 JavaScript modules + 7 routes |
| Database | 24 tables, 43 row-level-security policies, 5 views, 5 migrations |
| 3D assets | 21 GLBs — house 156 KB, site 400 KB, products 156 KB, character 28 KB |
| House plan | 12 rooms, 23 walls, 23 openings |
| Site | 1,200 m² (30 × 40 m), 8 trees, 21 shrubs, pool |
| Live catalogue | 2 shops, 10 products, 32 variants, 16 live placements, 25 slots |
| Deployment | GitHub → Vercel, auto-deploy from `master` |

---

## 3. The four subsystems

### 3.1 The Blender pipeline — geometry

`blender/houseluxe/`, run headless:

```
blender --background --python blender/build.py
```

Generative and idempotent: it wipes the scene first, so running it twice gives
the same result as running it once. Nothing is modelled by hand.

**One component, one GLB.** The house is not a single model. Walls, roof,
ceiling, slab, floors, doors, windows, porch and wall finishes each export
separately, which is what makes it possible to hide the roof, swap the windows
or repaint a room at runtime without touching anything else. That was the
original requirement and the whole file layout follows from it.

**Walls are piers, sills and lintels — never booleans.** A doorway is a real
gap in the geometry rather than a hole cut through a solid, so the walk-through
can use the geometry directly for collision and every door is simply open.

**Draco compression** takes the house from 1,402 KB to 339 KB (−76%). The
decoder is vendored into `public/draco/` rather than pulled from a CDN, so the
app has no third-party runtime dependency.

**The material-name seam.** Blender decides *what a surface is* and bakes the
name into the GLB. Three.js decides *what it looks like*. Neither side knows
anything about the other beyond a shared vocabulary of names. Retexturing the
house is one file in the app; re-cladding a surface is one assignment in
Blender. Nothing is re-exported for a texture change.

### 3.2 The 3D application — presentation

`components/homeluxe/`, Next.js 15 + three.js 0.182.

- **`house/`** — loads the part manifest, applies the material library,
  recentres house and site together on the house's own bounds.
- **`house/textures/`** — procedural canvas textures at 1 canvas = 1 m², plus
  a separate loader for photographic ones.
- **`atmosphere/`** — sky dome and a photographed horizon wrapped around the
  world at 260 m.
- **`lighting/`** — sun, shadows, hemisphere fill.
- **`tour/`** — first-person walk-through: ground-following, three-height
  obstacle probing, step limit.
- **`products/`** — loads the catalogue and places every advertised item.
- **`admin/`** — upload, place, publish.

Panels and scene read **one catalogue**. Selecting a room, a product or a shop
means the same thing in the list, the detail panel and the 3D view, because
all three derive from the same hook. Before that they were two applications in
one window, disagreeing.

### 3.3 The database — the business

Supabase Postgres, reached through PostgREST. `supabase/migrations/`.

**The central idea: a scene is inventory.** A room is not a fixed set of
furniture; it is a set of slots — *"living room, primary sofa position, max
2.4 m wide, against the south wall"*. Slots can be priced, scheduled and
re-sold. That is the difference between a showroom and a business.

```
shops ──< products ──< product_variants ──┐
                                          ├──< placements >── placement_slots >── rooms >── scenes
shops ──< campaigns ──────────────────────┘
```

**Row-level security is on for every table.** The default is deny and each
policy is a deliberate hole. The gate is `shop_is_live()`: a shop must be
active *and* hold a subscription. **An unpaid shop stops being advertised
without anything being deleted** — its rows simply stop matching the read
policy. That is the enforcement point for the whole SaaS.

**Why not Prisma**, given the same Supabase project already runs a Prisma app:
Prisma connects as the `postgres` superuser and **bypasses RLS entirely**.
Every policy would stop applying, and shop A could read shop B's drafts and
enquiries unless every query remembered to filter by shop — which is exactly
the mistake RLS exists to make impossible. Fine for a single-tenant CMS; wrong
for a marketplace whose tenants are competitors. A small object layer over
supabase-js (`lib/models/`) gives objects and methods without giving up the
policies.

**Rotation.** One house, many shops, one sofa position. The roster rotates by
day part (morning / afternoon / evening), and three rules are enforced in the
database rather than in a screen: a shop must be subscribed to join a batch; a
batch is live only during its day part; a placement with no batch is always
live.

**Scoping and promotions.** A product declares which room types it may stand
in, and a trigger refuses a living-room sofa placed in a bedroom. A promotion
carries dates, and when it ends the product leaves both the scene and the room
lists at the same moment, because both read the same view.

### 3.4 The admin module — operation

Uploading a `.glb`, saying who sells it and where it may stand, then placing
it — without a modeller, a rebuild or a deploy.

- **Real authentication.** `?admin=true` used to show the toolbar to anyone who
  typed it and authorise nothing; every write policy resolves through
  `auth.uid()`, so the first save came back *"new row violates row-level
  security policy"*. Sign-in is Supabase's now, and two kinds of admin —
  platform admin and shop owner/manager — are already distinguished by the
  policies, so the same screens serve both.
- **The model is parsed in the browser before it is sent.** That catches a bad
  export immediately, fills the dimensions in from the geometry, counts
  triangles, and measures how far off-origin the model is.
- **The anchor.** An uploaded `.glb` obeys none of the placement contract. The
  correction is *recorded*, not baked: re-exporting in the browser would
  decompress any Draco geometry and make the download bigger. A model already
  built to spec measures `{0,0,0}` and is unaffected.
- **Storage** is governed by the path. The first segment names the owning
  shop, so a shop can read another's files but never write into their folder.
- **Placing is one function call.** A placement's room comes from its slot and
  its position from its own columns; written separately they can disagree, and
  you get a sofa standing visibly in a bedroom while that room's list says it
  is empty. Nothing in the 3D view would show that. One statement makes the
  state unreachable.

---

## 4. Decisions worth remembering

| Decision | Why |
|---|---|
| One GLB per component | A part can be hidden, swapped or reloaded on its own |
| Walls as piers/sills/lintels | Doorways are real gaps, so collision is free |
| Material name as the seam | Retexture without re-exporting |
| Position is data, geometry is an asset | Moving a sofa is an `UPDATE`, not a rebuild |
| Static `catalog.json` fallback | An advertising site that goes blank when its database hiccups is worse than one showing yesterday's layout |
| RLS over an ORM with superuser rights | The tenants are competitors |
| Slots, not fixed furniture | The unit you sell, like a billboard |
| Public-read storage buckets | There is nothing private about an advert, and signing every URL costs a round trip before the scene can draw |
| Lawn fitted, not tiled | Every copy of a photograph carries the same bare patch; the eye finds the grid |
| Anchor recorded, not baked | Rewriting the file would make the download bigger |

---

## 5. What was verified, and how

The headless browser harness proved unreliable for this scene — two runs at
500 s and 600 s showed the panels populated while the canvas still reported
loading, with no error logged. Verification moved to Node tests against live
data, DOM dumps, and direct database probes.

| Check | Result |
|---|---|
| Coordinate round trip mm ↔ three.js | 5 checks, including ten save/load cycles with zero drift |
| Anonymous placement attempt | Refused by RLS |
| Admin place / move / remove | Correct; the slot follows the object between rooms |
| Sofa dragged into a bedroom | Refused by the scoping trigger |
| Storage writes: anon / non-member / admin / bad path | refused / refused / allowed / refused |
| Sign-in through the real auth API | Succeeds; places and removes a placement end to end |
| Catalogue read against live database | 16 rows → 5 objects + 11 finishes, every object carrying its variant |
| Lawn tile seam step | 135 → 0 luminance after levelling |
| Lawn UV fit | Four site corners land on four image corners, exactly once |
| Perimeter ground probe | Boundary turf −496 mm to −150 mm, measured against the site spec |
| Production build | Clean, 7 routes |

### Bugs found by verifying rather than assuming

- **three.js was loading twice** — five CDN script tags at r128 alongside the
  npm 0.182 package.
- **`SceneBuilder.build()` returned the accumulated list**, so every export
  batch exported everything.
- **A negative test that passed for the wrong reason** — the first scoping
  test moved a deliberately unscoped rug. Retargeted at the sofa, the
  validator fired correctly.
- **Locale drift** — Node formatted `18 999`, the browser `18,999`, causing a
  hydration mismatch. Pinned to `en-GB`.
- **The featured-shops banner showed one shop** — the DOM had four chips; the
  container was missing `grid-column: 1 / -1`.
- **`placement_slots` had no write policy.** Read-only with RLS on means deny,
  so every slot in the database got there through the seed running as
  superuser. The first attempt from the app would have failed.
- **Accounts predating migration 0001 had no profile row**, so no role, so
  `is_platform_admin()` was false forever — indistinguishable from a broken
  login.
- **A hand-inserted `auth.users` row with NULL token columns** makes every
  sign-in fail with *"Database error querying schema"*. GoTrue reads them into
  non-nullable Go strings. The password verifies correctly the whole time.
- **The ceiling did not cast shadows.** The roof blocked the sun and the
  ceiling did not, so light poured through the ceiling plane of every room
  onto the furniture — the "house full of openings" effect.
- **The orbit camera walked through walls**, putting the lawn in front of the
  living room.

---

## 6. Known gaps

**Product**

- No payment integration. `shop_subscriptions.external_ref` is where a
  provider id would go; nothing writes it.
- Notifications are rows, not delivery. The trigger fans a published post out
  to followers; email and push are not wired.
- No self-service sign-up for shops. A shop and its staff are created in SQL.
- Slot fitting is advisory. `max_width_mm` and friends are not enforced in
  SQL — the app must check a product fits.

**Admin**

- Finishes cannot be uploaded. Paint, gamazine and tiles are still authored in
  Blender; the form offers only object categories.
- Upload creates one `default` variant, so a second colourway needs a row.
- No undo beyond Revert, which restores the transform an object had when it
  was selected.

**Scene**

- The lawn image is a **watermarked stock photo**. Stretched over the site the
  watermark appears once, large, in the middle of the yard. Replacing the file
  needs no code change.
- The tree is ~54k triangles, so the garden is ~430k, drawn again for the
  shadow pass. This is now the most expensive thing in the scene; decimating
  to ~15k would cost nothing visually at yard distance.
- Up to 346 mm of soil edge is visible where the boundary turf sits in a flat
  zone. Behind the fence. The clean fix is a flat apron in the Blender site
  builder.
- No interior lights as fittings — the hemisphere light stands in for
  skylight.

**Operational**

- **The Supabase project is shared with another application** — 33 further
  tables, `_prisma_migrations`, two real users, and **RLS off** on all of
  them. HomeLuxe's own 24 tables are fully policied and unaffected, but the
  project is not isolated.
- Rendered output has never been confirmed pixel-by-pixel by an automated
  check; visual verification has been by screenshot.

---

## 7. Running it

**Locally**

```bash
npm install
npm run dev
```

Without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` the app
falls back to the static `catalog.json` and behaves as a read-only showroom.
With them it reads the database and the admin tools become available. The
console reports which: `[catalog] source: supabase` or `static`.

**Rebuilding the 3D assets**

```bash
blender --background --python blender/build.py
```

Regenerates every GLB, `catalog.json` and `trees.json`. Idempotent.

**The database**

```bash
python supabase/apply.py            # migrations + seed
python supabase/apply.py --verify   # report only
```

The direct database host is IPv6-only; use the session pooler at
`aws-0-eu-north-1.pooler.supabase.com:5432`. See `supabase/CONNECTING.md`.

**Deployment** is automatic from `master` to Vercel. Environment variables must
be set in the Vercel project *and the site redeployed* — Vercel only injects
them at build time.

---

## 8. Where to look

| Question | File |
|---|---|
| How the house is generated | `blender/houseluxe/` |
| How a part becomes a texture | `components/homeluxe/house/textures/materialLibrary.js` |
| What the app reads and from where | `lib/catalog/repository.js` |
| The schema and its reasoning | `supabase/README.md` |
| Admin, storage, and placing | `supabase/ADMIN.md` |
| Coordinate systems | `lib/scene/transforms.js` |
