-- =============================================================================
-- Assets, and versions of them
--
-- "Keep products separate from assets" (rule 8) and "never silently overwrite
-- production assets" (rule 14). Today a variant carries `model_url` -- a
-- string pointing at a file -- which means:
--
--   * replacing a model is an UPDATE that destroys the old one, with no way
--     back and no record that it happened;
--   * a file that fails to load takes the house down with it, because
--     nothing knows the difference between "not uploaded yet", "being
--     processed", "ready" and "broken";
--   * two products cannot share one file without duplicating the string.
--
-- An asset is the THING. A version is a particular file of it. The asset
-- points at whichever version is current, so replacing a model is a new row
-- and a pointer move, and rolling back is the pointer moving again.
--
-- `model_url` stays, and stays authoritative for now. Nothing in the app
-- changes here: this is the structure the importer and the admin uploader
-- will write into, and a later migration moves the app across once there is
-- something to move it to. Adding a table nobody reads yet is cheap; changing
-- how the house loads its models in the same breath is not.
--
-- Run after 0006.
-- =============================================================================

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'asset_kind') then
    create type asset_kind as enum (
      'model',          -- a GLB the renderer instances
      'texture',        -- a single image used as a map
      'image',          -- a photograph, for the advert rather than the scene
      'document'        -- spec sheets, care instructions
    );
  end if;
end $do$;

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'asset_status') then
    -- EXPLICIT STATES, not a boolean. "Broken" and "not finished processing"
    -- and "withdrawn" are three different things, and a house that cannot
    -- tell them apart either shows a hole or hides a product that was fine.
    create type asset_status as enum (
      'uploaded',       -- received, nothing done to it
      'processing',     -- being validated, compressed, thumbnailed
      'ready',          -- usable in a published scene
      'failed',         -- processing found something wrong; see notes
      'archived'        -- superseded or withdrawn, kept for rollback
    );
  end if;
end $do$;

-- =============================================================================
-- 1. ASSETS
-- =============================================================================

create table if not exists assets (
  id          uuid primary key default gen_random_uuid(),

  -- Whose it is. NULL means the platform's own -- the house itself, the
  -- character, anything not sold by a shop.
  shop_id     uuid references shops(id) on delete cascade,

  kind        asset_kind not null,
  name        text not null,
  slug        text,

  -- Which version is live. Deliberately nullable: an asset exists from the
  -- moment somebody starts uploading to it, before any version is ready.
  current_version_id uuid,

  status      asset_status not null default 'uploaded',
  notes       text,

  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (shop_id, slug)
);

comment on table assets is
  'A file the platform owns, independent of what it is used for. One asset '
  'may be referenced by several products, and outlives any of them.';

create table if not exists asset_versions (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references assets(id) on delete cascade,
  version      integer not null check (version > 0),

  -- Where the bytes are. Storage path, not a signed URL: URLs expire and are
  -- environment-specific, and neither belongs in a durable row.
  storage_path text not null,
  mime_type    text,
  bytes        bigint,

  -- Enough to tell whether an upload is the same file as last time without
  -- fetching it.
  checksum     text,

  -- For a model: its bounding box as built, in millimetres. This is what
  -- validation compares against a slot's envelope, and what catches a chair
  -- exported in centimetres.
  width_mm     numeric(10,1),
  depth_mm     numeric(10,1),
  height_mm    numeric(10,1),
  triangles    integer,

  status       asset_status not null default 'uploaded',
  -- Why processing failed, in words a person can act on.
  failure_reason text,

  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (asset_id, version)
);

comment on table asset_versions is
  'One uploaded file. Versions are append-only: replacing a model adds a row '
  'and moves assets.current_version_id, so the previous file is still there '
  'to roll back to.';

do $do$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'assets_current_version_fk'
  ) then
    alter table assets
      add constraint assets_current_version_fk
      foreign key (current_version_id) references asset_versions(id)
      on delete set null;
  end if;
end $do$;

create index if not exists asset_versions_asset_idx
  on asset_versions (asset_id, version desc);
create index if not exists assets_shop_idx on assets (shop_id);

-- =============================================================================
-- 2. NEXT VERSION, ATOMICALLY
--
-- Two uploads racing for version 4 is a unique-violation at best and a lost
-- file at worst, so the number is allocated by the database rather than read
-- and incremented by whoever got there first.
-- =============================================================================
create or replace function public.next_asset_version(p_asset uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(max(version), 0) + 1 from asset_versions where asset_id = p_asset;
$$;

-- =============================================================================
-- 3. PRODUCTS POINT AT ASSETS
--
-- Added alongside `model_url` rather than replacing it. The string still
-- drives the app; this is where the importer writes, and the two are
-- reconciled in a later migration once the uploader fills it.
-- =============================================================================
alter table product_variants
  add column if not exists asset_id uuid references assets(id) on delete set null;

alter table product_media
  add column if not exists asset_id uuid references assets(id) on delete set null;

create index if not exists product_variants_asset_idx
  on product_variants (asset_id) where asset_id is not null;

-- =============================================================================
-- 4. SECURITY
--
-- A shop sees and writes its own assets. Platform assets -- the house, the
-- character -- are readable by everyone and writable only by an admin, which
-- is what `shop_id is null` means here.
-- =============================================================================
alter table assets enable row level security;
alter table asset_versions enable row level security;

drop policy if exists assets_read on assets;
create policy assets_read on assets
  for select using (
    shop_id is null
    or public.is_shop_member(shop_id)
    or public.is_platform_admin()
  );

drop policy if exists assets_write on assets;
create policy assets_write on assets
  for all using (
    case when shop_id is null then public.is_platform_admin()
         else public.can_manage_shop(shop_id) end
  )
  with check (
    case when shop_id is null then public.is_platform_admin()
         else public.can_manage_shop(shop_id) end
  );

drop policy if exists asset_versions_read on asset_versions;
create policy asset_versions_read on asset_versions
  for select using (exists (
    select 1 from assets a
     where a.id = asset_id
       and (a.shop_id is null
            or public.is_shop_member(a.shop_id)
            or public.is_platform_admin())
  ));

drop policy if exists asset_versions_write on asset_versions;
create policy asset_versions_write on asset_versions
  for all using (exists (
    select 1 from assets a
     where a.id = asset_id
       and case when a.shop_id is null then public.is_platform_admin()
                else public.can_manage_shop(a.shop_id) end
  ))
  with check (exists (
    select 1 from assets a
     where a.id = asset_id
       and case when a.shop_id is null then public.is_platform_admin()
                else public.can_manage_shop(a.shop_id) end
  ));

drop trigger if exists assets_touch on assets;
create trigger assets_touch before update on assets
  for each row execute function public.touch_updated_at();
