-- =============================================================================
-- HomeLuxe 3D -- core schema
--
-- A 3D advertising marketplace. Shops subscribe to the platform and are given
-- advertising space inside 3D scenes (houses). Visitors tour those scenes,
-- click what they see, follow shops and get notified when those shops post.
--
-- THE CENTRAL IDEA: a scene is INVENTORY.
--
-- A house is not a fixed set of furniture, it is a set of SLOTS -- "living
-- room, primary sofa position, max 2.4m wide, against the south wall". Shops
-- fill slots with their products through campaigns. That is what makes this
-- sellable and schedulable rather than a hand-built showroom: slots are the
-- unit you sell, the same way a billboard is.
--
-- Everything is scoped by shop, and row-level security is on for every table,
-- so one shop can never read or write another's data.
--
-- Run order: this file, then seed.sql.
-- =============================================================================

create extension if not exists "pgcrypto";     -- gen_random_uuid()
create extension if not exists "pg_trgm";      -- product search

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'account_role') then
    create type account_role as enum ('visitor', 'shop_owner', 'platform_admin');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'shop_member_role') then
    create type shop_member_role as enum ('owner', 'manager', 'staff');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'shop_status') then
    create type shop_status as enum ('pending', 'active', 'suspended', 'closed');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'product_status') then
    create type product_status as enum ('draft', 'published', 'archived');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type campaign_status as enum ('draft', 'scheduled', 'live', 'paused', 'ended');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'placement_status') then
    create type placement_status as enum ('draft', 'live', 'removed');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'post_visibility') then
    create type post_visibility as enum ('public', 'followers', 'subscribers');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'notification_kind') then
    create type notification_kind as enum ('shop_post', 'new_product', 'campaign_live', 'enquiry_reply', 'system');
  end if;
end $do$;
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'enquiry_status') then
    create type enquiry_status as enum ('new', 'seen', 'replied', 'closed');
  end if;
end $do$;

-- Mirrors ProductCategory in blender/houseluxe/catalog/product.py.
-- `is_finish` products dress a surface instead of being placed as an object.
do $do$ begin
  if not exists (select 1 from pg_type where typname = 'product_kind') then
    create type product_kind as enum ('object', 'finish');
  end if;
end $do$;

-- =============================================================================
-- 2. ACCOUNTS
-- =============================================================================

-- One row per auth user. Supabase owns auth.users; this is our side of it.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  phone        text,
  role         account_role not null default 'visitor',
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

comment on table profiles is
  'Application profile for an auth user. role=platform_admin bypasses shop scoping.';

-- Keep a profile in step with auth.users automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 3. SHOPS AND TENANCY
-- =============================================================================

create table if not exists shops (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  name        text not null,
  tagline     text,
  description text,
  logo_url    text,
  website     text,
  email       text,
  phone       text,
  address     text,
  city        text,
  country     text not null default 'BW',
  currency    char(3) not null default 'BWP',
  status      shop_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column shops.slug is
  'Stable public identifier. Matches Shop.id in the Blender catalogue, e.g. bradlows.';

-- Membership rather than a single owner column: real shops have staff, and
-- ownership changes hands without rewriting every row that references them.
create table if not exists shop_members (
  shop_id    uuid not null references shops(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       shop_member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

-- =============================================================================
-- 4. PLATFORM SUBSCRIPTIONS (shops pay to advertise)
-- =============================================================================

create table if not exists plans (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  name           text not null,
  description    text,
  price_cents    integer not null default 0 check (price_cents >= 0),
  currency       char(3) not null default 'BWP',
  interval       text not null default 'month' check (interval in ('month', 'year')),
  -- Limits are what a plan actually sells. NULL means unlimited.
  max_products   integer,
  max_placements integer,
  max_scenes     integer,
  analytics      boolean not null default false,
  featured       boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists shop_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references shops(id) on delete cascade,
  plan_id           uuid not null references plans(id),
  status            subscription_status not null default 'trialing',
  started_at        timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at         timestamptz,
  external_ref      text,          -- payment provider id
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- A shop has at most one live subscription at a time.
create unique index if not exists shop_subscriptions_one_active
  on shop_subscriptions (shop_id)
  where status in ('trialing', 'active', 'past_due');

-- =============================================================================
-- 5. CATALOGUE
-- =============================================================================

create table if not exists product_categories (
  code       text primary key,
  name       text not null,
  kind       product_kind not null default 'object',
  sort_order integer not null default 0
);

create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,64}$'),
  sku           text,
  name          text not null,
  description   text,
  category_code text not null references product_categories(code),
  status        product_status not null default 'draft',

  price_cents   integer check (price_cents >= 0),
  currency      char(3) not null default 'BWP',

  -- Real-world size in millimetres, as a shop would quote it.
  width_mm      numeric(10,1),
  depth_mm      numeric(10,1),
  height_mm     numeric(10,1),

  thumbnail_url text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (shop_id, slug)
);

comment on column products.slug is
  'Unique within a shop. The qualified id shop.slug + dot + products.slug matches Product.qualified_id in the Blender catalogue.';

-- Variants are where the 3D asset actually lives, because a colourway is a
-- different model or a different texture, not a different product. A sofa in
-- three leathers is one product and three variants -- one listing, one price
-- band, three things to render.
create table if not exists product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,64}$'),
  name          text,
  sku           text,
  price_cents   integer check (price_cents >= 0),
  colour        text,

  -- OBJECTS: the glTF to place. Built at the origin, footprint centred,
  -- facing +Y -- see blender/houseluxe/catalog/README.md.
  model_url     text,

  -- FINISHES: the Blender material name this dresses, and its image. This is
  -- what makes "which shop supplied this floor?" answerable for any surface.
  material_name text,
  texture_url   text,
  texture_tile_mm numeric(8,1),   -- real module, so the app can scale it

  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),

  unique (product_id, slug),
  -- A variant is either something you place or something you paint. Not both.
  constraint variant_has_an_asset check (
    model_url is not null or material_name is not null
  )
);

create unique index if not exists product_variants_one_default
  on product_variants (product_id) where is_default;

create index if not exists product_variants_material on product_variants (material_name)
  where material_name is not null;

create table if not exists product_media (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  url         text not null,
  kind        text not null default 'image' check (kind in ('image','video','model')),
  alt         text,
  sort_order  integer not null default 0
);

-- Free-form spec sheet. Shops quote wildly different attributes and a rigid
-- column set would be wrong for all of them.
create table if not exists product_specs (
  product_id uuid not null references products(id) on delete cascade,
  label      text not null,
  value      text not null,
  sort_order integer not null default 0,
  primary key (product_id, label)
);

-- =============================================================================
-- 6. SCENES -- the advertising space
-- =============================================================================

create table if not exists scenes (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  -- Where the generated house/site GLBs live.
  model_base  text not null default '/models/',
  is_published boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table scenes is
  'A tourable 3D environment. slug matches HousePlan.name in Blender, e.g. 3bed.';

create table if not exists rooms (
  id         uuid primary key default gen_random_uuid(),
  scene_id   uuid not null references scenes(id) on delete cascade,
  code       text not null,
  name       text not null,
  -- Clear internal extents in scene millimetres, from the Blender plan.
  x0_mm numeric(10,1), y0_mm numeric(10,1),
  x1_mm numeric(10,1), y1_mm numeric(10,1),
  sort_order integer not null default 0,
  unique (scene_id, code)
);

-- SLOTS ARE THE INVENTORY. Each is a position in a scene that a product can
-- occupy, with constraints on what fits. Selling advertising means selling
-- these.
create table if not exists placement_slots (
  id            uuid primary key default gen_random_uuid(),
  scene_id      uuid not null references scenes(id) on delete cascade,
  room_id       uuid references rooms(id) on delete set null,
  code          text not null,
  label         text not null,

  -- What may go here. NULL category = anything.
  category_code text references product_categories(code),
  kind          product_kind not null default 'object',

  -- Anchor, in scene millimetres. Position is the product footprint centre;
  -- rotation is degrees CCW about Z with 0 facing +Y (north).
  x_mm       numeric(10,1) not null default 0,
  y_mm       numeric(10,1) not null default 0,
  z_mm       numeric(10,1) not null default 0,
  rotation_deg numeric(6,2) not null default 0,

  -- What physically fits. Enforced by the app when assigning a product.
  max_width_mm  numeric(10,1),
  max_depth_mm  numeric(10,1),
  max_height_mm numeric(10,1),

  -- For finish slots: the material this slot paints.
  material_name text,

  -- Premium positions cost more: the sofa facing the door beats a corner lamp.
  base_price_cents integer not null default 0,
  is_premium    boolean not null default false,
  is_active     boolean not null default true,
  notes         text,

  unique (scene_id, code)
);

comment on table placement_slots is
  'One advertising position in a scene. The unit that is sold to a shop.';

-- =============================================================================
-- 7. CAMPAIGNS AND PLACEMENTS
-- =============================================================================

create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  name       text not null,
  status     campaign_status not null default 'draft',
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- A product variant occupying a slot, for a period. Position is data, never
-- baked into the mesh, so moving a sofa is an UPDATE and not a re-export.
create table if not exists placements (
  id          uuid primary key default gen_random_uuid(),
  scene_id    uuid not null references scenes(id) on delete cascade,
  slot_id     uuid references placement_slots(id) on delete set null,
  variant_id  uuid not null references product_variants(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  shop_id     uuid not null references shops(id) on delete cascade,

  -- Overrides. NULL means inherit the slot's anchor.
  x_mm         numeric(10,1),
  y_mm         numeric(10,1),
  z_mm         numeric(10,1),
  rotation_deg numeric(6,2),
  scale        numeric(6,3) not null default 1.0,

  status      placement_status not null default 'draft',
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One live placement per slot: two sofas cannot stand in the same spot.
create unique index if not exists placements_one_live_per_slot
  on placements (slot_id) where status = 'live' and slot_id is not null;

create index if not exists placements_scene_live on placements (scene_id) where status = 'live';
create index if not exists placements_shop on placements (shop_id);

-- =============================================================================
-- 8. ENGAGEMENT
-- =============================================================================

create table if not exists shop_follows (
  user_id    uuid not null references profiles(id) on delete cascade,
  shop_id    uuid not null references shops(id) on delete cascade,
  notify     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

comment on table shop_follows is
  'A visitor following a shop. Drives the notification fan-out.';

create table if not exists shop_posts (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  title       text not null,
  body        text,
  image_url   text,
  product_id  uuid references products(id) on delete set null,
  visibility  post_visibility not null default 'public',
  published_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       notification_kind not null,
  title      text not null,
  body       text,
  shop_id    uuid references shops(id) on delete cascade,
  post_id    uuid references shop_posts(id) on delete cascade,
  url        text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_unread on notifications (user_id, created_at desc)
  where read_at is null;

-- Fan out a published post to everyone following the shop with notify on.
create or replace function public.notify_followers_of_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.published_at is not null then
    return new;   -- already announced
  end if;

  insert into notifications (user_id, kind, title, body, shop_id, post_id)
  select f.user_id,
         'shop_post',
         (select name from shops where id = new.shop_id) || ': ' || new.title,
         new.body,
         new.shop_id,
         new.id
  from shop_follows f
  where f.shop_id = new.shop_id
    and f.notify;

  return new;
end;
$$;

drop trigger if exists shop_posts_notify on shop_posts;
create trigger shop_posts_notify
  after insert or update of published_at on shop_posts
  for each row execute function public.notify_followers_of_post();

-- =============================================================================
-- 9. ANALYTICS AND LEADS -- what shops are actually paying for
-- =============================================================================

create table if not exists interaction_events (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  session_id   uuid,                     -- anonymous visitors still count
  user_id      uuid references profiles(id) on delete set null,
  scene_id     uuid references scenes(id) on delete set null,
  placement_id uuid references placements(id) on delete set null,
  variant_id   uuid references product_variants(id) on delete set null,
  shop_id      uuid references shops(id) on delete cascade,
  event        text not null check (event in
    ('scene_view','placement_view','product_click','product_expand',
     'shop_click','enquiry_open','tour_start','tour_complete')),
  metadata     jsonb not null default '{}'::jsonb
);

create index if not exists interaction_events_shop_time on interaction_events (shop_id, occurred_at desc);
create index if not exists interaction_events_placement on interaction_events (placement_id);

create table if not exists enquiries (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  variant_id  uuid references product_variants(id) on delete set null,
  user_id     uuid references profiles(id) on delete set null,
  name        text,
  email       text,
  phone       text,
  message     text not null,
  status      enquiry_status not null default 'new',
  created_at  timestamptz not null default now()
);

create index if not exists enquiries_shop on enquiries (shop_id, created_at desc);

-- =============================================================================
-- 10. HELPERS
--
-- SECURITY DEFINER so that policies can call them without the policy on
-- shop_members recursing into itself.
-- =============================================================================

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'platform_admin'
  );
$$;

create or replace function public.is_shop_member(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shop_members m
    where m.shop_id = p_shop and m.user_id = auth.uid()
  ) or public.is_platform_admin();
$$;

create or replace function public.can_manage_shop(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shop_members m
    where m.shop_id = p_shop
      and m.user_id = auth.uid()
      and m.role in ('owner','manager')
  ) or public.is_platform_admin();
$$;

-- A shop is only advertised while it is active AND paying.
create or replace function public.shop_is_live(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from shops s
    join shop_subscriptions sub on sub.shop_id = s.id
    where s.id = p_shop
      and s.status = 'active'
      and sub.status in ('trialing','active')
  );
$$;

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','shops','shop_subscriptions','products','campaigns','placements'
  ] loop
    execute format(
      'create trigger %I_touch before update on %I
       for each row execute function public.touch_updated_at()', t || '_updated', t);
  end loop;
end $$;

-- =============================================================================
-- 11. ROW LEVEL SECURITY
--
-- On for every table. The default is deny; each policy below is a deliberate
-- hole. Public visitors get read-only access to PUBLISHED content belonging to
-- LIVE shops -- so an unpaid shop's products stop being advertised without
-- anything being deleted.
-- =============================================================================

alter table profiles            enable row level security;
alter table shops               enable row level security;
alter table shop_members        enable row level security;
alter table plans               enable row level security;
alter table shop_subscriptions  enable row level security;
alter table product_categories  enable row level security;
alter table products            enable row level security;
alter table product_variants    enable row level security;
alter table product_media       enable row level security;
alter table product_specs       enable row level security;
alter table scenes              enable row level security;
alter table rooms               enable row level security;
alter table placement_slots     enable row level security;
alter table campaigns           enable row level security;
alter table placements          enable row level security;
alter table shop_follows        enable row level security;
alter table shop_posts          enable row level security;
alter table notifications       enable row level security;
alter table interaction_events  enable row level security;
alter table enquiries           enable row level security;

-- -- Profiles -------------------------------------------------------------
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using (id = auth.uid() or public.is_platform_admin());
drop policy if exists profiles_self_write on profiles;
create policy profiles_self_write on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- -- Reference data, readable by anyone ------------------------------------
drop policy if exists categories_read on product_categories;
create policy categories_read on product_categories for select using (true);
drop policy if exists plans_read on plans;
create policy plans_read on plans for select using (is_active);
drop policy if exists scenes_read on scenes;
create policy scenes_read on scenes for select using (is_published or public.is_platform_admin());
drop policy if exists rooms_read on rooms;
create policy rooms_read on rooms for select using (
  exists (select 1 from scenes s where s.id = scene_id and (s.is_published or public.is_platform_admin()))
);
drop policy if exists slots_read on placement_slots;
create policy slots_read on placement_slots for select using (
  is_active and exists (select 1 from scenes s where s.id = scene_id and s.is_published)
);

-- -- Shops -----------------------------------------------------------------
drop policy if exists shops_public_read on shops;
create policy shops_public_read on shops
  for select using (status = 'active' or public.is_shop_member(id));
drop policy if exists shops_manage on shops;
create policy shops_manage on shops
  for update using (public.can_manage_shop(id)) with check (public.can_manage_shop(id));
drop policy if exists shops_insert on shops;
create policy shops_insert on shops
  for insert with check (auth.uid() is not null);

drop policy if exists shop_members_read on shop_members;
create policy shop_members_read on shop_members
  for select using (user_id = auth.uid() or public.can_manage_shop(shop_id));
drop policy if exists shop_members_manage on shop_members;
create policy shop_members_manage on shop_members
  for all using (public.can_manage_shop(shop_id)) with check (public.can_manage_shop(shop_id));

drop policy if exists shop_subs_read on shop_subscriptions;
create policy shop_subs_read on shop_subscriptions
  for select using (public.is_shop_member(shop_id));

-- -- Products ---------------------------------------------------------------
-- Published products of live shops are visible to everyone; a shop's own
-- members additionally see their drafts.
drop policy if exists products_public_read on products;
create policy products_public_read on products
  for select using (
    (status = 'published' and public.shop_is_live(shop_id))
    or public.is_shop_member(shop_id)
  );
drop policy if exists products_write on products;
create policy products_write on products
  for all using (public.can_manage_shop(shop_id)) with check (public.can_manage_shop(shop_id));

drop policy if exists variants_read on product_variants;
create policy variants_read on product_variants
  for select using (exists (
    select 1 from products p where p.id = product_id and (
      (p.status = 'published' and public.shop_is_live(p.shop_id)) or public.is_shop_member(p.shop_id)
    )
  ));
drop policy if exists variants_write on product_variants;
create policy variants_write on product_variants
  for all using (exists (select 1 from products p where p.id = product_id and public.can_manage_shop(p.shop_id)))
  with check (exists (select 1 from products p where p.id = product_id and public.can_manage_shop(p.shop_id)));

drop policy if exists media_read on product_media;
create policy media_read on product_media
  for select using (exists (
    select 1 from products p where p.id = product_id and (
      (p.status = 'published' and public.shop_is_live(p.shop_id)) or public.is_shop_member(p.shop_id)
    )
  ));
drop policy if exists media_write on product_media;
create policy media_write on product_media
  for all using (exists (select 1 from products p where p.id = product_id and public.can_manage_shop(p.shop_id)))
  with check (exists (select 1 from products p where p.id = product_id and public.can_manage_shop(p.shop_id)));

drop policy if exists specs_read on product_specs;
create policy specs_read on product_specs
  for select using (exists (
    select 1 from products p where p.id = product_id and (
      (p.status = 'published' and public.shop_is_live(p.shop_id)) or public.is_shop_member(p.shop_id)
    )
  ));
drop policy if exists specs_write on product_specs;
create policy specs_write on product_specs
  for all using (exists (select 1 from products p where p.id = product_id and public.can_manage_shop(p.shop_id)))
  with check (exists (select 1 from products p where p.id = product_id and public.can_manage_shop(p.shop_id)));

-- -- Campaigns and placements ------------------------------------------------
drop policy if exists campaigns_scoped on campaigns;
create policy campaigns_scoped on campaigns
  for all using (public.is_shop_member(shop_id)) with check (public.can_manage_shop(shop_id));

drop policy if exists placements_public_read on placements;
create policy placements_public_read on placements
  for select using (
    (status = 'live' and public.shop_is_live(shop_id))
    or public.is_shop_member(shop_id)
  );
drop policy if exists placements_write on placements;
create policy placements_write on placements
  for all using (public.can_manage_shop(shop_id)) with check (public.can_manage_shop(shop_id));

-- -- Engagement --------------------------------------------------------------
drop policy if exists follows_own on shop_follows;
create policy follows_own on shop_follows
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Shops need follower counts, not follower identities; expose that through a
-- view or an aggregate function rather than widening this policy.

drop policy if exists posts_read on shop_posts;
create policy posts_read on shop_posts
  for select using (
    (published_at is not null and visibility = 'public' and public.shop_is_live(shop_id))
    or (published_at is not null and visibility <> 'public' and exists (
      select 1 from shop_follows f where f.shop_id = shop_posts.shop_id and f.user_id = auth.uid()
    ))
    or public.is_shop_member(shop_id)
  );
drop policy if exists posts_write on shop_posts;
create policy posts_write on shop_posts
  for all using (public.can_manage_shop(shop_id)) with check (public.can_manage_shop(shop_id));

drop policy if exists notifications_own on notifications;
create policy notifications_own on notifications
  for select using (user_id = auth.uid());
drop policy if exists notifications_mark on notifications;
create policy notifications_mark on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -- Analytics ---------------------------------------------------------------
-- Anyone may record an event; only the shop may read its own.
drop policy if exists events_insert on interaction_events;
create policy events_insert on interaction_events for insert with check (true);
drop policy if exists events_read on interaction_events;
create policy events_read on interaction_events
  for select using (shop_id is not null and public.is_shop_member(shop_id));

drop policy if exists enquiries_insert on enquiries;
create policy enquiries_insert on enquiries for insert with check (true);
drop policy if exists enquiries_read on enquiries;
create policy enquiries_read on enquiries
  for select using (public.is_shop_member(shop_id) or user_id = auth.uid());
drop policy if exists enquiries_update on enquiries;
create policy enquiries_update on enquiries
  for update using (public.can_manage_shop(shop_id)) with check (public.can_manage_shop(shop_id));

-- =============================================================================
-- 12. READ MODEL
--
-- The app fetches one view instead of assembling six joins in the browser.
-- Shaped to match the catalog.json the Blender pipeline already produces, so
-- the front end can read either source.
-- =============================================================================

create or replace view v_live_placements as
select
  pl.id                as placement_id,
  sc.slug              as scene_slug,
  r.code               as room_code,
  s.slug               as shop_slug,
  s.name               as shop_name,
  s.currency,
  p.id                 as product_id,
  s.slug || '.' || p.slug as qualified_id,
  p.name               as product_name,
  p.description,
  p.category_code,
  p.price_cents,
  p.thumbnail_url,
  v.id                 as variant_id,
  v.model_url,
  v.material_name,
  v.texture_url,
  coalesce(pl.x_mm, sl.x_mm)                 as x_mm,
  coalesce(pl.y_mm, sl.y_mm)                 as y_mm,
  coalesce(pl.z_mm, sl.z_mm)                 as z_mm,
  coalesce(pl.rotation_deg, sl.rotation_deg) as rotation_deg,
  pl.scale,
  pl.note
from placements pl
join scenes sc            on sc.id = pl.scene_id
join product_variants v   on v.id = pl.variant_id
join products p           on p.id = v.product_id
join shops s              on s.id = pl.shop_id
left join placement_slots sl on sl.id = pl.slot_id
left join rooms r         on r.id = sl.room_id
where pl.status = 'live'
  and p.status = 'published'
  and sc.is_published;

comment on view v_live_placements is
  'Everything the 3D app needs to dress a scene, in one read.';

-- Shop dashboard: how the advertising is performing.
create or replace view v_shop_daily_stats as
select
  e.shop_id,
  date_trunc('day', e.occurred_at)                        as day,
  count(*) filter (where e.event = 'placement_view')      as views,
  count(*) filter (where e.event = 'product_click')       as clicks,
  count(*) filter (where e.event = 'product_expand')      as expands,
  count(*) filter (where e.event = 'enquiry_open')        as enquiries,
  count(distinct e.session_id)                            as sessions
from interaction_events e
group by 1, 2;
