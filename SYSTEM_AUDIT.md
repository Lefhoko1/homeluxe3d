# HomeLuxe 3D — system audit

*Compiled from the code and the live database at commit `f53a4ac`.*

Everything below was read from the repository or queried from the production
Supabase instance while writing. Where something is **not** built, or is built
but not working end to end, it says so — see §14, which is the part worth
reading first if you are deciding what to do next.

This supersedes `PROJECT_REPORT.md`, which was written at commit `ba1f9de` and
predates twenty-one commits, eleven migrations, the visitor pages, the front
page, the enquiry system and the full-screen showroom. That file should
probably be deleted.

---

## 1. What the product is

A **virtual shopping house for Gaborone**. The platform builds and operates one
very good 3D house. Furniture and finishing shops pay to have their real
products placed inside it. Visitors walk through the house, click what they
see, and get the advert for that exact product — whose it is, what it costs,
whether it is on offer — and can ask the shop about it.

The commercial claim rests on one idea: **furniture is bought in rooms, not in
grids**. A sofa on a white background is a photograph; the same sofa at its own
size, in a room of known dimensions, against a wall, beside a wardrobe, is a
decision. A catalogue cannot make that argument and a walkable house can.

Two consequences shape the whole system:

- **The house is surveyed, not sketched.** Rooms have real millimetre
  dimensions, doors swing on hinges into the rooms they serve, walls stop you,
  and a bed that would not fit does not go in. That constraint *is* the
  product; a showroom where everything fits is a catalogue with better pictures.
- **Positions are scarce.** There is a fixed number of places a thing can
  stand. 131 slots are active; 20 are filled. Scarcity is what makes a position
  worth paying for, and the front page quotes the free count as an invitation.

**The platform does the 3D work.** Almost nobody selling sofas in Gaborone has
a 3D artist. Shops send photographs and measurements; the platform models,
textures and places. That is the `content_requests` pipeline in §7.

---

## 2. Users, and what each can do

Five distinct kinds of person use the system. Three have accounts.

| Who | Signs in? | Where they go | What they can do |
|---|---|---|---|
| **Visitor (anonymous)** | No | `/`, `/showroom` | Walk the house, take the guided tour, click products, read adverts and prices, read the shop rail, send a contact-form message |
| **Visitor (registered)** | Yes | `/join`, `/following`, `/showroom` | All of the above, plus follow shops, choose email preferences, receive notifications, **ask a shop about a product**, read the shop's reply |
| **Shop member** | Yes | `/admin` | Manage their own shop only: products, variants, media, assets, campaigns, placements, enquiries, their own analytics |
| **Platform staff** | Yes | `/admin` | Everything in scope of their role — see the role table below |
| **Blender operator** | n/a | local machine | Runs the generator, rebuilds the house, exports manifests, applies migrations. Not a web user at all |

### 2.1 The authorisation model (read from the database)

Two independent mechanisms, deliberately:

**Platform roles** — `roles`, `permissions`, `role_permissions`, `profile_roles`.
Seven roles, eighteen permissions, sixty-five grants.

| Role | Scope | Perms | Description as stored |
|---|---|---:|---|
| `super_admin` | platform | 18 | Everything, including roles and platform settings |
| `admin` | platform | 17 | Day-to-day running of the platform. Not roles or settings |
| `content_manager` | platform | 9 | The catalogue and the house: products, materials, slots, placements |
| `reviewer` | platform | 6 | Approves products and assets. Changes nothing else |
| `asset_manager` | platform | 5 | Uploads and processing. Does not decide what is sold or where |
| `shop_manager` | shop | 6 | Full control of one shop: its products, assets and campaigns |
| `shop_editor` | shop | 4 | Edits one shop's products. Cannot publish or manage members |

The eighteen permissions: `analytics.read`, `asset.approve`, `asset.process`,
`asset.upload`, `audit.read`, `campaign.manage`, `house.manage`, `house.read`,
`material.manage`, `placement.manage`, `platform.manage`, `product.approve`,
`product.manage`, `product.read`, `scene.publish`, `scene.rollback`,
`shop.manage`, `shop.read`.

**Shop membership** — `shop_members`, with role `owner` / `manager` / `editor`.
A person can manage a shop without being platform staff.

The two meet in four SQL helpers used throughout the policies:
`is_platform_admin()`, `has_permission(code)`, `can_manage_shop(shop)`,
`is_shop_member(shop)`.

---

## 3. Architecture

```
                    ┌──────────────────────────────────────┐
   BUILD TIME       │  blender/  (Python, 65 modules)      │
   local only       │  plan → components → GLB + manifests │
                    └───────────────┬──────────────────────┘
                                    │  .glb, collision.json, doors.json,
                                    │  slots.json, tour.json, lights.json,
                                    │  catalog.json      → public/models/
                                    ▼
   RUN TIME         ┌──────────────────────────────────────┐
   Vercel           │  Next.js 15 App Router (JS/TS only)  │
                    │  React 18 · three.js 0.182 · Tailwind│
                    └───────────────┬──────────────────────┘
                                    │  supabase-js (anon key, RLS enforced)
                                    ▼
                    ┌──────────────────────────────────────┐
                    │  Supabase / Postgres                 │
                    │  41 tables · 16 views · 70 functions │
                    │  24 triggers · 5 storage buckets     │
                    └──────────────────────────────────────┘
```

**Python never runs on Vercel.** Vercel builds and serves JavaScript only. The
Blender package is a local build tool whose *output* — GLB geometry and JSON
manifests — is committed to `public/models/` and served as static files. There
is no Python runtime in production.

**Stack:** Next.js 15.5.9, React 18.3.1, three.js ^0.182, `@supabase/supabase-js`
^2.112, Tailwind 4.1.11 with HeroUI. One serverless route (§9).

---

## 4. Routes and views

| Route | Kind | Purpose |
|---|---|---|
| `/` | static | Company front page. Hero with a **live interior 3D view** of the house, real platform counts, how-it-works, services, shop rail, about, contact form |
| `/showroom` | static | The application. Full-bleed 3D house with floating panels |
| `/join` | static | Register / sign in, then follow shops |
| `/following` | static | A visitor's own page: shops followed, notifications, email preferences, their enquiries and the shops' replies |
| `/admin` | static | The management application — fourteen sections behind one shell |
| `/api/notifications/send` | dynamic | Drains the email outbox (§9) |
| `/error.tsx` | — | Error boundary |

### 4.1 The showroom layout

The canvas is full-bleed under a 62px bar; every panel floats over it as
frosted glass at 68% opacity. Panels: shops filter and room list (left dock),
room pills (top centre), product detail (right), the walking pad (bottom left,
while touring), mode switcher (bottom centre), "Shop this room" total (bottom
right), and a vertical column of camera buttons.

The glass opacity is a measured number, not a taste: secondary text darkens to
`#46483F`, the lightest ink clearing 4.5:1 against every ground the house shows
(lawn 7.0, roof 4.9, sky 8.5, pool 6.4).

---

## 5. The data layer

### 5.1 Scale

- **41 HomeLuxe tables**, all with row-level security on, 73 policies between them
- **16 views**, 11 of which are `security_invoker = on`
- **70 functions**, 38 of them `SECURITY DEFINER`
- **24 triggers**
- **5 storage buckets**: `images`, `product-media`, `product-models`,
  `material-maps` (public) and `documents` (private)

> **A second application shares this database.** Thirty-three Prisma-managed
> tables (`User`, `Page`, `Order`, `Lesson`, `Story`, …) sit in the same
> `public` schema with **RLS off and no policies**. They belong to a different
> product. This was raised and the decision was to leave them alone. They are
> not HomeLuxe's, but they are exposed through the same PostgREST endpoint and
> the same anon key, so anything readable there is readable by anyone with the
> site's public key. Worth revisiting.

### 5.2 Table groups

**Identity and access** — `profiles`, `roles`, `permissions`, `role_permissions`,
`profile_roles`, `shop_members`, `audit_logs`

**Commerce** — `shops`, `plans`, `shop_subscriptions`, `campaigns`,
`ad_batches`, `batch_shops`, `promotions`

**Catalogue** — `products`, `product_variants`, `product_media`,
`product_specs`, `product_categories`, `product_room_types`, `materials`,
`material_maps`, `material_slot_types`

**The house** — `scenes`, `rooms`, `slot_types`, `placement_slots`,
`placements`, `published_scenes`

**Production pipeline** — `assets`, `asset_versions`, `content_requests`

**Engagement** — `interaction_events`, `enquiries`, `enquiry_replies`,
`shop_follows`, `shop_posts`, `notifications`, `email_outbox`,
`contact_messages`, `platform_secrets`

### 5.3 The views

| View | Cols | Security | What it answers |
|---|---:|---|---|
| `v_live_placements` | 49 | definer | Every advertised thing in the house, flattened: product, variant, shop, promotion, position, room name and order |
| `v_current_scene` | 4 | definer | The newest **published** snapshot — what a visitor sees |
| `v_landing_showcase` | 50 | invoker | The placements an admin ranked for the front page, in order |
| `v_available_slots` | 12 | definer | Positions still free |
| `v_admin_products` | 22 | invoker | The catalogue for the admin list |
| `v_content_queue` | 14 | invoker | The done-for-you production queue |
| `v_shop_daily_stats` | 7 | invoker | Views, clicks, enquiries per shop per day |
| `v_daily_traffic` | 8 | invoker | Platform traffic, with visitor identity |
| `v_signups` | 3 | invoker | Registrations over time |
| `v_enquiry_threads` | 16 | invoker | Enquiries with their reply counts |
| `v_shop_members` | 8 | invoker | Who can manage which shop |
| `v_shop_follower_counts` | 5 | invoker | Followers per shop |
| `v_material_finishes` | 12 | definer | Materials with their uploaded maps |
| `v_batch_schedule` | 12 | invoker | Which shops are on show when |
| `v_email_health` | 3 | invoker | Outbox queue depth by state |
| `v_platform_summary` | 5 | definer | Rooms, shops, products, positions, positions free — the front page's counts |

`security_invoker = on` matters: without it a view runs as its owner and
**bypasses RLS**. Migration 0013 exists because four admin views were readable
by `anon` for exactly that reason.

### 5.4 Published scenes

The house a visitor sees is a **snapshot**, not the live tables.
`publish_scene(slug, notes)` resolves `v_live_placements` into a JSON payload
and stores it as a new version; `rollback_scene(slug, version)` reinstates an
earlier one. Currently at **version 8, published**, with 7 and 6 archived.

Admins read the live draft so their edits appear as they make them; visitors
read the published snapshot. `fetchSceneCatalog({ live })` picks which.

---

## 6. CRUD, by entity

"Who can do what where", read from the RLS policies.

| Entity | Create | Read | Update | Delete | Where |
|---|---|---|---|---|---|
| **Products** | shop member, platform | public if published; members always | shop member | via status | Admin → Products |
| **Variants / media / specs / room types** | shop member | follows the product | shop member | yes | Admin → Products |
| **Materials** | platform (global) or shop | anyone | owner | yes | Admin → Materials |
| **Material maps** | material's owner | anyone | owner | yes | Admin → Materials |
| **Assets / versions** | shop member or platform | members + platform | owner | yes | Admin → Assets |
| **Placements** | `can_manage_shop` | live ones public; own always | shop member | status `removed` | Admin → Placements, and drag-in-3D |
| **Slots** | platform admin only | active ones, published scenes | platform admin | platform admin | Admin → Slots |
| **Showcase rank** | platform admin via RPC | public | platform admin | set null | Admin → Placements |
| **Shops** | any signed-in user | active ones, or own | `can_manage_shop` | — | Admin → Shops |
| **Shop members** | `can_manage_shop` | self or manager | manager | manager | Admin → Shop members |
| **Campaigns** | shop member | shop member | shop member | shop member | Admin → Campaigns |
| **Promotions** | shop member | live shops public | shop member | yes | Admin → Products |
| **Content requests** | shop or `product.manage` | members + staff | `product.manage` | — | Admin → Made to order |
| **Enquiries** | **signed-in visitor only**, own id, live shop | asker or shop | shop can set status | — | Showroom dialog → Admin → Enquiries |
| **Enquiry replies** | author, party to the thread | either party | — | — | Both sides |
| **Follows** | own only | own only | own | own | `/join`, `/following`, shop chips |
| **Notifications** | trigger only | own only | own (mark read) | — | `/following` |
| **Contact messages** | **anonymous allowed** | platform admin only | platform admin | — | `/` → Admin |
| **Interaction events** | anyone (insert-only) | shop member or platform | — | — | Automatic |
| **Roles / permissions** | `platform.manage` | any signed-in | `platform.manage` | `platform.manage` | Admin → People |
| **Published scenes** | `scene.publish` | published, or staff | rollback | — | Admin → Publishing |
| **Audit log** | trigger / RPC | `audit.read` | — | — | Admin → Audit log |

Two deliberate asymmetries worth noting:

- **Enquiries require an account; contact messages do not.** An enquiry is
  answered *in the app*, so the asker needs somewhere to receive the reply. A
  contact message is answered by email to an address they typed. Requiring an
  account to ask "can my shop advertise with you" would turn away the people
  the front page exists to attract.
- **Featuring on the front page is platform-only, through an RPC.** Postgres has
  no per-column RLS, so any policy loose enough to let a shop straighten its own
  sofa would also let it put itself on the front page. `set_showcase_rank`
  checks `is_platform_admin()` and refuses everyone else.

---

## 7. The admin module

One shell, fourteen sections, at `/admin`. The section lives in the URL hash so
a screen can be linked to and reloaded. Nav hides what a role has no business
in — *courtesy*; the database refuses the rows anyway — *security*. If they
disagree the database wins.

| Group | Section | Who | What it does |
|---|---|---|---|
| — | **Dashboard** | all staff | Counts and jumps into the other sections |
| The house | **Slots** | `house.manage` | The 131 advertising positions: type, room, size, active |
| The house | **Placements** | shop member+ | What stands where. Take out / put back. **Front-page column** (platform only) |
| The house | **Publishing** | `scene.publish` | Publish a snapshot, roll back to a version |
| Catalogue | **Products** | shop member+ | Products, variants, media, specs, promotions; upload models |
| Catalogue | **Materials** | `material.manage` | Materials and their PBR maps |
| Catalogue | **Assets** | `asset.upload` | Uploaded GLBs, versions, validation |
| Catalogue | **Made to order** | `product.manage` | The done-for-you queue: a shop sends photos, staff model it |
| Commercial | **Shops** | platform only | Shops, status, subscriptions |
| Commercial | **Campaigns** | shop member+ | Ad campaigns |
| Commercial | **Enquiries** | shop member+ | Threads from visitors, and replying to them |
| Commercial | **Analytics** | `analytics.read` | Traffic, signups, per-shop daily stats |
| Platform | **People & roles** | platform only | Assign roles to people |
| Platform | **Audit log** | `audit.read` | Who did what |

Also present but not in the nav: `ShopMembers.jsx` and `MaterialMaps.jsx`
(reachable from their parent sections), `AdminBar`/`PlacementEditor` (the
in-3D drag-to-place gizmo), `UploadDialog`, `RequestQueue`.

**All admin data goes through one class**, `lib/admin/AdminData.js` — no section
holds a Supabase query of its own, so two screens cannot disagree about what
"live" means.

---

## 8. What Blender builds

`blender/houseluxe/` is a **generative** package: 65 Python modules, no manual
modelling. A plan expressed as dataclasses produces geometry and manifests.
Run with `blender/build.py`.

```
config/      plan_3bed.py  the house: walls, rooms, openings, slab, roof
             site_3bed.py  the plot: lawn, paving, pool, fence, planting
             slots_3bed.py 131 advertising positions
             swing.py      which way each door opens, and how far
             joinery.py    door and window sections
             kitchen.py    the fitted kitchen

core/        component.py  the build protocol
             geometry.py, mesh.py, wallmath.py, units.py, scene.py

components/  slab · floors · walls · wallfinish · openings · ceiling · roof
             porch · kitchen · lights · hardware · character · products
             site/ ground · paving · planting · pool · poolfence · fence

catalog/     the shops and their products, as Python
             shops/bradlows/lounge.py, shops/bears/beds.py, shops/tubod/
             placements/house_3bed.py — where each thing stands

materials/   library.py — the material contract shared with the browser

export/      gltf.py · collision_json · doors_json · slots_json
             tour_json · lights_json · catalog_json · planting_json
```

### 8.1 Geometry produced

Sixteen GLB parts under `public/models/`, ~870KB total, Draco-compressed:
`slab`, `floors`, `walls_exterior`, `walls_interior`, `wall_finishes`,
`windows`, `doors`, `ceiling`, `lights`, `porch`, `roof`, plus the site:
`yard_ground`, `yard_paving`, `yard_beds`, `pool`, `pool_fence`,
`yard_planting`, `yard_hedges`, `yard_fence`.

### 8.2 Manifests produced — the contract with the browser

| File | Size | What the browser cannot work out for itself |
|---|---:|---|
| `collision.json` | 14KB | Wall rectangles to be pushed out of, and room rectangles with labels |
| `slots.json` | 56KB | The 131 positions: id, room, size, anchor |
| `tour.json` | 12KB | 109 solved waypoints and 16 named stops, at 300mm clearance |
| `doors.json` | 3.4KB | Which object is a leaf, where its hinge is, which way it swings, and how far |
| `lights.json` | 5.1KB | 26 fittings, 6 lit at a time |
| `catalog.json` | 27KB | Shops, products and placements as built |

The doors manifest is the clearest example of why these exist. A door in a GLB
is a slab of geometry; to swing it the browser needs the leaf, the hinge axis
and the width, and **which way it is hung** — decided from the plan, because a
door opens into the room it serves. It used to be decided per visitor in the
browser ("open away from whoever approaches"), which is a fair answer to "we do
not know" and produced a front door that swung through the sofa.

### 8.3 Drift detection

`supabase/check_drift.py` compares `catalog.json` and `slots_3bed.SLOTS`
against the database to 0.5mm and exits non-zero on disagreement. It runs from
`export_navigation.py`. **Currently clean**: 131 authored slots, 131 active in
the database, all in the right place.

---

## 9. Flows

### 9.1 A visitor arrives

`/` → live counts from `v_platform_summary` → the hero loads the **house
itself**, camera inside a room, looking at whatever an admin ranked first →
"Walk to it" → `/showroom?product=<slug>` → the showroom reads the parameter,
finds the product in any room, selects it and cancels the opening film.

### 9.2 The showroom

Catalogue via `fetchSceneCatalog` (published snapshot for visitors, live draft
for admins) → house GLBs load → products load and are placed → placed finishes
recolour the floors and walls → uploaded textures applied over the top → the
route loads **last** → the tour becomes available and the opening film starts
itself.

Clicking a product — in the list *or* in the 3D view — while the guided tour is
walking raises one question on the bar: *pause and go to it, or keep touring?*
Pausing keeps the walk's place; resuming continues from exactly there.

### 9.3 A visitor asks a shop

Enquire → must be signed in (said *before* the textarea, not after) → row in
`enquiries` → `attribute_interaction` fills shop, variant and scene from the
placement → shop sees it in Admin → Enquiries → replies → `notify_enquiry_reply`
writes a notification **and** an `email_outbox` row → visitor sees it at
`/following` and by email.

### 9.4 Following and notification

Follow a shop (`shop_follows`, searched by primary key, never by typed name) →
choose `notify_products` / `notify_posts` → a shop publishes a product →
`fanout_new_product` calls `notify_followers` → one `notifications` row and one
`email_outbox` row per follower who opted in → the outbox is drained by
`POST /api/notifications/send`, which claims a batch with
`claim_email_batch(secret, limit)` (`for update skip locked`), sends through
Resend, and settles each row with `finish_email`.

### 9.5 Done-for-you production

Shop sends photographs and measurements → `content_requests` row → staff work
it in Admin → Made to order → model built in Blender or uploaded →
`register_asset` measures it at upload and records width/depth/height/triangles
→ `validate_asset_version` compares against the declared size → product created
→ placed → scene published.

### 9.6 Publishing

Admin edits → sees the live draft → **Publish** → `publish_scene` resolves
`v_live_placements` into a snapshot → visitors see the new version on next
load. `rollback_scene` reinstates an older one.

---

## 10. The 3D client

| Concern | Module | Note |
|---|---|---|
| House loading | `house/HouseLoader.js` | 16 parts, shared Draco decoder, recentred on the origin |
| Materials | `house/textures/` | Procedural by default; database maps override by Blender material name |
| Products | `products/ProductLoader.js` | One fetch per product, cloned per placement |
| Walking | `tour/TourController.js` | Third and first person, guided route, showcase stops |
| Collision | `tour/collision.js` | Circle-vs-AABB pushout, 260mm walk radius; doors are dynamic obstacles at every angle |
| Doors | `house/doors.js` | Swing limited by what is actually standing in the arc |
| Motion | `tour/easing.js` | Frame-rate independent damping, critically damped springs, tween runner |
| Landing view | `landing/HouseView.jsx` | The same house, framed from a room corner |

### 10.1 Motion

Turning is a **critically damped spring** (`smoothDampAngle`) rather than a
constant angular velocity: it accelerates in, decelerates out and never
overshoots. Camera follow is **exponential decay over time**, so it behaves
identically at 30, 60 and 144Hz — a per-frame `lerp(target, 0.35)` is 2.4×
faster on a 144Hz screen and slower exactly when the frame rate dips. Walking
ramps, braking ~3× quicker than accelerating, because the guided route stops
driving *in order to* turn and anything still rolling arcs into the door jamb.

---

## 11. Tests

Ten suites, all passing, all runnable with `node <file>`:

| Suite | Proves |
|---|---|
| `tour/walk` | The solved route reaches 16 of 16 stops against the real furniture |
| `tour/rotation` | Turning takes the short way and settles on the heading |
| `tour/showcase` | Every room's advertised things are looked at |
| `tour/pause` | The walk keeps its place when held and resumes from it |
| `tour/focus` | Every one of 18 placements focuses something, finishes included |
| `tour/walker` | The avatar is never drawn in first person, in any call order |
| `tour/easing` | Identical settling at 30/60/144Hz; the spring never overshoots |
| `house/doors` | No leaf passes through furniture; every blocked door still opens wide enough to walk through; the slider opens in time |
| `landing/showcase` | The front page's data against the live database |
| `lib/scene/transforms` | Millimetre ↔ three.js conversion |

Plus `supabase/check_drift.py`.

**Not covered by any test:** occlusion. Nothing checks that a floating panel is
actually *visible* rather than merely present in the DOM — which is exactly how
the walking pad spent three commits hidden under the product dock.

---

## 12. Migrations

Twenty-one, all applied to production.

| # | Title |
|---|---|
| 0001 | Core schema |
| 0002 | Room scoping and promotions |
| 0003 | Advertising batches — rotating which shops are on show |
| 0004 | Expose the surface a finish dresses |
| 0005 | Admin module: storage buckets, asset anchoring, placing by hand |
| 0006 | Slot identity and slot types |
| 0007 | Assets, and versions of them |
| 0008 | Materials as things, not as strings |
| 0009 | Roles, permissions, and a record of who did what |
| 0010 | Published scenes |
| 0011 | The content pipeline |
| 0012 | Measure the model at the moment it is uploaded |
| 0013 | Views were bypassing row-level security |
| 0014 | Analytics that can actually be attributed |
| 0015 | Following a shop, and being told when it publishes |
| 0016 | Material ingestion, and shop membership |
| 0017 | What you want to hear about, and an email worth opening |
| 0018 | Rooms name and order themselves |
| 0019 | Enquiries that go somewhere, and knowing who is in the house |
| 0020 | A front door, and somewhere for it to send a message |
| 0021 | What the front page shows, decided in the admin |

---

## 13. Current data

| | |
|---|---:|
| Shops | 4 — Bradlows, Bears, Tubod Enterprises, CashBuild |
| Products | 12 |
| Variants | 34 |
| Product categories | 23 |
| Rooms | 14 |
| Active slots | 131 |
| Live placements | 20 |
| Published scene | version 8 |
| Registered profiles | 5 |
| Interaction events | 188 |
| Enquiries / replies | 2 / 2 |

Bradlows advertises 5 pieces; Bears 1 (the Slumberland bed); Tubod 13 finishes
across 8 rooms; CashBuild is registered but places nothing yet.

---

## 14. Gaps — what is built, half-built, and absent

Read this section before planning.

### Not working end to end

1. **No email has ever been sent.** The outbox fills correctly and
   `/api/notifications/send` drains it correctly, but **nothing calls it** —
   there is no Vercel cron. Four environment variables also need setting in
   Vercel project settings. Until then, every notification is a database row
   and nothing more.
2. **Resend is on a test key** restricted to one recipient
   (`bobaathebelefhoko@gmail.com`) and sends from `onboarding@resend.dev`. A
   verified domain is needed before anyone else can be emailed. **That key has
   been pasted in chat and should be rotated.**
3. **No PBR material has maps uploaded.** The ingestion path exists and the
   admin screen exists; nobody has used it, so every surface is still
   procedural.

### Known defects

4. **Seven slots sit inside door swing arcs** — living sofa, bed2 wardrobe,
   bed3 bed and dresser, ensuite shower and vanity, WC basin. Reported at every
   build. Doors now stop against furniture rather than passing through it, so
   the symptom is a door that opens only part-way.
5. **The `.blend` needs one full Blender run** to restage the moved master bed.
   Cosmetic, and the manifests are already correct.
6. **A narrow-window layout reading was inconsistent** — at 1000×700 the stage
   measured as collapsed, while 1100×780 was correct. Unresolved; may be an
   artifact of the headless viewport override rather than a real bug. Worth
   checking in a small browser window.
7. **Notification links are pinned to a deployment-specific URL.** Migrations
   0020 and 0021 build links against
   `homeluxe3d-gzn6xgsim-…vercel.app` — one deployment's alias, not the stable
   `homeluxe3d.vercel.app`. It will rot.

### Absent by decision

8. **No ratings, reviews, "saved", "compare", search, or room thumbnails.**
   The reference design shows them; none exists in the database, and inventing
   "4.8 (24 reviews)" against a real shop's product is not acceptable.
9. **No payment.** `plans` and `shop_subscriptions` model the commercial
   relationship; nothing charges anybody.
10. **RLS is off on 33 tables** belonging to another application sharing this
    database. Left alone by decision — see §5.1.

### Operational

11. **The database password** is in `.env.local` (gitignored, confirmed
    untracked) and was pasted in chat. To be rotated when development ends.
12. **`PROJECT_REPORT.md` is stale** by twenty-one commits and should be
    deleted in favour of this file.

---

## 15. How to run it

```bash
npm run dev                  # or npm run build && npm start
node components/homeluxe/tour/walk.test.mjs      # any suite, directly
python supabase/check_drift.py                   # data vs geometry
python supabase/apply.py                         # apply migrations
blender --background --python blender/build.py   # rebuild the house
```

Environment (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `RESEND_API_KEY`,
`RESEND_FROM`, `NOTIFY_SECRET`.
