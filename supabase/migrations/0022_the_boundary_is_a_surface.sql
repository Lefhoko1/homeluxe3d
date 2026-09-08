-- =============================================================================
-- The boundary is a surface, and somebody sells what fills it
--
-- The yard fence was posts and rails with nothing between them, wearing one
-- material named in Python. That is a fence nobody can sell.
--
-- It has an INFILL PANEL now, generated per bay, carrying the Blender surface
-- name `fence.boundary` -- and a surface is something the database dresses.
-- Exactly the arrangement paint and floor tile already use: Blender says what
-- a surface IS, a placement says what is on it this month, and the browser
-- draws whatever that turns out to be.
--
-- TWO VERY DIFFERENT THINGS CAN FILL THE SAME BAY. Diamond mesh is four
-- fifths holes; a precast screen wall is solid. They are the same PURCHASE --
-- something to fill the gap between two fence posts -- and they fill the same
-- slot, so they share a category and are told apart by their material, the
-- way gamazine is told apart from emulsion. The browser's `fencing` renderer
-- cuts the apertures out of one and not the other.
--
-- THE APERTURE IS THE PRODUCT. Diamond mesh is sold by the size of its
-- opening: 25mm to 150mm, one inch to six. Small is security, large is
-- airflow and stock. That number rides on the VARIANT, so choosing a variant
-- changes what the fence looks like in the house -- which is the entire point
-- of variants and, until now, was only ever used for paint colours.
--
-- Run after 0021.
-- =============================================================================

-- =============================================================================
-- 1. A CATEGORY FOR IT
--
-- There was none. `brick`, `roofing`, `flooring`, `paint`, `tile` -- twenty
-- three categories and nothing for a boundary. The browser's renderer table
-- is keyed by category, so this name is load bearing: `fencing` is what
-- selects the code that knows about alpha cutouts.
-- =============================================================================

insert into product_categories (code, name)
values ('fencing', 'Fencing & Boundaries')
on conflict (code) do nothing;

-- =============================================================================
-- 2. THE MATERIALS
--
-- One per aperture, because the aperture is the visible difference and the
-- material is what the browser is handed. `tile_width_mm` carries it -- the
-- column already means "the module this surface repeats at", which for a mesh
-- is the diamond.
--
-- `procedural_key` names the browser function. Drawn rather than photographed
-- for the same reason the paving is: mesh is genuinely made of repeated
-- units at a size somebody chose, so it tiles honestly at any aperture, and a
-- photograph of a fence would have to be stretched or repeated and would be
-- wrong either way.
-- =============================================================================

insert into materials (
  shop_id, code, name, category_code, renderer, procedural_key,
  tile_width_mm, base_colour, roughness, metallic, status, notes
)
select
  s.id,
  'mesh_diamond_' || a.mm,
  'Diamond Mesh ' || a.mm || 'mm, Galvanised',
  'fencing',
  'procedural',
  'createDiamondMeshTexture',
  a.mm,
  '#b9bfc4',
  0.44,
  0.72,
  'ready',
  a.note
from shops s
cross join (values
  ( 25, 'One inch. The security aperture: too small to get a toe or a hand into.'),
  ( 50, 'Two inch. The ordinary domestic boundary, and the default here.'),
  ( 75, 'Three inch. Lighter, cheaper, still a barrier.'),
  (100, 'Four inch. Stock and site fencing.'),
  (150, 'Six inch. Maximum airflow and view; a demarcation rather than a barrier.')
) as a(mm, note)
where s.slug = 'tubod'
on conflict (code) do nothing;

-- The alternative fill for the same bay. NOT a shop's product yet -- it is a
-- surface treatment the platform can offer, and whichever shop starts selling
-- screen walling can attach a product to it. Global (shop_id null) for the
-- same reason the house's own plaster is.
insert into materials (
  shop_id, code, name, category_code, renderer, procedural_key,
  tile_width_mm, base_colour, roughness, metallic, status, notes
)
values (
  null, 'screen_wall_precast', 'Precast Screen Wall, Grey', 'fencing',
  'procedural', 'createScreenWallTexture', 400, '#b6b2a9', 0.93, 0.0, 'ready',
  'The solid alternative to mesh in the same bay. Opaque, so the browser '
  'draws it without the alpha cutout the mesh needs.'
)
on conflict (code) do nothing;

-- =============================================================================
-- 3. TUBOD'S PRODUCT
--
-- Dimensions are the ROLL, which is what is actually bought: 30m long, 1.8m
-- high, 2.5mm wire. A finish is priced per unit of itself rather than per
-- item, which is why the room total on the showroom counts pieces and not
-- these.
--
-- PRICES ARE PROVISIONAL. They are scaled off a 50mm roll and are here so the
-- product renders and the arithmetic works; Tubod has not confirmed them.
-- Anything showing a price to a visitor should be corrected by the shop
-- before this is advertised for real.
-- =============================================================================

insert into products (
  shop_id, slug, sku, name, description, category_code, status,
  price_cents, currency, width_mm, depth_mm, height_mm
)
select
  s.id, 'diamond-mesh-fencing', 'TUBOD-DMF',
  'Diamond Mesh Fencing',
  'Galvanised chain-link fabric, woven from 2.5mm wire and supplied in 30m '
  'rolls 1.8m high. Sold by aperture: a 25mm diamond is a security fence, a '
  '150mm one is a boundary you can see straight through. Fitted between '
  'posts at 2.4m centres.',
  'fencing', 'published',
  289900, 'BWP', 30000, 2.5, 1800
from shops s
where s.slug = 'tubod'
on conflict (shop_id, slug) do nothing;

insert into product_variants (
  product_id, slug, name, sku, price_cents, material_name, texture_tile_mm,
  is_default
)
select
  p.id,
  a.mm || 'mm',
  a.mm || 'mm aperture',
  'TUBOD-DMF-' || a.mm,
  a.price,
  'mesh_diamond_' || a.mm,
  a.mm,
  a.mm = 50                       -- the ordinary domestic boundary
from products p
join shops s on s.id = p.shop_id
cross join (values
  ( 25, 449900),
  ( 50, 289900),
  ( 75, 234900),
  (100, 198900),
  (150, 169900)
) as a(mm, price)
where s.slug = 'tubod' and p.slug = 'diamond-mesh-fencing'
on conflict (product_id, slug) do nothing;

-- Which rooms it suits. `outdoor` is the honest answer and the only one.
insert into product_room_types (product_id, room_type)
select p.id, 'outdoor'::room_type
from products p join shops s on s.id = p.shop_id
where s.slug = 'tubod' and p.slug = 'diamond-mesh-fencing'
on conflict do nothing;

-- =============================================================================
-- 4. THE SURFACE, AS A SLOT
--
-- One finish slot for the whole boundary, not one per run. The five runs --
-- north, east, west and the two street frontages -- are one purchase and one
-- decision; nobody puts mesh on three sides and a screen wall on the fourth.
--
-- `is_active` is false, matching every other finish slot: these are not
-- advertised as available POSITIONS the way a floor space is. The count on
-- the front page counts places a thing can stand.
-- =============================================================================

insert into placement_slots (
  scene_id, room_id, code, label, category_code, kind,
  material_name, room_type, is_active, notes
)
select
  sc.id, null, 'fence-boundary', 'Boundary fence infill', 'fencing', 'finish',
  'fence.boundary', 'outdoor'::room_type, false,
  'The panel between every pair of fence posts, on all five runs. Dressed '
  'with diamond mesh or a screen wall; the geometry is the same either way.'
from scenes sc
where sc.slug = '3bed'
on conflict (scene_id, code) do nothing;

-- =============================================================================
-- 5. WHAT IS ON IT TODAY
--
-- Tubod's 50mm mesh, live. Changing this to the screen wall is a placement
-- edit in the admin, not a migration and not a rebuild -- which is the whole
-- reason the boundary was made a surface rather than a decision in Python.
-- =============================================================================

insert into placements (scene_id, slot_id, variant_id, shop_id, status, note)
select
  sc.id, sl.id, v.id, s.id, 'live'::placement_status,
  'Galvanised 50mm diamond mesh on all five boundary runs.'
from scenes sc
join placement_slots sl on sl.scene_id = sc.id and sl.code = 'fence-boundary'
join shops s on s.slug = 'tubod'
join products p on p.shop_id = s.id and p.slug = 'diamond-mesh-fencing'
join product_variants v on v.product_id = p.id and v.slug = '50mm'
where sc.slug = '3bed'
  and not exists (
    select 1 from placements x
     where x.slot_id = sl.id and x.status = 'live'::placement_status
  );
