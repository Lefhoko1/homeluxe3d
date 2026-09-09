-- =============================================================================
-- A kitchen unit that did not come out of the generator
--
-- Every product in the house so far was modelled by `blender/houseluxe` and
-- reached the database through the seed, which is derived from catalog.json.
-- This one arrived as a finished .glb from outside: 98 named objects, seven
-- PBR materials, 1,988 triangles, 3367 x 676 x 2050mm, metres, Y up.
--
-- IT THEREFORE CANNOT COME THROUGH THE SEED, and must not pretend to. The
-- seed regenerates from the catalogue; a product that is not in the catalogue
-- would be absent from the file and present in the database, which is exactly
-- the drift the two are checked against each other to catch. So it is
-- inserted here, once, the same way the boundary fence was in 0022 -- an
-- upload is a database fact, not a Blender one.
--
-- Run after 0022.
-- =============================================================================

-- WHOSE IT IS. CashBuild is the obvious brand for a kitchen run and it is
-- the one shop on the platform with NO SUBSCRIPTION -- registered, never
-- subscribed, which is why it has never placed anything. `shop_is_live` says
-- false and the live view drops every placement it owns, correctly: a shop
-- that is not paying does not advertise. Subscribing it to make this appear
-- would be inventing a commercial fact to get a picture on screen.
--
-- Tubod is live, and sells tile, paint, coatings, hardware and fencing, so a
-- fitted kitchen is a fair fit. Move it to CashBuild the moment CashBuild has
-- a subscription -- that is one row, and it is the right row.
--
-- =============================================================================
-- 1. THE PRODUCT
--
-- NO PRICE. The listing supplied with the model gives dimensions and finishes
-- and no money, and a price is the one field on an advert that must never be
-- guessed -- it is what a visitor decides on and what a shop is held to.
-- `price_cents` stays null: the panel shows the product without a price and
-- "Shop this room" leaves it out of the total rather than adding a number
-- nobody quoted. Fill it in from the Products screen and both follow.
-- =============================================================================

insert into products (
  shop_id, slug, sku, name, description, category_code, status,
  price_cents, currency, width_mm, depth_mm, height_mm
)
select s.id, 'grandiose-kitchen-unit', '705925',
       'Grandiose Kitchen Scheme',
       'Full-height kitchen run in high-gloss black and white melamine: '
       'pantry, drawer stack, flap cupboard and base cabinets under a white '
       'countertop, on a brushed aluminium plinth. 3.37m wide.',
       'kitchen_unit', 'published',
       null, 'BWP', 3367.0, 676.0, 2050.0
  from shops s
 where s.slug = 'tubod'
on conflict (shop_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  width_mm = excluded.width_mm,
  depth_mm = excluded.depth_mm,
  height_mm = excluded.height_mm;

-- Which rooms it may stand in. A kitchen run is offered for one room.
insert into product_room_types (product_id, room_type)
select p.id, 'kitchen'
  from products p join shops s on s.id = p.shop_id
 where s.slug = 'tubod' and p.slug = 'grandiose-kitchen-unit'
on conflict (product_id, room_type) do nothing;

-- =============================================================================
-- 2. THE VARIANT, WHICH IS WHERE THE MODEL LIVES
--
-- THE ANCHOR IS NOT DECORATION. Products built by the generator come out with
-- their footprint centred on the origin and their underside on the floor,
-- because `blender/houseluxe` is written to that convention. An uploaded file
-- has whatever its author left behind, and this one spans x -1.675..1.692 and
-- z 0..0.666 -- centred across but sitting entirely in FRONT of its own
-- origin. Placed as-is it would stand a third of a metre into the room.
--
-- `anchored()` in ProductLoader applies this as an offset on a wrapper group,
-- so the thing that gets rotated and positioned is the real footprint centre.
-- Metres, three.js axes.
-- =============================================================================

insert into product_variants (
  product_id, slug, name, sku, price_cents, model_url, anchor, colour
)
select p.id, 'default', 'Grandiose Kitchen Scheme', '705925', null,
       '/models/products/tubod/grandiose-kitchen-unit.glb',
       '{"dx": -0.0085, "dy": 0, "dz": -0.3365}'::jsonb,
       'Black and white gloss'
  from products p join shops s on s.id = p.shop_id
 where s.slug = 'tubod' and p.slug = 'grandiose-kitchen-unit'
on conflict (product_id, slug) do update set
  model_url = excluded.model_url,
  anchor = excluded.anchor;

-- =============================================================================
-- 3. SOMEWHERE TO STAND
--
-- The kitchen's five authored unit positions are 600mm each -- a run of base
-- cabinets, sized for one cabinet at a time. This is a single 3.37m object
-- and needs one position of its own.
--
-- ORIGIN 'derived', NOT 'blender'. The drift check counts the Blender-authored
-- slots on both sides and fails when they disagree, and the seed's slot
-- reconciliation only touches rows it authored. A slot that came from a
-- product rather than from the plan must say so, or the next build reports a
-- house that has grown a position nobody drew.
-- =============================================================================

insert into placement_slots (
  scene_id, room_id, code, label, category_code, kind, room_type,
  x_mm, y_mm, z_mm, rotation_deg,
  max_width_mm, max_depth_mm, max_height_mm, is_active, origin
)
select sc.id, rm.id, 'SLOT_KITCHEN_RUN_001', 'Kitchen run', 'kitchen_unit',
       'object', 'kitchen',
       -- Centred on the same 3390mm stretch of south wall the five 600mm
       -- positions occupy, with the carcass back against the plaster.
       7795.0, 5298.0, 0.0,
       -- FACING THE ROOM. The model's backsplash sits at z 0.02 and its
       -- handles at z 0.65, so it faces +Z in its own frame, which is south
       -- once it is in the house -- into the wall it is standing against.
       180.0,
       3400.0, 700.0, 2100.0, true, 'derived'
  from scenes sc join rooms rm on rm.scene_id = sc.id
 where sc.slug = '3bed' and rm.code = 'kitchen'
on conflict (scene_id, code) do update set
  x_mm = excluded.x_mm, y_mm = excluded.y_mm,
  rotation_deg = excluded.rotation_deg,
  max_width_mm = excluded.max_width_mm;

-- =============================================================================
-- 4. STANDING IT THERE
-- =============================================================================

insert into placements (scene_id, slot_id, variant_id, shop_id, status, note)
select sc.id, sl.id, v.id, p.shop_id, 'live',
       'Uploaded model, not generator-built. Against the south wall.'
  from scenes sc
  join placement_slots sl on sl.scene_id = sc.id
                         and sl.code = 'SLOT_KITCHEN_RUN_001'
  join products p on p.slug = 'grandiose-kitchen-unit'
  join shops s on s.id = p.shop_id and s.slug = 'tubod'
  join product_variants v on v.product_id = p.id and v.slug = 'default'
 where sc.slug = '3bed'
   and not exists (
     select 1 from placements x
      where x.slot_id = sl.id and x.status = 'live'
   );
