# Database — 3D advertising marketplace

Shops subscribe to the platform and are given advertising space inside 3D
scenes. Visitors tour those scenes, click what they see, follow shops, and get
notified when those shops post.

```
supabase/
  migrations/0001_init.sql   schema, helpers, row-level security, read views
  generate_seed.py           builds seed.sql from the data the app already has
  seed.sql                   GENERATED — do not edit by hand
```

## The central idea: a scene is inventory

A house is not a fixed set of furniture. It is a set of **slots** — *"living
room, primary sofa position, max 2.4 m wide, against the south wall"*. Shops
fill slots with their products through campaigns.

That is the difference between a showroom and a business. A hand-built
showroom has to be rebuilt to change; slots are **the unit you sell**, the same
way a billboard is. They can be priced (`base_price_cents`, `is_premium`),
scheduled (`campaigns.starts_at/ends_at`), and re-sold when a campaign ends —
without a modeller touching Blender.

```
shops ──< products ──< product_variants ──┐
                                          ├──< placements >── placement_slots >── rooms >── scenes
shops ──< campaigns ──────────────────────┘
```

## Objects and finishes

Not everything advertised is an object. A tile is not *placed* — the floor
already exists and the tile decides what it looks like. So a variant carries
**either**:

- `model_url` — a glTF to stand in a slot, or
- `material_name` + `texture_url` — a finish that dresses a named surface

`variant_has_an_asset` enforces that it carries at least one. `material_name`
matches the Blender material name, which is the same identifier the 3D app
uses to swap textures — so *"which shop supplied this floor?"* is answerable
for any surface in the house.

## Security model

Row-level security is on for **every** table; the default is deny and each
policy is a deliberate hole.

| Who | Sees |
|---|---|
| Anonymous visitor | Published products of **live** shops, live placements, public posts |
| Shop staff | Everything belonging to their shop, including drafts |
| Shop owner/manager | The above, plus write access |
| Platform admin | Everything |

The gate is `shop_is_live()`: a shop must be `active` **and** hold a
subscription in `trialing`/`active`. **An unpaid shop stops being advertised
without anything being deleted** — its products simply stop matching the read
policy. That is the enforcement point for the whole SaaS.

Membership is a table (`shop_members`), not an `owner_id` column, because real
shops have staff and ownership changes hands. The helper functions are
`SECURITY DEFINER` so a policy on `shop_members` cannot recurse into itself.

## Running it

Nothing here has been executed — there is no Supabase project yet. In the SQL
editor of a new project:

1. Run `migrations/0001_init.sql`
2. Run `seed.sql`

Then copy `.env.example` to `.env.local` and fill in the project URL and anon
key. Until you do, the app falls back to the static catalogue and behaves
exactly as it does today.

Regenerate the seed after changing the Blender catalogue or the plan:

```
python supabase/generate_seed.py
```

## The seed is generated, not written

It is derived from two things that are already the truth:

- `public/models/products/catalog.json` — shops, products, placements
- `blender/houseluxe/config/plan_3bed.py` — rooms and their finishes

so the database starts out **agreeing with the 3D scene** instead of drifting
from it on day one. Each existing hand-authored placement becomes a slot, so
the current layout turns into sellable inventory rather than being thrown away.

## What the app reads

`v_live_placements` — one row per placed thing, product and shop denormalised
onto it. The 3D client fetches that single view instead of assembling six
joins in the browser, and it is shaped to match `catalog.json` so the front end
can read either source.

`v_shop_daily_stats` — views, clicks, expands and enquiries per day. This is
what a shop is paying for: proof its placement was seen.

## Known gaps

- **Not executed anywhere.** Validated by parsing against a Postgres grammar,
  not by running it. Expect to fix something on first run.
- **No admin UI.** The schema and policies support one; the screens do not
  exist. `isAdmin` in the app is still a URL parameter, not auth.
- **No payment integration.** `shop_subscriptions.external_ref` is where a
  provider id would go; nothing writes it.
- **Notifications are rows, not delivery.** The trigger fans a published post
  out to followers; email/push is not wired.
- **Slot fitting is not enforced in SQL.** `max_width_mm` and friends are
  advisory — the app must check a product fits before assigning it.
- **No storage buckets.** Models and textures are still served from
  `public/`. Shop-uploaded assets need Supabase Storage and a policy set.
