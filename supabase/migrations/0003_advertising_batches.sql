-- =============================================================================
-- Advertising batches -- rotating which shops are on show
--
-- THE PROBLEM: there is one house and many shops. Every shop that pays wants
-- its sofa in the living room, and only one sofa fits. Selling the same slot
-- to everyone at once is impossible; selling it to one shop forever means the
-- second shop has nothing to buy.
--
-- THE ANSWER: rotate. A BATCH is a set of shops on show together during a
-- part of the day. Morning shows one batch, afternoon another, and the roster
-- changes daily. Every paying shop gets its turn in the window, and the slot
-- is sold many times over.
--
-- Three rules, each enforced here rather than in application code:
--
--   1. A shop must be SUBSCRIBED to join a batch. Enforced by a trigger, so
--      an admin cannot add a non-paying shop by mistake.
--   2. A batch is live only during its day part, within its date window.
--   3. A placement with NO batch is always live. That keeps existing
--      placements working and lets a scene have permanent fixtures.
--
-- Run after 0002.
-- =============================================================================

do $do$ begin
  if not exists (select 1 from pg_type where typname = 'day_part') then
    create type day_part as enum ('morning', 'afternoon', 'evening', 'all_day');
  end if;
end $do$;

-- =============================================================================
-- 1. BATCHES
-- =============================================================================

create table if not exists ad_batches (
  id         uuid primary key default gen_random_uuid(),
  scene_id   uuid references scenes(id) on delete cascade,
  code       text not null,
  name       text not null,
  day_part   day_part not null default 'all_day',

  -- Optional validity window. NULL start = already running, NULL end = runs
  -- until switched off.
  starts_on  date,
  ends_on    date,

  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  unique (scene_id, code),
  constraint batch_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

comment on table ad_batches is
  'A set of shops shown together during a part of the day. The unit of rotation.';

create table if not exists batch_shops (
  batch_id   uuid not null references ad_batches(id) on delete cascade,
  shop_id    uuid not null references shops(id) on delete cascade,
  added_by   uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (batch_id, shop_id)
);

comment on table batch_shops is
  'Which shops are in a batch. Admin-assigned; subscription-gated by trigger.';

-- A placement can belong to a batch. NULL means always on.
alter table placements
  add column if not exists batch_id uuid references ad_batches(id) on delete set null;

create index if not exists placements_batch on placements (batch_id)
  where batch_id is not null;

-- =============================================================================
-- 2. WHEN IS A BATCH LIVE?
-- =============================================================================

/**
 * Which part of the day is it?
 *
 * Boundaries are deliberately simple and centralised: change them here and
 * every batch follows, rather than hunting for a hardcoded hour in the app.
 */
create or replace function public.current_day_part(at timestamptz default now())
returns day_part language sql stable as $$
  select case
    when extract(hour from at) < 12 then 'morning'::day_part
    when extract(hour from at) < 17 then 'afternoon'::day_part
    else 'evening'::day_part
  end;
$$;

/** Is this batch showing right now? */
create or replace function public.batch_is_live(p_batch uuid, at timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ad_batches b
    where b.id = p_batch
      and b.is_active
      and (b.starts_on is null or b.starts_on <= at::date)
      and (b.ends_on   is null or b.ends_on   >= at::date)
      and (b.day_part = 'all_day' or b.day_part = public.current_day_part(at))
  );
$$;

-- =============================================================================
-- 3. SUBSCRIPTION GATE
--
-- A shop must be paying to be put on show. Enforced in the database so that
-- neither an admin screen nor a script can bypass it.
-- =============================================================================

create or replace function public.check_batch_shop_subscribed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.shop_is_live(new.shop_id) then
    raise exception
      'shop % has no active subscription and cannot be added to a batch',
      new.shop_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists batch_shops_subscribed on batch_shops;
create trigger batch_shops_subscribed
  before insert or update on batch_shops
  for each row execute function public.check_batch_shop_subscribed();

-- =============================================================================
-- 4. SECURITY
-- =============================================================================

alter table ad_batches  enable row level security;
alter table batch_shops enable row level security;

-- Batches are public knowledge: a visitor sees the result, and a shop needs
-- to know when its turn is.
drop policy if exists batches_read on ad_batches;
create policy batches_read on ad_batches for select using (true);

drop policy if exists batches_admin on ad_batches;
create policy batches_admin on ad_batches
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists batch_shops_read on batch_shops;
create policy batch_shops_read on batch_shops for select using (true);

-- Only the platform admin composes batches. A shop cannot put itself on show.
drop policy if exists batch_shops_admin on batch_shops;
create policy batch_shops_admin on batch_shops
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- =============================================================================
-- 5. READ MODEL
--
-- v_live_placements gains the batch filter. Everything downstream -- the 3D
-- scene, the room lists, the shop panel -- rotates automatically, because
-- they all read this one view.
-- =============================================================================

drop view if exists v_live_placements;

create view v_live_placements as
select
  pl.id                   as placement_id,
  sc.slug                 as scene_slug,
  r.code                  as room_code,
  coalesce(sl.room_type, r.room_type) as room_type,
  s.slug                  as shop_slug,
  s.name                  as shop_name,
  s.phone                 as shop_phone,
  s.email                 as shop_email,
  s.currency,
  p.id                    as product_id,
  s.slug || '.' || p.slug as qualified_id,
  p.name                  as product_name,
  p.description,
  p.category_code,
  p.sku,
  p.price_cents,
  case
    when pr.id is null or not public.promotion_is_live(pr.id) then p.price_cents
    when pr.promo_price_cents is not null then pr.promo_price_cents
    when pr.percent_off is not null
      then round(p.price_cents * (1 - pr.percent_off / 100.0))::integer
    else p.price_cents
  end                     as effective_price_cents,
  p.width_mm, p.depth_mm, p.height_mm,
  p.thumbnail_url,
  v.id                    as variant_id,
  v.colour,
  v.model_url,
  v.material_name,
  v.texture_url,
  v.texture_tile_mm,
  pr.label                as promo_label,
  pr.terms                as promo_terms,
  pr.starts_on            as promo_starts_on,
  pr.ends_on              as promo_ends_on,
  (pr.id is not null and public.promotion_is_live(pr.id)) as promo_is_live,
  b.code                  as batch_code,
  b.day_part,
  array(
    select t.room_type::text from product_room_types t where t.product_id = p.id
  )                       as room_types,
  coalesce(pl.x_mm, sl.x_mm)                 as x_mm,
  coalesce(pl.y_mm, sl.y_mm)                 as y_mm,
  coalesce(pl.z_mm, sl.z_mm)                 as z_mm,
  coalesce(pl.rotation_deg, sl.rotation_deg) as rotation_deg,
  pl.scale,
  pl.note
from placements pl
join scenes sc              on sc.id = pl.scene_id
join product_variants v     on v.id = pl.variant_id
join products p             on p.id = v.product_id
join shops s                on s.id = pl.shop_id
left join promotions pr     on pr.id = p.promotion_id
left join placement_slots sl on sl.id = pl.slot_id
left join rooms r           on r.id = sl.room_id
left join ad_batches b      on b.id = pl.batch_id
where pl.status = 'live'
  and sc.is_published
  and public.product_is_active(p.id)
  -- No batch = a permanent fixture. Otherwise it must be this batch's turn.
  and (pl.batch_id is null or public.batch_is_live(pl.batch_id));

comment on view v_live_placements is
  'What is on show RIGHT NOW: active products, from paying shops, whose batch is currently on rotation.';

/** The rotation schedule, for an admin screen or a shop's own dashboard. */
create or replace view v_batch_schedule as
select
  b.id, b.code, b.name, b.day_part, b.starts_on, b.ends_on, b.is_active,
  sc.slug as scene_slug,
  public.batch_is_live(b.id) as live_now,
  count(distinct bs.shop_id) as shop_count,
  count(distinct pl.id)      as placement_count,
  array_agg(distinct s.name order by s.name)
    filter (where s.name is not null) as shops
from ad_batches b
left join scenes sc      on sc.id = b.scene_id
left join batch_shops bs on bs.batch_id = b.id
left join shops s        on s.id = bs.shop_id
left join placements pl  on pl.batch_id = b.id and pl.status = 'live'
group by b.id, b.code, b.name, b.day_part, b.starts_on, b.ends_on,
         b.is_active, sc.slug;
