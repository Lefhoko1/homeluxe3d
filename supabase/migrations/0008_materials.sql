-- =============================================================================
-- Materials as things, not as strings
--
-- "Keep materials separate from products" (rule 9) and "make material
-- swapping first-class" (rule 29).
--
-- Today a material is a NAME. Blender bakes `tile_pyc61001` into a mesh, a
-- finish product declares the same string, and three.js keys a procedurally
-- drawn texture off it. That works, and it has carried the floors, the paint,
-- the bed fabrics and the hinges -- but the string is the whole model, so:
--
--   * a material has no real-world size, so nothing can lay a 600mm tile at
--     600mm except by the renderer being told separately;
--   * two shops cannot sell the same finish, because the name is the join;
--   * swapping what a surface wears means editing a placement's surface
--     string rather than pointing it at a different material;
--   * there is nowhere to put the maps when PBR packages arrive.
--
-- THE PROCEDURAL RENDERER STAYS. This is deliberately not an ingestion
-- pipeline -- there are no texture packs to ingest yet, and building the
-- importer before the imports exist is how you get an importer nobody can
-- test. `renderer` says how a material is drawn, and 'procedural' points at
-- the generator that already draws it. When packs arrive they become 'pbr'
-- and the maps land in `material_maps`; nothing else has to change.
--
-- Run after 0007.
-- =============================================================================

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'material_renderer') then
    create type material_renderer as enum (
      'procedural',   -- drawn in the browser; `procedural_key` names the generator
      'photo',        -- one photograph tiled at its real module
      'pbr'           -- a map set, laid out in material_maps
    );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'material_map_type') then
    create type material_map_type as enum (
      'albedo', 'normal', 'roughness', 'metallic', 'ao', 'height', 'opacity'
    );
  end if;
end $do$;

-- =============================================================================
-- 1. MATERIALS
-- =============================================================================

create table if not exists materials (
  id            uuid primary key default gen_random_uuid(),

  -- Who supplies it. NULL is the platform's own -- brickwork, plaster, the
  -- things the house is built of that nobody is selling.
  shop_id       uuid references shops(id) on delete cascade,

  -- The name Blender bakes into the mesh and three.js keys off. This is the
  -- bridge to everything that already exists, so it is unique and required.
  code          text not null unique,
  name          text not null,
  category_code text references product_categories(code),

  renderer      material_renderer not null default 'procedural',

  -- Which generator draws it, for 'procedural'. Matches the export in
  -- components/homeluxe/house/textures/proceduralTextures.js.
  procedural_key text,

  -- REAL-WORLD SIZE, in millimetres, and this is the point of the table.
  -- A 600x600 tile has to be laid at 600x600 or the floor is a photograph of
  -- a floor. Null means the material has no module -- paint does not tile.
  tile_width_mm  numeric(10,1),
  tile_height_mm numeric(10,1),

  -- Enough to render something honest before any map has loaded, and enough
  -- to describe paint completely.
  base_colour   text,               -- sRGB hex
  roughness     numeric(4,3) check (roughness between 0 and 1),
  metallic      numeric(4,3) check (metallic between 0 and 1),

  -- Which product sells it, when one does. A material can exist unsold --
  -- the brick this house is built of -- and a product can be a finish
  -- without the material being in this table yet, so neither side is
  -- required.
  product_id    uuid references products(id) on delete set null,

  status        asset_status not null default 'ready',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table materials is
  'A surface finish as a commercial object. `code` is the Blender material '
  'name, which is what joins this to the geometry already exported.';

comment on column materials.tile_width_mm is
  'The real module. A 600mm tile laid at anything else is a picture of a '
  'floor rather than a floor, and no renderer can work this out for itself.';

create table if not exists material_maps (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  map_type    material_map_type not null,
  asset_id    uuid not null references assets(id) on delete cascade,
  -- Longest edge in pixels, so the quality ladder can pick a size.
  resolution  integer,
  unique (material_id, map_type)
);

comment on table material_maps is
  'The PBR maps of a material. Empty until there are packages to ingest -- '
  'the shape is here so that arriving does not need a migration.';

-- =============================================================================
-- 2. SURFACES WEAR MATERIALS
--
-- `placement_slots.material_name` is the string a finish slot currently
-- carries. This points the same slot at the row instead, alongside it, so
-- the join stops being by name.
-- =============================================================================
alter table placement_slots
  add column if not exists material_id uuid references materials(id) on delete set null;

create index if not exists placement_slots_material_idx
  on placement_slots (material_id) where material_id is not null;

-- =============================================================================
-- 3. WHAT MAY GO WHERE
--
-- "Make compatibility database-driven" (rule 31). A wall tile is not a floor
-- tile and neither is a worktop, and which of them may dress which kind of
-- surface is a commercial rule, not a modelling one.
-- =============================================================================
create table if not exists material_slot_types (
  material_id  uuid not null references materials(id) on delete cascade,
  slot_type_id uuid not null references slot_types(id) on delete cascade,
  primary key (material_id, slot_type_id)
);

comment on table material_slot_types is
  'Which kinds of surface a material may dress. Empty means unrestricted, '
  'the same convention product room-scoping uses.';

-- =============================================================================
-- 4. THE MATERIALS THIS HOUSE ALREADY WEARS
--
-- Taken from the Blender material library and the finishes already placed, so
-- the table starts out agreeing with the house rather than empty. Real
-- modules, from the products: PYC61001 is a 600x600 tile and the wall tile is
-- 300x600.
-- =============================================================================
insert into materials (code, name, category_code, renderer, procedural_key,
                       tile_width_mm, tile_height_mm, base_colour, roughness, metallic)
values
  ('tile_pyc61001',    'PYC61001 Carrara Polished Porcelain', 'tile',  'photo',
   'createTilePhotoTexture', 600, 600, '#cfd0cc', 0.180, 0),
  ('wall_tile_satin_white', 'Satin White Wall Tile',          'tile',  'procedural',
   'createTileTexture',      300, 600, '#ecECea', 0.200, 0),
  ('gamazine_interior_sky', 'Gamazine Interior, Sky',         'paint', 'procedural',
   'createGamazineTexture',  null, null, '#6fa8c9', 0.880, 0),
  ('gamazine_exterior_sandstone', 'Gamazine Exterior, Sandstone', 'paint', 'procedural',
   'createGamazineTexture',  null, null, '#c9b489', 0.920, 0),
  ('paint_interior_chalk',  'Premium Interior Paint, Chalk',  'paint', 'procedural',
   'createPaintTexture',     null, null, '#f2efe9', 0.820, 0),
  ('paint_interior_sage',   'Premium Interior Paint, Sage',   'paint', 'procedural',
   'createPaintTexture',     null, null, '#5a6950', 0.820, 0),
  ('hinge_black',      'Matte Black Hinge Finish',            'hardware', 'procedural',
   null,                     null, null, '#0e1013', 0.520, 0.550),
  ('bed_quilt_pearl',  'Pillow-top Quilted Knit',             'decor', 'procedural',
   'createQuiltedKnitTexture', 125, 125, '#e9ebe9', 0.880, 0),
  ('bed_border_ash',   'Mattress Band, Pinstriped Ash',       'decor', 'procedural',
   'createUpholsteryWeaveTexture', null, null, '#4b4f55', 0.900, 0),
  ('bed_base_slate',   'Divan Base, Charcoal Weave',          'decor', 'procedural',
   'createUpholsteryWeaveTexture', null, null, '#2f3237', 0.940, 0)
on conflict (code) do update set
  name = excluded.name,
  renderer = excluded.renderer,
  procedural_key = excluded.procedural_key,
  tile_width_mm = excluded.tile_width_mm,
  tile_height_mm = excluded.tile_height_mm,
  base_colour = excluded.base_colour;

-- Join each material to the product that sells it, where one does. Matched on
-- the variant's material name, which is the same string by construction.
update materials m
   set product_id = p.id
  from product_variants v
  join products p on p.id = v.product_id
 where v.material_name = m.code
   and m.product_id is null;

-- And point the finish slots at the row rather than only at the name.
update placement_slots s
   set material_id = m.id
  from materials m
 where s.material_id is null
   and s.material_name = m.code;

-- =============================================================================
-- 5. SECURITY
--
-- A material is public reference data -- a visitor clicking a floor has to be
-- able to read what it is. Writing is the shop that supplies it, or an admin
-- for the platform's own.
-- =============================================================================
alter table materials enable row level security;
alter table material_maps enable row level security;
alter table material_slot_types enable row level security;

drop policy if exists materials_read on materials;
create policy materials_read on materials
  for select using (true);

drop policy if exists materials_write on materials;
create policy materials_write on materials
  for all using (
    case when shop_id is null then public.is_platform_admin()
         else public.can_manage_shop(shop_id) end
  )
  with check (
    case when shop_id is null then public.is_platform_admin()
         else public.can_manage_shop(shop_id) end
  );

drop policy if exists material_maps_read on material_maps;
create policy material_maps_read on material_maps for select using (true);

drop policy if exists material_maps_write on material_maps;
create policy material_maps_write on material_maps
  for all using (exists (
    select 1 from materials m where m.id = material_id
      and case when m.shop_id is null then public.is_platform_admin()
               else public.can_manage_shop(m.shop_id) end
  ))
  with check (exists (
    select 1 from materials m where m.id = material_id
      and case when m.shop_id is null then public.is_platform_admin()
               else public.can_manage_shop(m.shop_id) end
  ));

drop policy if exists material_slot_types_read on material_slot_types;
create policy material_slot_types_read on material_slot_types for select using (true);

drop policy if exists material_slot_types_write on material_slot_types;
create policy material_slot_types_write on material_slot_types
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop trigger if exists materials_touch on materials;
create trigger materials_touch before update on materials
  for each row execute function public.touch_updated_at();
