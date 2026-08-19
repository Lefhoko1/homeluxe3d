-- =============================================================================
-- Slot identity and slot types
--
-- THE SLOTS WERE BUILT INSIDE-OUT. `generate_seed.py` invented a slot from
-- every existing placement, so a slot only existed because something was
-- already standing in it. That is backwards from what the house is meant to
-- be -- an inventory map, drawn before anything is sold -- and it is why
-- there are twenty-seven slots in a house the specification wants to carry
-- several hundred.
--
-- Two things have to be true before slots can be authored instead of derived:
--
--  1. A SLOT NEEDS A STABLE IDENTITY THAT SURVIVES A REBUILD. Blender is the
--     master for structural slots, and it re-generates the whole house from
--     the plan every time. The database row must therefore be keyed by
--     something the plan controls -- `SLOT_KITCHEN_COUNTER_001` -- and not by
--     an object name, an index, or the order things happen to be built in.
--     Blender carries that string as a custom property; the database stores
--     the same string; nothing in between is entitled to rename it.
--
--  2. A SLOT TYPE HAS TO BE DATA. What may stand in a slot, how big it may
--     be, whether it is a surface or an object -- those are commercial rules
--     that change without a deploy. `slot_types` is that table.
--
-- Nothing here deletes or rewrites the existing slots. They gain an origin of
-- 'derived', which is the truth about where they came from, and the importer
-- in 0007 promotes them to 'blender' as the plan starts declaring them.
--
-- Run after 0005.
-- =============================================================================

-- =============================================================================
-- 1. WHERE A SLOT CAME FROM
--
-- Blender owns structural positions -- a slot only means something if a
-- product physically fits there, and that is a modelling fact. An admin can
-- still add one, and the difference has to be recorded, because a rebuild may
-- retire a Blender slot and must never silently delete one a person created.
-- =============================================================================
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'slot_origin') then
    create type slot_origin as enum ('blender', 'admin', 'derived');
  end if;
end $do$;

-- =============================================================================
-- 2. SLOT TYPES
-- =============================================================================

create table if not exists slot_types (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,

  -- Whether things stand in it or dress it. A worktop holds a kettle; a floor
  -- wears a tile. The two are sold differently and rendered differently.
  kind          product_kind not null default 'object',

  -- What may occupy it. NULL means anything of the right kind.
  category_code text references product_categories(code),

  -- The envelope a product must fit inside, in millimetres. Advisory at this
  -- level and enforced per slot, which may be tighter.
  max_width_mm  numeric(10,1),
  max_depth_mm  numeric(10,1),
  max_height_mm numeric(10,1),

  -- How much of the house's attention this kind of position gets. Drives the
  -- default price and the order the tour shows things in.
  default_priority integer not null default 50
    check (default_priority between 0 and 100),

  description   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table slot_types is
  'What KIND of position this is -- a worktop, a bedside table, a floor. '
  'Database-driven so a new kind of inventory needs no deploy.';

-- =============================================================================
-- 3. SLOT IDENTITY
-- =============================================================================

alter table placement_slots
  -- The stable id the plan controls and Blender stamps onto its empty.
  -- Nullable because every existing slot predates the idea; the importer
  -- fills them in as the plan declares them.
  add column if not exists external_id text,
  add column if not exists slot_type_id uuid references slot_types(id) on delete set null,
  add column if not exists origin slot_origin not null default 'derived',
  -- Which build last confirmed this slot exists in the model. A structural
  -- slot missing from a later import is stale, not deleted -- see 0007.
  add column if not exists last_seen_build text,
  add column if not exists priority integer not null default 50
    check (priority between 0 and 100);

comment on column placement_slots.external_id is
  'The stable id Blender stamps as a custom property, e.g. '
  'SLOT_KITCHEN_COUNTER_001. Authoritative for matching across rebuilds; '
  'the uuid remains the authoritative identity for everything else.';

comment on column placement_slots.origin is
  'blender = structural, regenerated from the plan. admin = created in the '
  'web app. derived = invented from a placement before slots were authored.';

-- One external id per scene. Two slots claiming the same id is a plan bug and
-- should fail the import rather than quietly overwrite a position.
create unique index if not exists placement_slots_external_key
  on placement_slots (scene_id, external_id)
  where external_id is not null;

create index if not exists placement_slots_type_idx
  on placement_slots (slot_type_id) where slot_type_id is not null;

-- =============================================================================
-- 4. THE SLOT TYPES THIS HOUSE ALREADY IMPLIES
--
-- Derived from what is actually placed today rather than invented: a house
-- with a lounge suite, a bed and three dressed surfaces needs exactly these.
-- More arrive with the slot inventory.
-- =============================================================================
insert into slot_types (code, name, kind, category_code, default_priority, description) values
  ('lounge_seating',  'Lounge seating',      'object', 'sofa',      80,
   'A sofa or armchair position in a living or dining room.'),
  ('occasional_table','Occasional table',    'object', 'table',     55,
   'Coffee, side and console tables.'),
  ('floor_covering',  'Floor covering',      'object', 'rug',       45,
   'A rug laid over a finished floor. Walked on, not walked around.'),
  ('bed_position',    'Bed position',        'object', 'bed',       90,
   'The principal bed in a bedroom, against its headboard wall.'),
  ('floor_surface',   'Floor surface',       'finish', 'tile',      60,
   'The floor of a room, as a surface a finish is sold for.'),
  ('wall_surface',    'Wall surface',        'finish', 'paint',     50,
   'The paintable skin of a room.'),
  ('door_hardware',   'Door hardware',       'finish', 'hardware',  35,
   'Hinges, handles and locks fitted to the joinery of a room.')
on conflict (code) do update set
  name = excluded.name,
  kind = excluded.kind,
  category_code = excluded.category_code,
  default_priority = excluded.default_priority,
  description = excluded.description;

-- Attach the slots that already exist to the type they obviously are, so the
-- column is not dead on arrival. Matched on the category they were seeded
-- with, which is the only signal a derived slot carries.
update placement_slots s
   set slot_type_id = t.id,
       priority = t.default_priority
  from slot_types t
 where s.slot_type_id is null
   and t.code = case
     when s.kind = 'finish' and s.material_name like 'wall.%'    then 'wall_surface'
     when s.kind = 'finish' and s.category_code = 'hardware'     then 'door_hardware'
     when s.kind = 'finish'                                      then 'floor_surface'
     when s.category_code in ('sofa', 'chair')                   then 'lounge_seating'
     when s.category_code = 'table'                              then 'occasional_table'
     when s.category_code = 'rug'                                then 'floor_covering'
     when s.category_code = 'bed'                                then 'bed_position'
   end;

-- =============================================================================
-- 5. SECURITY
--
-- Slot types are public reference data, like categories: a shop has to be
-- able to see what kinds of position exist in order to buy one. Only a
-- platform admin writes them.
-- =============================================================================
alter table slot_types enable row level security;

drop policy if exists slot_types_read on slot_types;
create policy slot_types_read on slot_types
  for select using (is_active or public.is_platform_admin());

drop policy if exists slot_types_write on slot_types;
create policy slot_types_write on slot_types
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());
